# PRD — Market Insights (DLD market intelligence layer)

- **Status:** Draft (locked for build after Phase 2)
- **Date:** 2026-07-18
- **Owner:** DKubadia
- **Related:** `PROJECT_CONTEXT.md` §7 (market-intelligence pillar of the terminal vision), §8 (absorption parked — respected here); builds on the DLD data from `dld-comps-integration.md`.

---

## 1. Problem / why now

Solum answers "should I buy *this plot*." It doesn't yet show the **market around it** —
where prices are rising, where activity is concentrated, how a community compares. That
context is what turns a verdict into a *defensible* verdict, and it's the first visible step
from a single-plot tool toward the "market terminal" end-state (§7). We now have 162K real
DLD sales rows to power it, so it's buildable with no new infrastructure.

## 2. Scope — v1 is three high-signal charts, two placements

Deliberately focused: **3 charts** that punch hardest for a land investor, not a sprawling
dashboard (a viz must earn its space — §6.9).

**The three charts:**
1. **Price trend** — monthly median price/ft² over the window, line/area. Overall and
   filterable to a community. The single most investor-relevant view: *is the market up or down.*
2. **Velocity heatmap** — transactions per community per month (community × month matrix,
   colour = count). *Where properties are actually selling.* This is **sales velocity /
   activity**, explicitly **not** absorption (see §4).
3. **Off-plan share** — % of sales that are off-plan vs ready, by community and/or over time.
   A sharp signal of speculative vs. end-user demand.

**Two placements:**
- **(a) Contextual market panel on the plot (primary).** For the plot's community, show its
  price trend, velocity, and off-plan share next to the verdict — enriches the core buy loop.
- **(b) Standalone "Market" view (showpiece).** A dedicated tab to explore all 68 communities
  — the heatmap, rankings, trends. The terminal move; the demo centrepiece.

## 3. Data & architecture (no new infra)

- All charts compute from the loaded `dld_transactions` via **Postgres RPC functions / views**
  (same pattern as the comps RPC) — e.g. `market_price_trend(area_id, window)`,
  `market_velocity()`, `market_offplan_share(area_id)`. Frontend calls `supabase.rpc(...)`.
- Charts render **in the single HTML file** — SVG / lightweight, following the dataviz
  principles and Solum's `:root` token system (accent-monochrome; the verdict palette stays
  reserved). No heavy chart dependency unless justified.
- Reuses the authed `supabase-js` client (RLS-gated, post-auth).

## 4. Honesty guardrails (the line between insight and dazzle)

- **Velocity ≠ absorption.** We have *sold* transactions, not inventory/listings, so we show
  activity/velocity, never an absorption rate. Label it as such.
- **As-of dating** — every view states the DLD window it's built on (same as comps).
- **Thin-slice suppression** — a community/month with too few sales (e.g. < 5) is greyed or
  labelled "insufficient data", not drawn as a confident trend.
- **Outlier trimming** — same P5–P95 treatment as comps before any median/price stat.

## 5. Out of scope (v1)

- **True absorption / demand modelling** — needs supply/inventory data we don't have (§8).
- **Geographic choropleth map** — the highest-"wow" version, but needs Dubai community
  boundary GeoJSON (an extra dataset). v1 uses the matrix heatmap / ranked bars, which carry
  the same signal with zero geo work. Map is a flagged **optional upgrade**, not v1.
- Comparable-project drill-down, forecasting, alerts — later.

## 6. Acceptance check

- Price trend for a known community (e.g. Business Bay) shows a sensible monthly curve that
  matches the known market direction; thin months are suppressed.
- Velocity heatmap highlights the genuinely active communities (JVC, Business Bay, Dubai
  Marina, etc.) and is clearly labelled velocity, not absorption.
- Off-plan share reads plausibly (off-plan-heavy communities show high shares).
- Every view shows its as-of window; no chart implies live/real-time or absorption.
- `solum.html` structural checks still pass (token graph, blue-swap acid test, JS syntax,
  tag balance).

## 7. Sequencing

Ships **after Phase 2** (auth + comps). Phase 2 proves the core loop; Market Insights is the
enrichment/showpiece on top of the same data + RPC pattern. Build order within this PRD:
RPC/views → the 3 charts → contextual panel → standalone Market view.
