# Build plan — the next Solum, on top of this one

**Written 2026-08-27.** Companion to [`KNOWLEDGE-BASE.md`](KNOWLEDGE-BASE.md), which establishes
*what* to build and why. This one is *how*: layer by layer, with the complexity analysis, the
sequencing, and the places where the naive implementation does not work.

Read `KNOWLEDGE-BASE.md` §7 first if you have not. Everything here assumes that ranking.

---

## 0. The finding that shapes everything below

I went into this expecting to design a second runtime — a Python service for the geometry and the
optimisation, a queue for the sweeps, a worker tier. **None of it is needed.**

Every capability on the roadmap is a **pure function over a resolved input**: the uncertainty ledger,
the timeline model, the capacity model, the HBU strategy loop, the cost curve, the payment plan, the
cashflow. They all read an `AppraisalInput` and return numbers. They do no I/O, read no clock, fetch
nothing. That is exactly the contract `packages/engine` already enforces.

The one thing that is genuinely *not* pure is **fitting** — regressing a price model on DLD
transactions, forecasting absorption. And that boundary is already designed. From `types.ts`:

> ```ts
> /**
>  * A comparables band resolved from a market-data snapshot.
>  *
>  * The engine never fetches this. […] When the price model exists it will produce this same shape,
>  * with a fitted band instead of an observed one.
>  */
> export interface ComparablesBand { … }
> ```

So: **fitting happens offline and writes coefficients into a table; the engine consumes a band and
never fits.** No Python in the request path, ever.

What follows from that, and it is worth stating plainly because it saves months:

- **The stack does not change.** No new service, no queue, no Redis, no Kubernetes, no gRPC.
- **This is a `packages/engine` project** with a thin delta on the database and a thin delta on the
  web app.
- The deferred-until-proven list in `architecture.md` §7 stays deferred. Nothing here disturbs it.

---

## 1. What we are actually building

Four capabilities, in dependency order, plus the client's own trust prerequisites.

| | Capability | Why it is on the list |
|---|---|---|
| **A** | **Uncertainty ledger** — rank every assumption by how much it moves the answer | `KNOWLEDGE-BASE.md` §7.1. Completes the axis Solum already uniquely owns, blocked on nothing |
| **B** | **Capacity → timeline → IRR** | Al Mizan item 13, their own number one. Changes the ranking key |
| **C** | **Light HBU** — rank development strategies by RLV | Both consultants converge on it. PRD already written |
| **D** | **Cashflow, and behind a gate, the escrow collection curve** | The structural moat. Gated — see §6 |

And three prerequisites from the client's bucket 1 and 2, which are cheap and which everything else
reads better on top of: label every PSF denominator, explain RLV on screen, and put provenance on
plot inputs.

---

## 2. Engine layer — where nearly all the work is

`packages/engine` is pure TypeScript with zero runtime dependencies, versioned, trace-emitting, 48
tests (measured 2026-08-27 — the README still says 46). Every new module below obeys the same contract.

### New modules

**All eleven are new — none of these files exist today.**

```
packages/engine/src/
  band.ts          ← Band type + construction. The uncertainty primitive
  ledger.ts        ← Ledger class. Mirrors Trace exactly
  uncertainty.ts   ← one-at-a-time perturbation sweep, contribution ranking
  capacity.ts      ← plot + FAR + form → floors, basements, footprint, unit capacity
  timeline.ts      ← floors + basements → construction duration
  costCurve.ts     ← S-curve spend distribution across periods
  paymentPlan.ts   ← down payment, milestone instalments, handover, post-handover tail
  cashflow.ts      ← collections vs cost curve → peak funding, funding gap, IRR
  escrow.ts        ← GATED. Stub, with the ambiguity named in the type
  strategy.ts      ← HBU loop over a curated strategy set
  optimise.ts      ← mix search. The one complexity hazard — see §5
```

### The uncertainty primitive, and the honesty problem it creates

A band on an input is itself a judgement. A ± range on an `[assumption]`-tier number is a guess about
a guess, and if the UI renders it with the same confidence as a fitted band, we have manufactured
exactly the false precision this project exists to avoid.

The design answer is to make that structurally impossible rather than a convention people remember:

```ts
export type Provenance = 'authority' | 'sourced' | 'modeled' | 'input';

export interface Band {
  low: number;
  base: number;
  high: number;
  provenance: Provenance;
  /**
   * Where the width came from. Required, deliberately: a band you cannot explain is a band that
   * should not exist. "P5–P95 of 412 DLD transactions" is a basis. "±10%" is not.
   */
  basis: string;
}
```

`basis` being non-optional means the type system refuses to let anyone construct a band without
saying where its width came from. That is a cultural rule enforced by the compiler, which is the only
place cultural rules survive contact with a deadline.

The four provenance tiers extend the prototype's existing `sourced` / `modeled` / `input` vocabulary
with `authority` — which is precisely Al Mizan item 21, the distinction between what DDA says and
what an agent typed.

### What the sweep may and may not rank

`appraise()` solves residual land value as:

```
RLV = (GDV − nonLandCost × (1 + targetProfit)) / ((1 + dldRate) × (1 + targetProfit))
```

`plot.landCost` **does not appear in it.** RLV is land-price-independent by construction — that is
not an oversight, it is the property that makes RLV the correct key to rank HBU strategies on
(light-HBU §1). So perturbing the land price moves the *verdict* and *profit on cost*, and moves the
residual by exactly nothing.

That matters for the ledger, because an input with zero swing rendering as "0% contribution" reads as
a broken calculation rather than a true statement. **The sweep runs over the RLV-dependent subset
only**, and the inputs outside it are excluded deliberately and named as such rather than ranked at
zero.

Counted against `types.ts` on 2026-08-27, the RLV path takes **roughly 28 numeric inputs** for the
four-type default mix — 12 of the 13 `CostInputs` fields plus `costBasis`, `plot.gfaSqft`,
`targetProfitOnCost`, and `unitCount` / `avgAreaSqft` / `pricePsf` per enabled unit type. Adding 4BR
and a fifth type takes it to about 34. Excluded, with reasons the UI should state: `plot.landCost`
(does not enter the residual), `passThreshold` and `marginalThreshold` (verdict thresholds, not
arithmetic), the comparables band (raises flags, does not enter the formula), and the identifiers.

At 28 inputs × 2 perturbations that is 56 runs — **2.3 ms**, comfortably inside a request.

### The ledger

Mirrors `Trace` — same class shape, same `record()` / `allSteps` pattern, so the existing
`components/Ledger.tsx` renders it with no new component vocabulary.

```ts
export interface LedgerEntry {
  inputPath: string;              // 'costs.constructionPsf'
  label: string;
  band: Band;
  lowOutput: Fils;                // RLV with this input at band.low, all else at base
  highOutput: Fils;
  swing: Fils;                    // |highOutput - lowOutput|
  shareOfTotalSwing: Rate;        // the ranking key
  stepIds: string[];              // trace steps this input touched
}
```

`stepIds` is the important field. It links each ledger entry back into the existing trace, so
"construction cost drives 60% of your uncertainty" opens directly into the derivation that already
exists. **Reuse, not a parallel system.**

### The idea that makes the ledger a verdict input, not a display

Add one flag code:

```ts
| 'UNCERTAINTY_EXCEEDS_HEADROOM'
```

Raised as a `blocker` when the residual land value band is wider than the headroom between RLV and
the asking price. In plain terms: *the deal is inside my own margin of error, so I will not call it.*

That is the existing refusal behaviour generalised from "these inputs contradict each other" to "I do
not know this precisely enough to have an opinion." No competitor does anything like it, and it costs
one flag and one comparison.

### Version policy

Adding `ledger` to `AppraisalResult` changes the result shape, so it is a major bump — `3.0.0`, not
an edit in place. Stored results are **not** recomputed; they are flagged and the user chooses to
re-run. The database already models this: `appraisal_status` has a `stale_engine` value. Use it.

---

## 3. Data layer — a small delta

The schema is already the right shape. Immutable `assumption_sets`, pinned `comparable_snapshots`,
`results` carrying `engine_version` + `trace` + `flags`, RLS by `organisation_id`. Four changes.

**Migration `0006_uncertainty.sql`**

- `results` gains `ledger JSONB NOT NULL DEFAULT '[]'`.
- Bands need **no new table.** They are part of the resolved input, so they ride inside
  `assumption_sets.inputs`, which is already a full immutable snapshot with a content hash. A band
  is an assumption; assumptions are already stored correctly.

**Migration `0007_capacity.sql`**

- `plots` gains `floors`, `basement_levels`, `podium_levels`, `usage` — the inputs the timeline model
  needs. The prototype already collects all four on Plot Details, so this is porting, not designing.
- `plots` gains `field_provenance JSONB` — a map from field name to `Provenance`. This is Al Mizan
  item 21, and it is what lets the ledger widen the band on an agent-supplied GFA automatically.

**Migration `0008_cost_library.sql`**

- `cost_library` — construction cost per sqft by product family × spec tier. The light-HBU PRD is
  blunt that this is a v1 dependency and not optional: if strategies differ in price but share a
  cost, the ranking degenerates to "highest price tier always wins," which is wrong and looks
  authoritative. Ship it with HBU or do not ship HBU.

**Finish the segmentation pipeline.** `scripts/market-scrape/` step 3 — landing segmented output and
populating `comparable_snapshots.segment`. The column and the enum already exist; the scraper and the
percentile split already exist; only the write is missing, and it was deliberately left until the
extraction had been eyeballed against a real page. Do that, then land it.

### The offline boundary

Price-model fitting and absorption forecasting live outside the request path entirely — a scheduled
job in `packages/market-data` (or Python under `scripts/`, which is where the ecosystem is better)
that writes fitted coefficients into a `price_models` table. The web app resolves a `ComparablesBand`
from those coefficients and hands it to the engine. **The engine's purity is what makes this a
boundary rather than a coupling.**

---

## 4. Web layer — smaller than it looks

`apps/web` is Next.js App Router, server-rendered from Postgres, every read through `withTenant` so
RLS does the filtering. The rule that governs all of this: **no calculation in the browser.** It
cannot be audited, cannot be versioned, and ships the model to anyone who opens devtools.

At 2.3 ms per full ledger sweep (§5), a recompute is a plain server action. **No streaming, no
optimistic UI, no client-side approximation to keep the sliders responsive.** That is a real
simplification and it is worth naming — it is the kind of complexity that gets built by default when
nobody measures first.

Surfaces, in the order they change:

**The appraisal instrument.** RLV stops being a single figure and becomes a figure with a spread bar
beneath it. The stamp logic extends: `UNCERTAINTY_EXCEEDS_HEADROOM` stamps **Withheld**, same as any
other blocker.

**The review list** — the ledger, sorted by `shareOfTotalSwing`, cut at 80% cumulative. *"Five
assumptions drive 80% of the spread in this number. Here they are, worst first."* Each row shows its
`basis` string and its provenance tier, and opens into the existing derivation. This is Yogi's item 8
— *tell me which assumptions to review* — answered by computation rather than by an LLM guessing.

**Compare** leads with IRR instead of profitability, and the page can finally delete the disclaimer
it currently carries about not being able to see capital rotation.

**New plot** asks for timeline and payment plan (item 12), and for floors/basements, tagging each
field with its provenance as it is entered.

Design constraints that do not move: vermilion is reserved absolutely for annotation and withholding;
the three-size type scale holds; every figure names its denominator.

---

## 5. Problem complexity — where this is cheap, and the one place it is not

Measured on the beta fixture, 2026-08-27, 2,000 runs after warm-up:

**`appraise()` = 0.041 ms.**

Everything else follows from that number.

| Work | Runs | Cost | Where it runs |
|---|---|---|---|
| Single appraisal | 1 | 0.04 ms | Synchronous |
| **Uncertainty ledger**, 28 inputs × 2 perturbations | 56 | **2.3 ms** | Synchronous |
| Sensitivity grid 11×11 | 121 | 5.0 ms | Synchronous |
| Monte Carlo, 10,000 draws | 10,000 | 0.41 s | On demand |
| Monte Carlo, 100,000 draws | 100,000 | 4.1 s | Background |
| **Mix optimiser, 4 unit types** | 1,771 | 0.07 s | Synchronous |
| **Mix optimiser, 6 unit types** | 53,130 | 2.2 s | Too slow |
| **HBU: 6 strategies × 6 unit types** | 318,780 | **13.1 s** | Far too slow |

Two corrections to what the architecture doc currently assumes, both in our favour:

`architecture.md` §6 puts the 11×11 sensitivity grid in a **background job** as "too slow to block a
UI." At 5 ms it is not. That row is stale — it was written before the engine existed and could be
measured. Monte Carlo at 10k draws is also affordable enough to run on demand, which means the
*honest* P10/P50/P90 product is reachable rather than aspirational once the fitted distributions
exist.

### The one real hazard: the mix optimiser

**There is no optimiser in the rebuild engine.** `computeUnitMix` takes explicit unit counts and does
a single pass; `minShare` / `maxShare` in `defaults.ts` are consumed by exactly one line in
`apps/web/app/plots/new/actions.ts`, to take a midpoint. The brute-force search lives in the
prototype (`optimise()`, 5% steps), and porting it is future work.

So this is not a bug report. It is a design constraint I get to set before the code is written.

The prototype searches every allocation of 100% across the unit types in 5% steps — compositions of
20 into *U* parts, which is `C(20+U-1, U-1)`:

- **U=4** (today's default mix): 1,771 mixes — fine.
- **U=5**: 10,626 — 0.44 s, borderline.
- **U=6**: 53,130 — 2.2 s per strategy.

**Adding 4BR makes it five times worse, and 4BR is a client bucket-2 ask.** Layer the six HBU
strategies on top and the exhaustive search is 13 seconds, which is not a UI interaction.

**The intended fix: two-phase search.** A coarse pass at 10% steps (3,003 mixes for U=6), then a
local refinement at 1% steps around the winner (~400 more). 3,403 evaluations — **16× cheaper**, and
6 strategies land at 0.84 s.

**And the caveat that has to be built in with it.** The objective is not smooth: efficiency falls as
units-per-floor rises, and the min/max band constraints create feasibility edges. Coarse-then-refine
can converge into the wrong basin. So it ships with a verification harness — run exhaustive and
two-phase against a set of real plots, compare the winners, and keep exhaustive as a test oracle. If
they disagree on real inputs, the approach is wrong and we find out in a test rather than in a
client's land bid.

Free win alongside it: `assumption_sets.input_hash` already exists, so identical searches are
cacheable without designing anything.

**Summary: the only component on the roadmap where the naive implementation is too slow is the one
component that has not been written yet.** Everything else is under 10 ms.

---

## 6. Sequencing, with an honest gate

**Phase 0 — trust.** Al Mizan's bucket 1. Label every PSF denominator, explain RLV on screen,
provenance on plot inputs. Little engine work; this is the base everything else is read on top of.

**Phase 1 — the uncertainty ledger.** `band.ts`, `ledger.ts`, `uncertainty.ts`, the new flag,
migration 0006, the review list. Engine `3.0.0`. Blocked on nothing.

**Phase 2 — capacity, timeline, IRR.** `capacity.ts` (four lines of arithmetic from light-HBU §5),
`timeline.ts`, migration 0007, IRR-first Compare. Al Mizan's own number one. `irr()` is already built
and tested, including its refusal on a degenerate series.

**Phase 3 — optimiser, 4BR, HBU.** These are one phase because they are one problem: 4BR is what
makes the search expensive, HBU is what multiplies it, and the two-phase optimiser is what makes both
affordable. Needs `cost_library` (migration 0008) shipped with it, not after.

**Phase 4 — cashflow.** `costCurve.ts`, `paymentPlan.ts`, `cashflow.ts`. Pure mechanics, blocked on
nothing, and they produce the Finance and Cashflow tabs the landing page has claimed since the beta.

**Phase 4b — GATED: the escrow collection curve.**

> **The gate is five legal answers, not a sprint.** Oqood fee; escrow release lag after certification;
> whether the 5% retention is on the escrow balance or total project value; minimum construction
> progress before off-plan sales; whether the 20% pre-funding can be a guarantee rather than cash.
> See `KNOWLEDGE-BASE.md` §5.
>
> This phase does not begin until those are answered by DLD, RERA, or a Dubai real estate lawyer. The
> engineering behind the gate is small. **Building it on `[relayed]` figures produces confidently
> wrong cashflows, which is worse than having none** — a wrong retention percentage does not throw,
> it silently shifts every cashflow the product will ever produce, and it surfaces after a developer
> has bid. `escrow.ts` ships before the gate as a stub with the ambiguity named in the type.

**Phase 5 — fitted models.** Offline price model on the DLD store, absorption forecast, Monte Carlo
over real distributions. This is where P10/P50/P90 stops being a sensitivity ranking and becomes a
genuine forecast, and it is the only phase that needs a skill this project does not currently have
staffed — applied statistics, not TypeScript.

---

## 7. Risks, named

| Risk | Mitigation |
|---|---|
| **Bands are guesses about guesses**, rendered with the authority of fitted data | `Band.basis` is a required field. No band exists without a stated source for its width, and the UI renders it |
| **Two-phase optimiser converges to the wrong mix** on a non-smooth objective | Exhaustive search retained as a test oracle; disagreement on real plots fails the build |
| **4BR × HBU combinatorics** | Quantified before writing the code. Two-phase search sized for U=6 |
| **Engine bump invalidates stored results** | Already modelled: `stale_engine` status, explicit user re-run, never a silent recompute |
| **Escrow figures are `[relayed]`** | Hard gate on phase 4b |
| **Phase 1 ships a ranking and it gets read as a forecast** | Labelled a sensitivity ranking, not a probability, until phase 5. The word P50 does not appear before then |
| **Scope**: the client raised 21 items; this plan builds six | Deliberate, and it follows their own triage rather than ours |

---

## 8. What this plan deliberately does not build

- **The AI assistant layer.** The most-requested item in the client's list, and the one they warned
  against building first. The ledger delivers the guidance they actually asked for (item 8) by
  computation instead.
- **Generative massing, floor plans, renderings.** `KNOWLEDGE-BASE.md` §6 has the full analysis. The
  capacity model in phase 2 is the part that pays for itself; the pictures are not.
- **Plot discovery, plot aggregation, brokerage, IFC/BIM export.** All bucket 3 by the client's own
  sorting.
- **A second runtime.** See §0.

---

## 9. First commit

Phase 0 is the cheapest and unblocks the reading of everything after it. But if the goal is to prove
the thesis rather than clear the backlog, the first commit is `band.ts` — the `Band` type with its
required `basis` field, and the tests that pin it. Everything in phase 1 hangs off that one type, and
writing it first forces the honesty question to be answered before any UI depends on the answer.
