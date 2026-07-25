# PRD — Light Highest & Best Use (residential-scoped)

- **Status:** Draft
- **Date:** 2026-07-25
- **Owner:** DKubadia
- **Related:** `market-inspirations/analysis/aire-vs-solum.md`,
  `market-inspirations/analysis/consultants-vs-solum.md` (why HBU is the top bet);
  `docs/prd/dld-comps-integration.md` (the comp data this builds on);
  `SOLUM_CONTEXT.md` §6 (scope), `PROJECT_CONTEXT.md` §7 (vision)

---

## 1. Problem / why now

Solum answers one question today: given a plot, a land price, and a single
residential product set, does the profit-maximising unit mix clear the hurdle, and
what is the residual land value. It never asks the question a land buyer actually
starts with, which is what should go on this plot at all.

Two independent consultants we studied both put Highest & Best Use at the centre of a
land-buy study, despite selling opposite things (AIRE sells tech at AED 20k, Land
Sterling sells chartered trust at AED 73,500). When two competitors who agree on
nothing else both lead with HBU, that is signal. This feature takes Solum from a
single-scheme calculator to a decision engine that ranks a handful of development
strategies and recommends the best one.

It is deliberately **light**. Not seven asset classes. Residential only, varying
product, positioning tier, and later tenure. That is the version that fits Solum's
wedge (fast screening ahead of a consultant) without becoming a consultant.

### The grounding insight

Classic appraisal defines highest and best use as the permissible use that produces
the **highest residual land value**. Solum already computes exactly that number.
`evalMix()` returns `rlv` for any mix, and critically `rlv` is **independent of the
land price being tested** (it is derived from GDV, non-land cost, and the hurdle, not
from `mk.land`). So the objective function HBU ranks on is already in the engine. We
are not inventing a metric. We are running the existing one over more than one
strategy and sorting.

## 2. What it does (scope)

A **development strategy** is a named parameterisation of the existing state:

- a product set (`state.types` with sizes, prices, bands),
- a build cost per ft² (`state.market.cost`),
- optionally different assumptions and an efficiency model appropriate to the form.

For each strategy, Solum runs the existing optimiser, gets the best mix, and scores it
by RLV. It then applies the four HBU tests as gates, ranks the survivors, and
recommends the top one. The output is a new **Best use** panel: a ranked table of
strategies with verdict, RLV, ROI, IRR, and the headline mix, plus the recommended
strategy called out and the four-test status shown as chips.

Example strategy set for v1 (all build-to-sell):

| Strategy | Product | Tier | Notes |
| --- | --- | --- | --- |
| A | Apartments (studio/1/2/3BR) | Mid-market | Reproduces today's default run |
| B | Apartments | Upper-mid | Larger units, higher psf, higher build cost |
| C | Apartments, efficiency skew | Mid-market | More studios/1BR, higher unit count |
| D | Townhouses | Mid-market | Low-rise, coverage-driven capacity |

The recommendation is "Strategy X is the highest and best use of this plot: it returns
the most land value (RLV Y) while clearing your hurdle." Everything below that is the
evidence.

## 3. The methodology: four HBU tests mapped to Solum computations

This is the standard four-test framework (the exact one in the Land Sterling
proposal), mapped to code that already exists or is a small addition.

**Test 1 — Legally permissible.** The strategy's product must be allowed under the
plot's land use. Input is `state.plot.usage` (from DDA). Implement as a permitted-use
map: usage string to allowed product families, with a visible flag and a user
override. DDA land-use strings are coarse, so v1 treats this as a soft gate, not a
hard block.

**Test 2 — Physically possible.** Does the product fit the envelope.
- Apartments (high-rise): the existing model already enforces this. `evalMix` derives
  saleable area as `sal = gfa * eff`, where `eff` falls as units-per-floor rises
  (`EFF={emax:0.86, uref:8, kc:0.004}`). No change.
- Townhouses / villas (low-rise): GFA-times-floor-efficiency is the wrong constraint.
  The binding constraint is plot coverage, footprint, and setbacks. This needs a
  product-appropriate capacity model (see §5, the one genuinely new piece of logic).

**Test 3 — Financially feasible.** The best mix must clear the margin hurdle. Reuse
`verdictOf(best.mcost, mk.hurdle)` exactly. A strategy that returns Pass drops out of
the recommendation but stays visible in the table so the user sees why.

**Test 4 — Maximally productive.** Rank the feasible strategies by RLV and recommend
the highest. This is the sort. RLV is the correct key because it is land-independent
and is the textbook HBU objective.

## 4. The logic (grounded in the current engine)

Today:

```
computePlotSummary(state)
  → mk = marketInputs(state)
  → {best} = optimise(mk, state)      // brute-forces mix in 5% steps, maximises mcost
  → returns best mix summary
```

Light HBU wraps this in a loop and adds the gates:

```
computeHBU(state, STRATEGIES)
  for each strategy S:
    stateS = mergeStrategy(state, S)          // override types, market.cost, assumptions, eff model
    legal  = permittedUse(stateS.plot.usage, S.product)     // Test 1
    cap    = capacityModel(S.form, stateS)                  // Test 2 (apartments: existing; low-rise: new)
    if !cap.fits: mark infeasible-physical; continue
    mk     = marketInputs(stateS)
    best   = optimise(mk, stateS, objective='rlv').best      // Test 3 inputs
    verdict= verdictOf(best.mcost, mk.hurdle)
    push { S, legal, best, verdict, rlv:best.rlv, roi:best.mcost, irr: irrOf(cashflow(best,mk,stateS).cf) }
  feasible = rows.filter(clears hurdle AND physically fits AND (legal OR overridden))
  ranked   = feasible.sort(by rlv desc)                      // Test 4
  return { ranked, recommended: ranked[0], all: rows }
```

**The one surgical engine change.** `optimise()` currently hardcodes its objective to
`mcost` (ROI): `if(!best || m.mcost > best.mcost) best = m`. Generalise it to take an
objective so HBU can optimise each strategy's mix for RLV (the thing we then rank on),
while the existing single-plot view keeps optimising for ROI. One parameter, one
comparison line. Everything else in `evalMix` / `optimise` is untouched.

Why RLV as the within-strategy objective for HBU: if we optimise the mix for ROI but
rank strategies by RLV, the two can disagree at the margin. For an HBU answer that is
internally consistent, the mix that defines a strategy's RLV should be the mix that
maximises that strategy's RLV. Small change, correctness matters here.

## 5. What data we need

### Already have
- **Envelope** (DDA): `plot.gfa`, `plotArea`, `far`, `floors`, `usage`. Enough for the
  apartment capacity model and Test 1.
- **Apartment sale price/ft² and typical size by bedroom type, per area** via
  `get_comps(area_id)` returning `price_sqft`, `size_sqft`, `sample_n`, `as_of`. This
  anchors the mid-market apartment strategy with real, sourced numbers.

### Need to add, in priority order

**1. Build-cost library (highest priority, lowest effort).** Cost per ft² by product
family times spec tier. This is the single most important addition. Today Solum has
one `market.cost` for everything. If strategies differ only in price and share a cost,
the ranking degenerates to "highest price tier always wins," which is wrong and
misleading. Differentiated cost is what makes the ranking mean something.
- v1: a curated client-side constant, developer-validated, for example apartments mid
  ~AED 480-550, apartments upper ~AED 600-750, townhouse/villa on its own basis. Tag
  the whole thing `modeled` with the source shown.
- v2: a Supabase `cost_library` table so it is editable without a code change.

**2. Price by product family and tier.**
- Apartments by tier: derive from the DLD comp distribution (area median as mid, upper
  quartile as upper-mid), or apply a small curated multiplier to the sourced comp. No
  new backend needed for v1.
- Townhouse / villa price/ft²: DLD carries a property type / sub-type field, so extend
  the comps RPC to segment by it (`get_comps_by_type`), or use a curated benchmark
  table for v1. Segmenting the real data is the honest v2.

**3. Unit-size norms by product and tier.** Apartments from `get_comps.size_sqft`.
Townhouse / villa sizes from a benchmark config in v1.

**4. Rent and yield by product (hold / build-to-rent only).** Needed only when we add
the hold tenure. Rent per ft² or a gross-yield benchmark, then value = stabilised NOI
divided by cap rate. DLD has a rental index; a yield table is the v1 shortcut. Deferred
to v2.

**5. Absorption / demand signal (optional gate).** From the coming-soon market layers
(pipeline supply, absorption, off-plan). Use it to annotate "demand thin for this
product here," not to hard-block. Deferred.

**6. Permitted-use mapping.** A small curated map from DDA usage strings to allowed
product families, plus a user override. Client-side.

### The low-rise capacity model (the only new math)

Apartments reuse the existing `EFF` model. Townhouses and villas need their own
capacity because they are coverage-bound, not floor-bound. A defensible v1:

```
buildableFootprint = plotArea * coverageRatio          // coverage from a low-rise benchmark, e.g. 0.35-0.45
grossLowRise       = buildableFootprint * lowRiseFloors // e.g. G+1 or G+2
saleableLowRise    = grossLowRise * lowRiseEfficiency   // gross-to-net, e.g. 0.80
unitCount          = saleableLowRise / avgUnitSize
```

Everything downstream (GDV, cost, RLV) then flows through the existing cost and revenue
lines. Label the low-rise capacity `modeled` and expose its inputs so the user can
sanity-check. Do not reuse `EFF` for low-rise; it is calibrated for units-per-floor in
a tower and would be wrong.

## 6. Explicitly out of scope

- **Non-residential asset classes** (office, retail, hotel, mixed). That is full HBU,
  the thing consultants sell. Solum's wedge is the fast residential screen. Adding
  office and hotel means office and hotel data, cost, and revenue models we do not
  have. Deliberately excluded from "light."
- **Massing and design.** Capacity is strategic and indicative, same scope note the
  consultants put on their own massing stage.
- **ML price or demand prediction.** Ranked lowest in both competitor analyses.
  Strategies use sourced comps plus explicit, inspectable assumptions.
- **Combinatorial scenario generation** ("hundreds of options"). That is marketing.
  A curated set of 4-6 sensible strategies is more useful and more honest than a
  machine-generated haystack.
- **Changing the core `evalMix` math.** The only engine edit is the optimiser
  objective parameter.

## 7. Design decisions to lock

- [ ] HBU objective is **maximise RLV**. It matches the appraisal definition and is
  already computed and land-independent.
- [ ] Strategy set is a **small curated list (4-6)**, defined as a module-level const,
  not combinatorially generated.
- [ ] **Cost differentiation is a v1 dependency, not optional.** No cost library, no
  meaningful ranking. Ship them together.
- [ ] `optimise()` gains an **objective parameter** (`'mcost' | 'rlv'`); the existing
  single-plot view keeps `'mcost'`, HBU uses `'rlv'`.
- [ ] **Tenure: v1 is sell-only.** Hold / build-to-rent is v2 and needs rent/yield data.
- [ ] **Low-rise capacity is a separate model**, labelled modeled; apartments keep the
  `EFF` model.
- [ ] **Test 1 (legal) is a soft gate with override** in v1, given coarse DDA usage
  strings.
- [ ] Strategy definitions are **global config**; only the computed result is per-plot.
  Nothing new persisted per plot in v1.

## 8. Phasing

**v1 — client-side only, no backend change.** Curated strategy set (apartment tiers
plus one townhouse option, sell-only). Prices from DLD comp times curated tier
multipliers; cost from a client `COST_LIB` const; low-rise capacity approximation; the
optimiser objective parameter; the Best-use panel ranked by RLV. This ships the whole
decision on existing data plus two client constants.

**v2 — Supabase-backed.** Segment `get_comps` by property type; add a `cost_library`
table; add the hold / build-to-rent tenure and a rent/yield RPC; wire the absorption
gate from the market layers.

## 9. Token / architecture impact

New Best-use panel and a ranked table. Reads all colour through the `THEME` bridge, no
new brand colours; reuse the existing verdict semantics (Pursue / Negotiate / Pass) for
the per-strategy verdict chips, and the accent for the recommended row. No new tokens
expected. The four-test chips reuse existing status styling.

## 10. Acceptance check

- On the default plot, the Best-use panel renders a ranked table of the strategy set.
- **Sanity anchor:** the mid-market apartment strategy reproduces the current
  single-run Summary numbers (RLV, ROI, mix) within rounding, since it is the same
  parameterisation. If it does not, the wrapper is wrong.
- The recommended strategy is the highest-RLV row that clears the hurdle and fits the
  envelope. Change the hurdle up until the top strategy fails and confirm the
  recommendation moves to the next feasible one.
- Each strategy shows the four-test status; a strategy that fails Test 2 (physical) or
  Test 3 (hurdle) is shown but not recommended.
- Structural checks: `node --check` on the extracted script, tag balance, token graph
  resolves, blue-swap acid test stays clean.
