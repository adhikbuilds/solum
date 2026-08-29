# PRD — Massing & Entitlement Study

- **Status:** Draft
- **Date:** 2026-08-29
- **Owner:** Adhik Agarwal
- **Related:** `PROJECT_CONTEXT.md` §2 (Solum's core job), §6.9 (viz must earn its space — "How it could
  look" was cut once before for exactly this reason), §8 (parked items this must not silently
  re-open); `feasibility.py`'s own docstring (RLV formula ported unchanged from `evalMix()` in
  `solum.html`, see §3 below).

---

## 0. Why this PRD exists, written retroactively

This feature already exists and is already running (`massing/` + `web/`, `feat/massing-engine`
branch) — this is **not a proposal to build something new**, it is the missing spec for
something that got built without one. It shipped as a sequence of ad-hoc fixes off screenshots
(floating context buildings, a 0/0 parking claim, an RLV column that didn't vary by storey count),
each individually correct, none of them checked against a written scope. That is the exact
failure mode `WORKING_AGREEMENT.md` exists to prevent ("lock the decision before you execute
it") and it has been in effect for as long as this surface has existed with no entry in
`DECISIONS.md` and no mention in `PROJECT_CONTEXT.md`'s roadmap. This PRD is that lock, applied
after the fact, so the next change to this page goes through the same loop every other Solum
feature does: brainstorm → lock → build.

## 1. Problem / why now

`solum.html` answers "given a unit mix I pick, what's this land worth" — the mix is a
starting-point guess the optimizer refines, not something derived from what the plot is legally
allowed to hold. It has no notion of setbacks, storey limits, or plot coverage at all. A user can
happily price a mix that no building code on that plot would let them build.

Massing closes that gap from the other end: **given a plot's actual DDA entitlement (permitted
GFA, height limit, setbacks, parking rule), what can legally be built, and what is the best of
those options worth?** It shares Al Mizan's real job — pursue/negotiate/pass on land — but starts
from regulation instead of a typed-in guess, and its RLV formula is deliberately the same one
`solum.html` uses (`feasibility.py`: *"ported from `evalMix()`... deliberately unchanged, so a
number produced here reconciles with the number the prototype has been showing Al Mizan"*), so
the two tools agree rather than compete on what a plot is worth.

**Why now, specifically:** DDA publishes this data for 44.8% of Dubai's registered projects
(measured against the RERA register, 2026-08-29) — the largest single authority, covering
permitted GFA, height, all four setbacks, plot coverage, and the parking rule, all machine
readable. That is the fact that makes this buildable without a domain expert hand-encoding zoning
tables per district: read the regulation, don't encode it.

## 2. What it does (scope, as currently shipped)

Given a DDA plot number (or the bundled demo fixture):

1. **Read the regulatory envelope** from DDA's own parcel layer — plot area, permitted GFA,
   max storeys, all four setbacks, plot coverage cap (rare — see §7), parking rule. Every figure
   carries a `Sourced[value, provenance, basis]` tag; nothing is silently assumed (`dda.py`).
2. **Derive the buildable envelope** — the parcel polygon minus setbacks. DDA does not state
   which of its four setbacks applies to which edge, so this is reported as a **range**
   (conservative = every edge at the largest published setback; optimistic = smallest), never a
   single guessed number (`envelope.py`).
3. **Enumerate massing candidates**, one per storey count from 1 to the published max, each the
   optimal footprint for that height (`permitted GFA ÷ floors`, capped by the envelope and by a
   published plot-coverage limit when one exists) — not a genetic search, because the ceiling is
   published, not discovered (`massing.py`).
4. **Decompose each candidate into basement/podium/tower levels** — basements sized from the
   authority's own parking rule (the one honest anchor for "how deep does this go", since DDA
   does not publish podium setbacks), podium only above 6 storeys, tagged `assumption`
   throughout (`scheme.py`).
5. **Price each candidate** — the shared RLV formula, now varying by storey count via a
   documented podium construction premium (added 2026-08-29; see §4).
6. **Render it** — real 3D geometry (not a diagram): the parcel, both envelope bounds, the
   selected candidate's basement/podium/tower slabs, the DDA-published neighbouring parcels
   at their own permitted height for site context, per-layer labels, and a north arrow
   (`solid.py`, `Scene.tsx`).
7. Surface a **feasibility panel and a sortable candidate table** (React/Vite `web/`), ranked by
   residual land value, with every figure's provenance visible.

## 3. Explicitly out of scope

Cross-checked against `PROJECT_CONTEXT.md` §8's parked list — nothing here should silently
re-open what was deliberately deferred there:

- **Facade/architectural detail** (banding, mullions, roof plant, articulated massing beyond
  rectilinear blocks). `scheme.py`'s own line draws this boundary: *"a podium would be invented
  detail"* below the point the data justifies one. Stay on the data-driven side of that line.
- **IRR / cashflow / debt structuring** — same reasoning as `PROJECT_CONTEXT.md` §8: a metric
  that can output nonsense (Aprao's 912% IRR) is a liability, not a feature.
- **Full absorption modeling** — no supply/inventory data behind it yet, same as the parked
  toggle in `solum.html`.
- **Photorealistic or third-party 3D basemaps** (Google 3D Tiles, Mapbox, Cesium) — evaluated
  2026-08-29 and declined for v1: each is a paid/metered API or has materially weaker Dubai
  coverage than DDA's own registry, which is already free, real, and the direct source of the
  entitlement numbers this tool exists to show. Revisit only if a client-facing demo specifically
  needs photorealism the block-massing view can't provide.
- **The non-DDA 55.2% of the market** (Trakhees, Dubai Municipality, Dubai South, DSO) — a known,
  named gap (`dda.py`), not silently papered over. A plot under another authority should fail
  loudly (`LookupError`), never fall back to a guessed DDA-shaped answer.
- **Merging with `solum.html`** — not decided here. See §9.

## 4. Design decisions locked today (2026-08-29)

These were made ad hoc during today's bugfix pass and are recorded here so they don't drift
unrecorded a second time:

- [x] Context buildings and every level slab render grounded at their true elevation (`base_m`),
      not offset by their own height/depth — verified against the panel's own depth number, not
      "looks right." (`Scene.tsx`)
- [x] A plot with no published parking rule shows **"–"**, never **"0 / 0"** — a null result must
      never render as a claim of zero — and the panel states plainly that the RLV excludes
      parking cost when this is true.
- [x] A podium scheme (>6 storeys, `scheme.py`'s own threshold) carries a **12% construction
      cost premium**, tagged `assumption`, not attributed to any specific cost report — added
      because `appraise()` did not vary by floor count at all, so every storey option priced
      identically and "best" meant nothing but "fewest floors." Deliberately conservative
      (low end of what such a step plausibly costs) so it cannot manufacture a case for building
      taller than the data supports.
- [x] Per-layer leader-line labels (one per basement/podium/tower group, not per storey) plus a
      north arrow, using the same ring-coordinate → world mapping the render fix relies on.
- [ ] **Not yet decided:** whether the podium premium should scale with storey count above the
      threshold rather than being a flat step, once a second reference plot is available to
      sanity-check it against.

## 5. Architecture

```
DDA ArcGIS layer (public, no token)
        │  fetch_plot() / fetch_context()
        ▼
massing/solum_massing/  — pure Python: dda → envelope → massing → scheme → feasibility → solid
        │
        ▼
massing/service/main.py  — FastAPI, one impure boundary (the DDA fetch); everything downstream
        │                  is a pure function over the fetched record (reproducible: same plot
        │  JSON            record → same candidates → same money, every time)
        ▼
web/  — React + Vite + react-three-fiber, served from the same FastAPI origin (no CORS story)
```

No database, no auth, no persistence — a study is computed fresh per request from DDA + the
pure engine. This is a materially different architecture from `solum.html` (single static file,
`window.storage`, no server) and from the Supabase-backed comps/auth work in the other PRDs; it
runs as its own FastAPI + Vite app today, not embedded in either.

## 6. Provenance conventions specific to massing

Extends the sourced/modeled/input vocabulary from `PROJECT_CONTEXT.md` §6.3 with the two-sided
honesty this data actually needs:

- **`authority`** — read directly off the DDA record (area, GFA, height, setbacks, parking rule).
- **`derived`** — computed from two authority figures (implied FAR).
- **`assumption`** — ours, always with a stated basis (floor-to-floor height, scheme
  decomposition, the podium premium).
- **`deferred`** — the authority stated nothing and we declined to guess (a missing setback →
  `bounded: false`; a missing parking rule → the parking-deferred callout added today). A
  `deferred` figure must never silently reach a downstream number without a visible flag next to
  the number it affects — this is the same rule the project's own memory states for regulatory
  figures generally, and it is the rule the parking fix exists to enforce.

## 7. Known gaps carried forward (not blockers, but not silent)

- **Plot coverage enforcement exists but rarely fires** (`massing.py`) — 0 of 1,000 residential
  plots sampled 2026-08-29 published a coverage cap, so on nearly every real plot the setback
  envelope alone binds. Not a bug; a data-availability fact worth remembering before assuming
  the mechanism is broken because a demo plot looks flat.
- **DDA context radius is a fixed 260m** (`fetch_context`) — untouched today; widening it is a
  real perf/timeout trade-off on a live external call that hasn't been measured, not a one-line
  style change.
- **No test coverage for `solid.py`'s render-geometry assembly or `Scene.tsx`** — today's fixes
  were verified with one-off numeric scripts, not committed tests. `massing/tests/` covers the
  regulatory/scheme layer well; the render layer has none.

## 8. Acceptance check

- Demo fixture (`fixtures/parcel-3156315.json`) renders with every slab's world-space bottom
  equal to its `base_m`, and the deepest basement's bottom equal to `-depth_m` shown in the
  panel — not eyeballed, computed and compared.
- The candidate table's RLV column is **not constant** across storey counts once a podium is
  reached.
- A plot with no parking rule renders "–", not "0 / 0", and shows the parking-not-priced callout.
- `pnpm exec tsc --noEmit` and `pytest` both clean (16 tests today; should grow, not just pass).

## 9. Open questions (genuinely open — not decided by this PRD)

- **Relationship to `solum.html`.** Same client, same job-to-be-done, same RLV formula,
  different architecture, different UI, no shared data or shared session. Does massing stay a
  separate entitlement-first tool that feeds a plot number into `solum.html`'s workflow, does it
  get embedded as a tab inside the eventual real backend, or does it stay a standalone
  spike/demo surface indefinitely? This changes real decisions (auth, persistence, hosting) and
  should be a deliberate call, not an accident of which repo folder code lands in.
- **Live DDA plot numbers vs. the bundled fixture** — how much of the demo should run on live
  network fetches (real but slower, and dependent on DDA's uptime) versus the fixture (fast,
  reliable, but only one plot) for client-facing demos.
- **The podium premium's magnitude** — flagged in §4 as not yet locked past a first estimate.
