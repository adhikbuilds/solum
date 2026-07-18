# PRD — DLD comps integration (sourced market data)

- **Status:** Draft
- **Date:** 2026-07-18
- **Owner:** DKubadia
- **Related:** `PROJECT_CONTEXT.md` §3 (provenance), §6.2 (accuracy problem), §7 (vision), §8/§10 (parked DLD work); `SOLUM_CONTEXT.md` §4 (provenance tiers), §6 (scope)

---

## 1. Problem / why now

Solum's optimiser today pushes toward whatever min/max bands and prices the user typed by hand — so the "recommended mix" is really the user's own guess wearing a profit label (`PROJECT_CONTEXT.md` §6.2). Every pricing/sizing input is tagged **"modeled"** because there's no real market source behind it.

We now have production access to the **Dubai DLD "Real Estate Transactions" dataset** via the data.dubai (DDA iPaaS) API. Wiring it in is the single highest-leverage upgrade on the roadmap: it replaces guessed unit pricing and sizing with **real, aggregated transaction comps**, and flips the provenance badge from **modeled → sourced** — honestly, only where the data actually supports it.

## 2. What it does (scope)

When a user sets up or opens a plot:
1. They pick a **community** from a constrained typeahead of real DLD locations (no free-text — see §7).
2. Solum fetches **sourced comps** for that community (and optionally project/building, unit type, off-plan vs ready): average **price per ft²**, typical **unit size**, and sample size.
3. Those pre-fill the **Unit Matrix** pricing/sizing fields, and the provenance badge on each flips to **"sourced"**, with a one-line basis (*"42 ready-unit sales in Jumeirah Village Circle, last 12 months"*).
4. If the location has too few transactions to be trustworthy, Solum **stays "modeled"** and says why — it never averages three sales and calls it market truth.

This is a **data + provenance** feature, not an optimiser change. The optimiser keeps working exactly as it does; it just receives sourced inputs instead of guesses.

## 3. Architecture (forced by the geofence)

The DLD API is **UAE-geofenced** ("inaccessible outside the country") and Supabase has **no UAE region** (closest: Mumbai). So the DLD-facing call cannot originate from Supabase. Three components, each doing only what it uniquely can:

```
①  AWS Lambda (me-central-1, UAE)  ──scheduled, geofenced──►  data.dubai API
        │  upsert rows (service key)
        ▼
②  Supabase (Mumbai)  — Postgres comps + read-only Edge Function + Auth (later)
        ▲  read (anon key, no geofence)
③  Vercel  — solum.html  ──fetch JSON──►  Supabase Edge Function
```

- **① is the only UAE-egress component.** It runs on the AWS Activate credit. Its code (token → paginate → upsert) is host-agnostic; only the deploy wrapper is AWS-specific.
- **② and ③** never touch DLD, so no geofence and no rate-limit exposure on the user path.

## 4. DLD API integration details

- **Data endpoint (resolved):** `GET https://apis.data.dubai/open/dld/dld_transactions-open-api` with `Authorization: Bearer <token>`. Query params: `filter` (and/or conditions), `column` (limit attributes), `limit`, `page`/`pageSize`, `order_by`, `order_dir`, `offset`. Returns `{results: [...]}`, **1000 rows/page**.
- **Auth — TWO documented flows; confirm empirically (from a UAE IP) which our creds use:**
  - **(a) data.dubai / DDA iPaaS** (the API-guide PDF): `POST https://apis.data.dubai/secure/ssis/dubaiai/gatewaytoken/1.0.0/getAccessToken`, JSON body `{grant_type, client_id, client_secret}` + header `x-DDA-SecurityApplicationIdentifier` → `{access_token, expires_in: 3600}`.
  - **(b) Dubai Pulse** (the dataset page's "How to use"): `POST https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken?grant_type=client_credentials`, form body `client_id={key}&client_secret={secret}`, token ~30 min.
  - Our creds include an `x-DDA-SecurityApplicationIdentifier`, pointing to **(a)**; (b) is likely legacy portal text. Test both in Phase 1. Token cached and refreshed just before expiry either way.
- **Dataset facts:** source = **Dubai Land Department**; **~598,907 rows**; format csv; no personal info (DNRD).
- **Freshness — do NOT trust the metadata; verify empirically.** The portal shows "Frequency of Update on Source: Daily" but "Frequency of Update to Platform: Annually" — *contradictory*, and "Last updated" was 2026-07-17 (i.e. yesterday), which is inconsistent with a truly annual refresh. **Actual API freshness is unknown until measured.** Resolution: the ingestion's **first step is a freshness probe** — `GET ...?order_by=instance_date&order_dir=desc&limit=1` → read the newest `instance_date`. Ingestion is **incremental by `instance_date`**, so a daily schedule is cheap even if the data turns out fresh. Cadence is set from what the probe observes, not from the metadata field.
- **Query syntax (from portal examples):** `filter=col=val AND col2=val2` (AND/OR supported) · `column=a,b,c` (limit attributes) · `limit=` · `order_by=col&order_dir=asc|desc` · `offset=`. Auth header in the examples is `Authorization: <token>` **raw (no `Bearer` prefix)** — the data.dubai PDF says `Bearer <token>`; confirm which in the probe.
- **Constraints to design around:** UAE-only egress · **60 req/min** · **30s timeout** · 1000 rows/page · token ~30–60 min · credentials do not expire.
- **✅ CONFIRMED against live data (2026-07-18):** auth flow **(a)** works (Bearer + `x-DDA`); feed is **daily-fresh** (newest `instance_date` was 2 days old — the "annually" metadata was wrong); filters need **numeric IDs** (`trans_group_id=1` Sales, `property_type_id=3` Unit, `property_sub_type_id=60` Flat — text literals are rejected; "Unit" without the Flat filter includes Office/Shop/Hotel and skews price/ft²); `reg_type_id` 0=offplan / 1=ready; `rooms_en` = "Studio" / "N B/R"; data spans **2014→now** so a recency window is mandatory; m²→ft² math cross-checks exactly (`actual_worth ÷ size ≈ meter_sale_price ÷ 10.7639`).

### Columns we use (from the attribute-details sheet)

| Column | Use |
|---|---|
| `area_name_en`, `area_id` | Community — location key & constrained input |
| `project_name_en`, `building_name_en` | Sub-community grain |
| `meter_sale_price` | Price per **m²** → convert to ft² |
| `procedure_area` | Size in **m²** → convert to ft² |
| `actual_worth` | Total transaction price (cross-check) |
| `rooms_en` | Unit type (Studio/1BR/2BR/3BR) after normalisation |
| `reg_type_en` | Off-plan vs existing (ready) split |
| `trans_group_en` | Filter to **Sales** (exclude Mortgages/Gifts) |
| `property_type_en`, `property_sub_type_en` | Unit/villa/land; apartment/shop… |
| `instance_date` | Transaction date — recency (DD-MM-YYYY) |
| `transaction_id` | Primary key — dedupe/upsert |

## 5. Data model (Supabase Postgres)

- **`dld_locations`** — canonical `area_id`, `area_name_en`, `area_name_ar`, aliases[] (e.g. "JVC"), plus rollups of project/building names seen. Powers the constrained typeahead. `pg_trgm` index for fuzzy search-in-box.
- **`dld_transactions`** — deduped raw sales rows we care about, keyed on `transaction_id`, with a computed `price_per_sqft`, `size_sqft`, normalised `unit_type`, `reg_type`, `instance_date`, `area_id`. Sales/Unit only (keep the ingestion filtered so we don't store the whole registry).
- **`comps_aggregates`** (materialised) — per `(area_id, unit_type, reg_type, window)`: median price/ft², median size, sample count, last-refreshed. This is what the read API serves — fast, no per-request crunching.
- **`ingestion_runs`** — run metadata (started, rows, max `instance_date` seen) for incremental pulls and observability.

## 6. Location resolution (constrained input)

Primary design: **selection, not matching.** The user searches a typeahead served from `dld_locations` (shipped to the browser as a small cached list — a few KB, filtered in-memory, zero per-keystroke latency) and **picks a real community**. Guarantees an exact join; no typo-driven empty results.
- **Alias-assisted search** ("JVC" surfaces Jumeirah Village Circle) lives in the *search box*, not a backend guess.
- **Cascade:** community → project/building (finer grain) where data supports it.
- **Hierarchical fallback:** if project/building grain is thin, fall up to community and label the grain used.
- **Modeled escape hatch:** a plot in an area with no DLD coverage isn't blocked — it runs on modeled assumptions, clearly tagged. Constrain the *comps path*, not the whole tool.

## 7. Aggregation methodology (the part that makes "sourced" honest)

Decisions to lock — this is where sourced data becomes trustworthy or becomes a dressed-up guess:
1. **Filter (numeric IDs):** `trans_group_id=1` (Sales) AND `property_type_id=3` (Unit) AND `property_sub_type_id=60` (**Flat**). The sub_type filter is essential — "Unit" also includes Office/Shop/Hotel Apartment/Hotel Rooms, which have very different price/ft² and would pollute the comps (confirmed in the real sample).
2. **Units:** convert `meter_sale_price` and `procedure_area` from m² to ft² at ingestion (1 m² = 10.7639 ft²). Whole app stays in ft².
3. **Unit-type mapping:** normalise `rooms_en` → {Studio, 1BR, 2BR, 3BR, 4BR+}. Persist the mapping table.
4. **Off-plan vs ready:** split on `reg_type_id` (0=offplan, 1=ready); default the comp to **ready** unless the plot is explicitly off-plan (off-plan and ready price differently).
5. **Recency:** default window **last 12 months**; optional recency decay (weight recent sales higher) as a later refinement.
6. **Statistic — robustify, then weight (not a plain median or plain mean).** A plain weighted mean captures relevance/recency but one penthouse sale skews it; a plain median is robust but blind to relevance. So: **(a)** trim outliers first — drop price/ft² outside ~P5–P95 of the slice (or beyond N MADs from the median); **(b)** on the cleaned set compute a **relevance- and recency-weighted mean** of price/ft². Weight = recency-decay (exponential, half-life ~9–12 months) × size-proximity (Gaussian on |comp size − target size|) × location-grain (same building > project > community). Report the weighted value **plus** effective sample size and the P25–P75 spread so dispersion stays visible. Fully tunable — this is the start of the "model rigor" track (`PROJECT_CONTEXT.md` §10).
7. **Sample-size floor:** stamp **"sourced"** only when n ≥ **a threshold (proposed 10)** for the exact (community × unit-type × reg-type) slice. Below that, fall up the hierarchy; if still below, stay **"modeled"** with the reason shown.
8. **Outliers:** trim obvious garbage (e.g. price/ft² outside a sane band) before aggregating.

## 8. Provenance rules

- Sourced tier shows a **basis line**: n transactions · community (and grain) · window · matched-from. That line is what makes the badge trustworthy, not decorative.
- **State the as-of date** (from the observed newest `instance_date`, not a metadata field): "DLD transactions through <date>". Only claim "live/daily" if the freshness probe actually shows daily-fresh data. A guaranteed-live feed is a separate, paid source (§8 of `PROJECT_CONTEXT.md`).
- Never silently upgrade to sourced below the sample floor. "Modeled — only 4 comps in this slice" beats a confident wrong number.

## 9. Ingestion contract (① AWS Lambda, me-central-1)

- **Step 0 — freshness probe:** newest `instance_date` via `order_by=instance_date&order_dir=desc&limit=1`. Logs how fresh the feed really is and sets the cadence.
- **Cadence: set from the probe.** Ingestion is incremental, so **daily is cheap** if the data is daily-fresh; drop to weekly/monthly if the probe shows it rarely moves. Full backfill (~599K rows ≈ ~600 pages @ 1000/page) is a one-time bulk load, well within limits.
- Token refresh → paginate (respect 60/min, 1000/page, 30s) → filter to Sales/Unit → transform (m²→ft², normalise rooms) → **upsert by `transaction_id`** into Supabase via the service key → rebuild `comps_aggregates` → write `ingestion_runs`.
- **Incremental:** after the initial backfill, pull only rows newer than the last run's max `instance_date`.

## 10. Security / secrets

- **DLD creds** (`client_id`, `client_secret`, `x-DDA-SecurityApplicationIdentifier`) live **only** in the Lambda's env / AWS Secrets Manager — never in git, never in the frontend.
- **Supabase service key** — only in the Lambda (write path).
- **Supabase anon key** — public, safe in `solum.html` (read path, RLS-guarded).
- Given the prod creds have passed through chat, **rotate them** once the pipeline is set up.

## 11. Impact on `solum.html` (stays single-file)

Additive only: a small fetch layer that calls the Supabase Edge Function for comps and pre-fills existing Unit Matrix fields; the provenance badge component already exists (§3 provenance). No framework, no architecture change. When live-data features are on, the app depends on the network + its Vercel origin (already handled).

## 12. Explicitly out of scope (this PRD)

Full absorption modeling · IRR/cashflow · multi-market · rent/mortgage analysis (Sales first; `rent_value`/`meter_rent_price` later) · real auth (separate track) · moving the app DB to AWS UAE for data residency (a strategic phase-2, not now).

## 13. Acceptance check

- Pick a well-known community (e.g. Jumeirah Village Circle) → sourced median price/ft² **sanity-checks against known market values**; provenance flips to "sourced" with a correct basis line.
- A thin/empty community → **stays modeled**, with the reason shown; the plot still runs.
- Ingestion: a scheduled run backfills, then incrementally adds, dedupes on `transaction_id`, and rebuilds aggregates; `ingestion_runs` reflects it.
- `solum.html` structural checks still pass (token graph resolves, blue-swap acid test clean, JS syntax, tag balance).

## 14. Phasing

1. **Backfill + storage** — ① Lambda + Supabase schema; get real rows in `dld_transactions` + `comps_aggregates`.
2. **Read API + location list** — Edge Function `/comps`; generate the cached `dld_locations` list.
3. **Frontend wiring** — typeahead, pre-fill, provenance flip, basis line.

## 15. Open questions

- ~~Dataset path, real freshness, auth flow, filter syntax, rooms values~~ **ALL RESOLVED** via a live probe on 2026-07-18 (see §4 CONFIRMED).
- **Demo hosting/ingestion:** frontend on **Vercel**, data + read API on **Supabase (Mumbai)** — both global, unaffected by the UAE cloud outage. Seed Supabase by running the ingestion **locally from a UAE Mac** (`node index.mjs backfill`). Unattended UAE-cloud automation is deferred post-demo (AWS me-central-1 is down from the regional conflict; a UAE proxy or recovered region comes later).
- Tune the weighted-aggregation knobs against the **real price distribution** once seeded: **sample floor** (proposed 10), **recency half-life** (proposed 9–12 mo), **outlier trim** (proposed P5–P95).
- `4BR+`/penthouse exact `rooms_en` strings — confirm when they appear in the seed.
