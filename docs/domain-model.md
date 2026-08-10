# Dubai domain model

The regulatory mechanics the collection-curve engine has to model. This is the wedge — no competitor
found models any of it (see [`competitive-landscape.md`](competitive-landscape.md) §5).

**Read the warning first.** Every figure below is sourced from secondary commentary — law firms and
property guides — not from the legislation itself. That is good enough to design an engine around.
**It is not good enough to compute a client's land value with.** A wrong retention percentage does
not throw an error; it silently shifts every cashflow the product will ever produce, and the mistake
surfaces when a developer has already bid. Before any of these numbers hard-code into the engine, they
need checking against DLD, RERA and the published laws directly.

Tags: `[verified]` fetched from a named source on 2026-08-10, `[relayed]` from earlier analysis,
`[assumption]` our inference.

---

## 1. Why Dubai off-plan is a different engine

Aprao, ARGUS and Feasly all model **lender-funded** development: debt is drawn against cost or GDV,
interest accrues on the drawn balance, the loan is repaid from sales. Feasly goes furthest with senior
debt, mezzanine and profit splits. `[verified]`

Dubai off-plan is **buyer-funded**. Purchasers pay instalments into a project escrow account during
construction. The developer's working capital is the collection curve, not a facility. So the
question stops being "what does my debt cost" and becomes:

> Does cash arrive from buyers fast enough to pay the contractor, given a mandatory pre-funding
> deposit, milestone-gated releases I do not control, a retention held back for a year after
> completion, and 40–60% of the price potentially arriving after handover?

A scheme can be highly profitable on a static residual and still fail on timing. That failure mode is
invisible in every tool on the market, and it is the one that actually kills Dubai developers.

---

## 2. Escrow

| Rule | Figure | Source |
|---|---|---|
| Escrow mandatory, project-specific, at a RERA-approved / DLD-approved bank | — | Law No. 8 of 2007 `[verified]` |
| Pre-sales deposit or guarantee | **≥ 20% of total estimated construction cost** before sales commence | Law No. 9 of 2007 `[verified]` |
| Buyer payments | All instalments go to the project escrow, never the developer's operating accounts | `[verified]` |
| Release trigger | Completion certificate from an **independent engineer** plus **RERA approval** | `[verified]` |
| Release milestones | Foundation, structural completion, MEP, finishing, handover | `[verified]` |
| Post-completion retention | **5% of the escrow held as a defects guarantee for one year** | `[verified]` |

Three consequences for the model:

1. **The 20% pre-funding is an equity call before revenue exists.** It sets peak funding requirement
   before a single unit sells, and it belongs in the cashflow as a period-zero outflow.
2. **Releases are gated on inspection, not on spend.** The developer pays the contractor on progress
   but draws from escrow only after certification. That lag is a real working-capital cost and is
   exactly what a naive linear model misses.
3. **The 5% retention delays 5% of collected cash by a year past completion**, which lands squarely
   on IRR because it is the last and most heavily discounted money.

### Buyer default retention (Law No. 19 of 2017) `[verified]`

Caps on what a developer may retain when a buyer defaults, by completion stage:

| Completion | Developer may retain |
|---|---|
| Under 60% | up to **25%** of purchase price |
| 60–80% | up to **40%** |
| Over 80% | full amount, subject to court order for resale |

Needed for the downside case: a default scenario is not just lost revenue, it is partially recovered
revenue on a schedule, and the recovery rate steps with construction progress.

---

## 3. Payment plans

Structures actually in market `[verified]`:

| Plan | Shape |
|---|---|
| 80/20 | 80% across construction, 20% at handover |
| 60/40 | 60% across construction, 40% at handover |
| 50/50 | Even split, construction vs handover |
| 1% monthly | 10–20% down, then ~1% per month through construction, ending in a ~20–30% completion balance or continuing post-handover |
| Post-handover | Defers **40–60% of price, interest-free, over 2–5 years** (occasionally 7–10) |

Down payments `[verified]`: typically 10–20%. Nakheel at 20% on booking; Emaar's 2025–26 launches
"almost all take 10%"; Danube and Samana nearer 10–15%. Expression-of-interest amounts commonly
AED 20,000–100,000, higher on oversubscribed villa launches.

Worked example `[verified]`: 60% across construction milestones, then 40% over 36 months
post-handover.

**The post-handover plan is the interesting case.** Deferring 40–60% interest-free for up to five
years is, in substance, the developer extending vendor finance at zero nominal rate. It moves units
fast — which improves absorption — and severely damages IRR. That tradeoff is the single most
valuable thing this product could quantify, and it is precisely what a static residual land value
cannot see.

---

## 4. Transaction costs

| Item | Rate | Source |
|---|---|---|
| DLD registration / transfer | **4%** | `[verified]` |
| Oqood registration | SPA must be registered through Oqood promptly after execution; **fee not established** | `[verified]` that it is required; `[assumption]` on cost |
| DEWA connection charges | not established | `[relayed]` |
| Master-developer infrastructure contributions | not established | `[relayed]` |

The 4% DLD rate is currently in the engine's test fixture as `dldTransferRate: 0.04`, tagged for
verification. Oqood, DEWA and infrastructure contributions are **not modelled at all**, which means
current cost totals are understated by an unknown amount. That is stated in the trace rather than
hidden, and it is a blocker on any client-facing number.

---

## 5. What the engine needs, in build order

Each of these is a new **input** to the pure engine, not a change to how it works.

**1. `CostCurve`** — construction spend distributed across periods. S-curve, not linear: spend is slow
during foundations, peaks through structure and MEP, tails through finishing. Every competitor has
this. `[assumption]` on the curve shape until calibrated against real project data.

**2. `AbsorptionCurve`** — units sold per period, as a function of launch price against the
comparables band, unit type, competing supply completing the same quarter, and time to handover.
Needs the DLD transaction store. Until then it is a user input with a stated default, clearly labelled
as an assumption rather than a forecast.

**3. `PaymentPlan`** — the schedule above, as a first-class object: down payment, construction
instalments tied to **milestones** (not dates, because releases are certification-gated), handover
balance, and post-handover tail.

**4. `CollectionCurve`** = absorption × payment plan. Cash in, per period. This is the wedge.

**5. `EscrowModel`** — the 20% pre-funding outflow, milestone-gated releases with a certification lag,
and the 5% one-year retention. Turns collections into *available* cash, which is what actually pays
the contractor.

**6. `Cashflow`** — collections and releases against the cost curve, giving peak funding requirement,
funding gap by period, and a real IRR. The `irr()` primitive is already built and tested, including
its refusal to return a number for a degenerate series.

**7. Uncertainty** — distributions over price, cost and absorption propagated through the above,
reported as P10/P50/P90 residual land value. Replaces three fixed scenarios with the format a credit
committee actually reads.

Steps 2 and 7 are blocked on the DLD transaction store. **Steps 1, 3, 5 and 6 are not blocked on
anything** — they are pure mechanics, and they are the four that produce Finance and Cashflow, the two
tabs the landing page already claims.

---

## 6. Open questions

- **Oqood fee.** Required, cost unknown. Affects every appraisal's cost total.
- **Escrow release lag.** How long between an independent engineer's certificate and funds landing?
  This is the difference between a working-capital problem and a rounding error, and it is not
  documented in any secondary source found.
- **Does the 5% retention apply to the escrow balance at completion, or 5% of total project value?**
  The phrasing found — "5% of the escrow account is retained" — is ambiguous and the two readings
  differ materially.
- **Minimum construction progress before off-plan sales may commence.** Not established.
- **Whether the 20% pre-funding may be satisfied by guarantee rather than cash**, and what a guarantee
  costs. Determines whether it is a funding outflow or a fee.

Every one of these is a question for DLD or RERA directly, or for a Dubai real estate lawyer. None
should be answered from a property blog — including the ones above.
