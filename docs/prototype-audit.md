# Prototype audit — and corrections to earlier claims

Source: `github.com/DKubadia/solum`, fetched 2026-08-11 as the `prototype` remote. It is **not
merged** — kept as a reference ref so its formulas can be read without dragging a 218KB HTML file
and an unrelated history into this tree.

```bash
git fetch prototype
git show prototype/main:supabase/migrations/0002_comps_rpc_and_rls.sql
```

This document exists because I got things wrong before reading it. Everything I claimed from
black-box inspection of the deployed page is corrected below.

---

## 1. Three claims I made that were wrong

### "RLS may be off — anyone viewing source could read every client's plot data"

**Wrong, and I flagged it as urgent. It isn't a risk.**

`0002_comps_rpc_and_rls.sql` enables RLS on `dld_locations`, `dld_transactions` and
`comps_aggregates`, with `FOR SELECT TO authenticated USING (true)` — anon gets nothing.
`0004_plots.sql` enables RLS on `plots` with all four policies scoped `user_id = auth.uid()`.
The publishable key in the page source is doing exactly what a publishable key is for.

### "No transactions table, so comparables cannot be derived from data"

**Wrong.** `dld_transactions` exists with `area_id`, `unit_type`, `price_per_sqft`, `size_sqft`,
`instance_date`, alongside `dld_locations`, `comps_aggregates` and `area_aliases`. Al Mizan's
feedback references roughly 4,000 transactions.

My grep counted client-side `.from('…')` calls, which cannot see an RPC. Comparables come from
`get_comps(area_id, months)`, invoked server-side. **Black-box inspection of a page is not a
substitute for reading the schema** — the lesson generalises.

### "No model of any kind"

**Overstated.** There is no fitted statistical model, which is true and was the substance of the
point. But `get_comps()` is a real method, not a hardcoded number:

- P5–P95 outlier trim **per unit type**
- recency weighting on a **one-year half-life** (`power(0.5, age_days / 365.0)`)
- weighted mean price per sqft, median unit size, sample count
- 24-month default window

That is defensible methodology and it is the most valuable thing in the prototype. It is now ported
into [`packages/db/migrations/0003_comps_method.sql`](../packages/db/migrations/0003_comps_method.sql)
as `comps_by_unit_type()`.

What remains true: the *comparable off-plan launches* panel is separate from this, carries a
`COMING SOON` badge, and its three project names are literals. Two different things sat next to each
other on one screen and I conflated them.

---

## 2. What the prototype has that I did not credit

| | |
|---|---|
| DLD ingestion | `ingestion/dld-ingest/index.mjs` — a working ingest path exists. **The DLD data question I kept raising as a blocker is at least partly solved.** |
| 7 migrations | dld_comps, comps RPC + RLS, market_insights, plots, market_trend_area, comps_size_mean, area_aliases |
| Provenance vocabulary | `sourced` / `modeled` tiers, "from DDA" / "from PDF" tags already in the UI |
| Written PRDs | `dld-comps-integration`, `light-hbu`, `market-insights`, `auth-demo` |
| Competitor analysis | `market-inspirations/` — AIRE, Land Sterling, design teardowns, anti-patterns |
| Decision log | `docs/DECISIONS.md`, `docs/PROJECT_CONTEXT.md`, `SOLUM_CONTEXT.md` |
| Brand assets | full logo set and favicon |

---

## 3. What is genuinely missing — and it is what you asked for

| Gap | Evidence | Addressed here |
|---|---|---|
| **No org or workspace tenancy** | `plots.user_id = auth.uid()`. Per-user only. Two analysts at the same developer cannot see one pipeline. | `organisations`, `memberships`, `workspaces`, RLS by `organisation_id` |
| **No appraisal history** | A plot is one `data jsonb` blob with `updated_at`, overwritten in place. Yesterday's view is gone. | `appraisals` → `assumption_sets` (immutable) → `results` |
| **No snapshot pinning** | `get_comps()` runs live against `current_date`, so a saved plot silently re-prices as data moves. | `comparable_snapshots`, pinned by `appraisals.comparable_snapshot_id`; `comps_by_unit_type()` takes `p_as_of` and never reads the clock |
| **No engine version on results** | Nothing records which formulas produced a number. | `results.engine_version` |
| **No derivation trace** | Al Mizan's top ask (items 1, 4, 8, 9) is explainability. | `results.trace`, produced by `packages/engine` |
| **Calculation in the browser** | 218KB single HTML file, no build step. | `packages/engine` — pure, versioned, 46 tests |

---

## 4. The client feedback is the most important document in the repo

`docs/feedback/2026-08-almizan-demo.md`, dated 2026-08-07. Read it in full. Their own triage note is
the key line:

> Not one item in this list is a bug report. Nothing came back as "your number is wrong" […] What
> came back instead is almost entirely **explainability and guidance**. Items 1, 4, 8 and 9 are the
> same request in four forms: *tell me what this means and what to do about it*.

**This reframes the Cowork analysis.** That session treated a verdict bug and a price-above-comps
contradiction as the things losing the account. The client never raised either. What they asked for
is exactly what the trace was built for — so the work is aligned, but for a different reason than I
argued, and the priority order should follow their list rather than mine.

Bucket 1 from their triage, blocks trust:

1. **Label every PSF with its denominator.** Sale PSF is per sqft saleable, construction PSF is per
   sqft BUA, land PSF is per sqft of plot. Three denominators on one screen, none labelled.
2. **Explain residual land value on screen** — definition and arithmetic.
3. **Provenance on plot inputs** — separate authority data from agent-entered data. They flagged a
   real risk: an agent states GFA, the authority later says lower.

Bucket 2, blocks use: 4BR as a unit type; segment-aware comparables (their heuristic: top 5% of
transactions = luxury); timeline and payment plan asked at plot creation; and *"this plot does not
work — here is what would make it viable."*

Their explicit warning against building the AI layer first:

> A chatbot that adjusts assumptions is worth nothing if the underlying assumptions are not yet
> trustworthy or explainable. **Fix the explainability by hand first.**

### The strategic idea worth more than any feature

Item 13 and their closing insight: **FAR drives timeline, timeline drives capital rotation, so IRR
and not ROI is the comparison that matters.** A smaller low-FAR plot can beat a larger high-FAR one
through lower construction cost, faster completion and earlier cash recovery. The prototype ranks by
ROI at a fixed 30-month timeline.

This is the same conclusion the cashflow work reaches from the other direction, and it is why
`irr()` is already built and tested. Cheap first step, per their own note: make timeline a function
of floors and basements rather than a constant, and lead with IRR on Compare.

---

## 5. Open questions carried over from their triage

- Better comparables (items 3, 7) or the failure-recommendation engine (item 4) first? Both are
  bucket 2 and they cannot be done at once.
- Is positioning (luxury / mid / affordable) known at plot stage, or decided from the analysis? That
  determines whether `comparable_snapshots.segment` is an input or an output.
- **Did Al Mizan reconcile any of it against their own Excel?** Their note calls this "the single
  most important unknown." It still is.
