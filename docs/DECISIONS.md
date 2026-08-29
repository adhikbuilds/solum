# Decisions log

Newest first. One entry per decision. This is the lightweight record — the
canonical, fully-reasoned set of foundational decisions still lives in
`../SOLUM_CONTEXT.md` §3 (the original 19). Entries here extend that history.

Format: date · one-line decision · why (if not obvious) · link to PRD/commit if any.

---

## 2026-08-29 — Massing & Entitlement Study given a PRD, retroactively
The `massing/` + `web/` surface (FastAPI service + React/three.js viewer, `feat/massing-engine`)
had shipped with zero product documentation — no PRD, no entry here, no mention in
`PROJECT_CONTEXT.md` — despite being a real, running second app. Today's bugfixes (floating
render geometry, a silent "0/0" parking claim, an RLV column that didn't vary by storey count)
were built reactively off screenshots before this was written. Locked the missing spec after the
fact so the next change goes through brainstorm → lock → build like everything else. Relationship
to `solum.html` deliberately left open — same job, same RLV formula, different architecture, not
yet decided whether/how they merge. Spec: docs/prd/massing.md.

## 2026-08-07 — Al Mizan demo feedback recorded
First client demo on live credentials. Feedback captured verbatim in
`feedback/2026-08-almizan-demo.md`, with our triage kept separate from their
words. Headline: no number was disputed, so the parking/efficiency/BUA
corrections held. Everything raised is explainability or guidance. Next sprint
leads with labelling every PSF denominator, explaining RLV on screen, and
provenance on agent-entered plot data.

## 2026-07-18 — Astryx question resolved: Path B
Dropped the Astryx design-system association and collapsed the token block to a
single vocabulary (retired the `--pine*` / `--brass-deep` / `--surface2` /
`--sans` / `--mono` / `--fs-xs..kpi` / `--r-*` legacy aliases, 172 usages
rewritten 1:1 to canonical tokens). Behaviour-preserving, no visual change.
See `../SOLUM_CONTEXT.md` §7.

## 2026-07-18 — Product-thinking lives in the repo
Adopted a docs-in-repo workflow (`docs/`) for the brainstorm → decide → PRD →
code loop, rather than splitting thinking into chat/Projects and code into the
repo. Keeps intent and code in one history, no re-transporting. See
`README.md`.

## 2026-07-18 — Strategic context captured in the repo
Added `docs/PROJECT_CONTEXT.md` — the why/vision/competitive-landscape/strategic decision
log (Bloomberg-terminal-for-real-estate thesis, Aprao / JD Console / BCG references, product
identity, roadmap). Kept as a separate doc from `SOLUM_CONTEXT.md` because they sit at
different altitudes (product/strategy vs. build/architecture); cross-linked both ways.
Reconciled the pre-existing Astryx framing in that doc against the Path B decision via inline
`Update (2026-07-18)` annotations rather than rewriting its history. `SOLUM_CONTEXT.md` is
authoritative where the two docs differ on current build state.

## 2026-07-18 — Collaboration protocol: brainstorm by default, gate all writes
Established a working agreement (`docs/WORKING_AGREEMENT.md`): default mode is brainstorm;
reading is always allowed; Claude asks before building (any file write) and separately before
touching git (commit/push/pull). Decisions are flagged, not filed, until "lock it". Signal
words defined ("build it", "commit it", "lock it", "brainstorm only", etc.).

## 2026-07-18 — Simplified git signal to one word: "push it"
Collapsed the two-word git flow ("commit it" then "push it") into a single signal: **"push it"
commits the agreed change and pushes it to GitHub in one step.** The build gate and git gate
stay separate; only the git step is simplified.

## 2026-07-18 — DLD comps: validated live; demo seeds from a UAE Mac (no UAE cloud)
Probed the DLD API live from the UAE and confirmed everything (auth flow a, daily-fresh
feed, numeric-ID filters, m²→ft² math, rooms/reg_type mappings) — see the DLD PRD §4.
Architecture call given the AWS me-central-1 outage (regional conflict): the demo does NOT
need a UAE cloud runner. Frontend (Vercel) + data/read-API (Supabase, Mumbai) are global;
the DLD pull runs **locally from a UAE machine** to seed Supabase. Unattended UAE-cloud
automation (proxy or recovered region) is deferred post-demo. Ingestion is now a local-first
CLI (`node index.mjs backfill`) that keeps the Lambda export for later.

## 2026-07-18 — Real demo auth via Supabase Auth (retires the fake login)
Decided to replace the presentational login (PROJECT_CONTEXT §6.7) with real **Supabase
Auth** — one shared demo credential (pre-filled on screen for easy demoing), real JWT
session, persisted across refreshes. Gate **both** the UI and the data: RLS tightened from
`using (true)` to `authenticated`, so the Supabase API returns nothing without a session.
Stays single-file (supabase-js from CDN). Ships **with** Phase 2 frontend work — the RLS
migration must land together with the frontend auth or reads break. Spec: docs/prd/auth-demo.md.

## 2026-07-18 — Market Insights layer locked (DLD market intelligence)
Locked a Market Insights feature — the market-intelligence pillar of the terminal vision
(§7), powered by the loaded DLD data, no new infra (Postgres RPC/views + single-file charts).
v1 = 3 high-signal charts (price trend, velocity heatmap, off-plan share) in two placements
(contextual panel on the plot + standalone Market view). Guardrails: velocity ≠ absorption
(no inventory data), as-of dating, thin-slice suppression, outlier trim. Geo choropleth is a
flagged optional upgrade (needs boundary GeoJSON). Ships after Phase 2. Spec: docs/prd/market-insights.md.

## 2026-07-19 — Plots persist in Supabase (retire browser-only storage)
Plots now live in a `plots` table (migration `0004_plots.sql`) keyed to the signed-in
user via RLS, instead of only in the browser's localStorage. A client's plots follow
them across devices and refreshes. Chose a **single `jsonb` blob per plot** (matches the
app's in-memory state, ships fastest; normalize to typed columns later if reporting needs
it). localStorage stays as an offline cache + fallback so the demo never hard-fails on a
network blip. Plot loading moved into `enterApp` (post-auth) so the per-user query runs
with a session. `last-opened` stays local (per-device UI preference).

## 2026-07-19 — Fetch plot details by number from the DDA register (server-side)
Added "type a plot number → auto-fill" as the primary new-plot path, replacing reliance on
PDF+OCR (kept as a fallback). Source: the DDA GIS ArcGIS layer
`DDA/BASIC_LAND_BASE/MapServer/2` ("Plot"), which is public (no token) and returns clean
attributes by `PLOT_NUMBER` (AREA_SQFT, GFA_SQFT, MAX_HEIGHT_FLOORS, MAIN_LANDUSE, etc.).
Runs **server-side** via a Vercel function (`api/plot.js`): the browser calls its own origin
`/api/plot?number=…`, which proxies DDA. This dodges CORS and — critically — works behind the
client's locked-down / isolation browser, which blocks file uploads and third-party CDNs. GFA
is a real attribute here, so plots the PDF marked "See Notes" resolve. Unmapped fields
(project, developer, land-use detail, general notes, frozen status) fold into the plot's notes.

<!-- Add new entries above this line. Newest first. -->
