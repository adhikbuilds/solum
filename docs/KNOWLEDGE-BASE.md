# Solum — knowledge base

**Written 2026-08-27.** This is the index. Every other document in this project is deeper on one
thing; this one holds the whole picture and says which document to open next. If you are a future
session, or me in three months, read this first and then follow the pointers.

It follows the convention the rest of the repo already uses: `[verified]` checked directly against a
primary source with a date, `[relayed]` carried over from prior analysis and not re-checked,
`[assumption]` my own inference. Anything `[relayed]` or `[assumption]` that a calculation depends on
is a blocker, not a footnote.

The reason that convention exists is worth restating, because it is the most expensive lesson this
project has learned so far: **five separate claims have now failed on checking** — AIRE's USD 7,000
pricing, Feasly being "in private beta", "the prototype has no transactions store", "RLS may be off",
and reading `PASS` as a printed-a-loss bug when it meant *pass on the deal*. Every one was made
confidently from the outside without opening the primary source. That is the failure mode this
project is prone to, and it is why §6 of this document re-checked the open-source claims rather than
relaying them.

---

## 1. Where the code actually lives

`[verified 2026-08-27, checked on disk]`

**It is one repository, not two.** `/Users/aagarwal/solum-prototype-local/.git` is a 67-byte pointer
file, not a directory — it is a **git worktree** of `/Users/aagarwal/solum`, checked out on
`fix/almizan-feedback-bucket1`. Two directories, one object store, one history.

| | |
|---|---|
| `/Users/aagarwal/solum` | `main` @ `9e30f92` — the rebuild [updated 2026-08-29; was `feat/market-scrape-firecrawl`, now merged] |
| `/Users/aagarwal/solum-prototype-local` | `feat/massing-engine` @ `569cc2c` — the prototype worktree, now also home to the massing/entitlement service (`massing/` + `web/`, see `docs/prd/massing.md` on that branch) [updated 2026-08-29; branched on from `fix/almizan-feedback-bucket1`, which still exists as its own branch/ref] |
| `origin` | `github.com/adhikbuilds/solum` — **private**; a collaborator needs to be added, the URL alone 404s for them |
| `prototype` | `github.com/DKubadia/solum` — **gone**, but see the resolved note above: its history is safe on `origin` regardless |

### Two repo facts that need a decision

**The prototype remote no longer exists** `[verified 2026-08-27]` — `git fetch prototype` returns
`Repository not found`. Deleted, renamed, or access revoked; from here it is indistinguishable.

> **Resolved 2026-08-29.** The single-point-of-failure this created is closed: `prototype/main` and
> `fix/almizan-feedback-bucket1` (the ~40 commits — `market-inspirations/`, all four PRDs,
> `PROJECT_CONTEXT.md`, `DECISIONS.md`, the Al Mizan feedback file) are now reachable from
> `origin/feat/massing-engine` and from `origin/prototype/main` / `origin/prototype/almizan-bucket1`
> directly `[verified 2026-08-29, checked with git merge-base --is-ancestor]`. Anyone with repo
> access can pull all of it — nothing is stranded on this laptop only. This matters concretely for
> onboarding a second person onto the repo: adding them as a GitHub collaborator is now sufficient
> by itself; no separate hand-off of local-only history is needed.

**The rebuild README has a broken cross-link.** Line 190 points at
`docs/feedback/2026-08-almizan-demo.md`. That file does not exist on `feat/market-scrape-firecrawl`;
it lives only in the prototype worktree `[verified 2026-08-27]`. The single most important document
in the project is unreachable from the document that tells you to read it.

---

## 2. What Solum is, in one pass

A land feasibility and development appraisal tool for Dubai residential development. Given a plot, an
asking price and a margin hurdle, it optimises the unit mix, computes **residual land value** (the
most you could pay and still clear the hurdle), and returns a verdict.

- **Al Mizan** is the client — a Dubai land investment firm. **Solum** is the tool. Not the same
  thing, and the distinction was locked early.
- **The beachhead framing:** one client, one workflow, one market, as a wedge into AI-native real
  estate tooling. The long-run articulation is a Bloomberg terminal for real estate — see
  `git show prototype/main:docs/PROJECT_CONTEXT.md` §7.
- **The naming problem is unresolved.** `SOLUM` is a live trademark held by a Samsung
  Electro-Mechanics spin-off moving into software `[relayed]`. Working title until the first paying
  invoice.

### Two generations of the same product

**The prototype** (`solum.html`, ~233KB, one file, no build step) is the thing Al Mizan has actually
used. Deployed at `solum-beta-navy.vercel.app`. It has considerably more in it than the deployed page
suggests: a `dld_transactions` store of roughly 4,000 rows, a real comparables method with P5–P95
outlier trim per unit type and one-year-half-life recency weighting, a working DLD ingest path, RLS
correctly enabled, seven migrations, and a **full quarterly cashflow** with cost inflation, price
growth, off-plan share and a 20/50/30 booking/construction/handover split `[verified via
prototype-audit.md]`. There is no Cashflow *tab*, which is what misled the first read of it.

**The rebuild** (this tree) is a pnpm monorepo: `packages/engine` (pure TypeScript appraisal core,
no network/database/clock/randomness, versioned, trace-emitting, 48 tests), `packages/db` (Postgres,
five migrations, RLS by organisation, immutable assumption sets, pinned comparable snapshots), and
`apps/web` (Next.js, server-rendered, four surfaces: Pipeline, New plot, Compare, Market).

The rebuild exists because four things in the prototype are structural and get more expensive every
week: calculation lives with presentation, market data is not versioned, assumptions are not
snapshotted, and there is no tenancy boundary. Detail in `docs/architecture.md` §1.

### The two capabilities Solum uniquely holds

Against ARGUS, Aprao and Feasly, Solum wins exactly two rows in the feature table, and both are
epistemic rather than functional `[verified via competitive-landscape.md §4]`:

1. **Every number carries its derivation** — an ordered trace of steps, each naming its inputs, its
   rule and its result.
2. **The engine can refuse.** When inputs contradict each other, a `blocker` flag suppresses the
   verdict entirely and the instrument stamps **Withheld**.

These cost days, not years, and they attack the credibility problem rather than the feature problem.
Hold on to this — §7 argues the next breakthrough is the completion of exactly this axis.

---

## 3. The client, and what they actually asked for

`git show prototype/main:docs/feedback/2026-08-almizan-demo.md`, dated 2026-08-07, is the most
important document in the project. Twenty-one numbered items from a live demo on real credentials.

**The headline finding: not one item was a bug report.** Nothing came back as "your number is wrong",
which was the exposure going in. What came back was almost entirely **explainability and guidance** —
items 1, 4, 8 and 9 are the same request in four forms: *tell me what this means and what to do about
it*.

Their triage, which the build order follows rather than ours:

| Bucket | Items |
|---|---|
| **Blocks trust** | Label every PSF with its denominator (sale = saleable, construction = BUA, land = plot — three denominators on one screen, none labelled). Explain RLV on screen. Provenance separating authority data from agent-entered data (item 21). |
| **Blocks use** | 4BR as a unit type. Segment-aware comparables — their v1 heuristic is top 5% of transactions = luxury (items 3, 7). Timeline and payment plan asked at plot creation (12). "This does not work, here is what would fix it" (4). |
| **Extends** | Everything else: plot discovery, aggregation, absorption, rendering, brokerage. |

**Their explicit warning, which I want kept in front of every roadmap conversation:**

> A chatbot that adjusts assumptions is worth nothing if the underlying assumptions are not yet
> trustworthy or explainable. Fix the explainability by hand first.

The AI layer is the most-requested thing in their list *and* the thing they warned against building
first. Both, from the same client, in the same session.

### The one idea in that document worth more than any feature

Item 13 and their closing insight: **FAR drives timeline, timeline drives capital rotation, so IRR
and not ROI is the comparison that matters.** A smaller low-FAR plot can beat a larger high-FAR one
through lower construction cost, faster completion and earlier cash recovery.

Our own triage note names why this one is different, and it is the sentence I keep coming back to:

> This is the most valuable idea in the document and **it is not a feature, it is a change to what
> the product optimises.**

That line is the discriminator. §7 runs every breakthrough candidate through it.

### Still open with the client

- Better comps (3, 7) or the failure-recommendation engine (4) first? Both bucket 2, cannot do both.
- Is positioning (luxury / mid / affordable) known at plot stage, or decided *from* the analysis?
  That determines whether `comparable_snapshots.segment` is an input or an output.
- **Did Al Mizan ever reconcile any of it against their own Excel?** Their own note calls this "the
  single most important unknown." It still is, twenty days later.
- **AIRE sample feasibility report** — never arrived. The output artifact drives the result data
  model more than any screen does.
- **Land Sterling proposal methodology** — the closest available spec of how incumbents actually
  compute their numbers.

---

## 4. Competition — who we are actually against

Full detail in `docs/competitive-landscape.md`. The three things that matter:

**The list we were given was mostly not competitors.** AIRE, Land Sterling, ValuStrat and Stonehaven
are consultancies selling reports `[verified]`. Two of them are the **distribution channel**, not the
competition — Land Sterling and ValuStrat will not build software and would rent it.

**Feasly is the real competitor, and it was not on the list.** "Real Estate Feasibility Software for
the GCC" — shipping, with cashflow, interest, LVRs, scenario comparison, and senior debt + mezzanine
+ profit splits `[verified]`.

**The pricing anchor is software, not consulting.** Feasly Lite **$49**/user, Feasly Pro **$149**/user
`[verified, own site]`. Aprao indicatively $549 + $900 setup `[verified but competitor-sourced]`. The
earlier internal assumption — "AED 500–1,000 a seat is trivial ROI against a USD 7,000 study" — rests
on a price AIRE has never published. **Do not use that number in a meeting.**

### The consultants converge on one thing, and it is the roadmap signal

AIRE (AED 20,000, 3 weeks, sells technology) and Land Sterling (AED 73,500, 10–12 days, sells RICS
signature) agree on almost nothing. Both put **Highest & Best Use** at the centre of a land-buy study
`[verified via prototype/main:market-inspirations/analysis/consultants-vs-solum.md]`. When two firms with opposite business models structure the
same job the same way, that structure is signal.

And neither is a rival on timing. At AED 20k-plus and multi-week turnaround, you commission a study
only *after* shortlisting. **Solum is the layer that runs on every plot instantly to decide which one
is worth a consultant.** Sequential, not competing.

Also worth stating plainly: both consultants **withhold the model** — AIRE keeps the Excel, Land
Sterling states the model is "not a deliverable". The client pays tens of thousands and receives a
PDF of outputs. Solum's model is live, inspectable and re-runnable. That is a category difference and
it should be said out loud in the pitch, not left as an implementation detail.

---

## 5. The Dubai wedge — and the reason it is not built

`docs/domain-model.md` is the source. The thesis in one line:

> Aprao, ARGUS and Feasly all model **lender-funded** development. Dubai off-plan is **buyer-funded** —
> purchasers pay instalments into a RERA-escrowed project account during construction. The developer's
> working capital *is* the collection curve, not a facility.

A scheme can be highly profitable on a static residual and still fail on timing. **That failure mode
is invisible in every tool on the market, and it is the one that actually kills Dubai developers.**
The engine's interfaces already take a comparables band and an absorption curve as *inputs*, so the
models slot in without reshaping anything.

The mechanics that have to be modelled `[verified against secondary sources 2026-08-10, not against
the legislation]`: escrow mandatory per Law No. 8 of 2007; ≥20% of estimated construction cost
pre-funded before sales commence (Law No. 9 of 2007); releases gated on an independent engineer's
certificate plus RERA approval, not on spend; 5% retained one year past completion as a defects
guarantee; buyer-default retention stepping 25% / 40% / full with completion stage (Law No. 19 of
2017); payment plans from 80/20 through 1%-monthly to post-handover plans deferring 40–60% of price
interest-free over 2–5 years.

That last one is the single most valuable thing this product could quantify: an interest-free
post-handover deferral is vendor finance at zero nominal rate — it moves units fast and severely
damages IRR, and a static residual land value cannot see the tradeoff at all.

### Why this is a blocker and not a backlog item

**Every figure above comes from law-firm commentary and property guides, not from the legislation.**
Good enough to design an engine around. Not good enough to compute a client's land value with. A
wrong retention percentage does not throw an error — it silently shifts every cashflow the product
will ever produce, and the mistake surfaces after a developer has already bid.

Five questions are open and none can be answered from a property blog `[verified via domain-model.md
§6]`:

1. The **Oqood fee** is required; the cost is not established. Every appraisal's cost total is
   understated by an unknown amount.
2. **Escrow release lag** — how long between certificate and funds landing? This is the difference
   between a working-capital problem and a rounding error, and no secondary source documents it.
3. Does the **5% retention** apply to the escrow balance at completion, or to 5% of total project
   value? The two readings differ materially and the phrasing found is ambiguous.
4. Minimum construction progress before off-plan sales may commence.
5. Whether the 20% pre-funding can be satisfied by **guarantee rather than cash** — this decides
   whether it is a funding outflow or a fee.

DEWA connection charges and master-developer infrastructure contributions are not modelled at all.

**The honest tech-lead read: the wedge is not blocked on engineering. It is blocked on a lawyer.**
One conversation with a Dubai real estate lawyer, or a direct read of the published laws, unblocks
the highest-value differentiator in the product. That is a cheaper action than any sprint, and it has
not been taken.

---

## 6. The floor-plan / open-source thread — re-checked, not relayed

This came in as a set of shared links about floor plans and open-source code, and the prior analysis
of them concluded: build a generative massing engine end to end. **That analysis was produced in a
session with no network access.** Every repository claim in it was inference from the names. Network
works here, so I checked all of them against the GitHub API on 2026-08-27.

| Project | What it actually is | Stars | License | Last push |
|---|---|---|---|---|
| `ennauata/housegan` | House-GAN — graph-constrained **house layout** generation from a bubble diagram | 293 | "Other" (not OSI) | 2024-03-28 |
| `ennauata/houseganpp` | House-GAN++ | 254 | "Other" | 2024-03-28 |
| `ludolara/floor-plan-rlvr` | ACL 2026 Findings paper. Fine-tunes Llama-3.3-70B to emit **room polygons, room areas, doors** as JSON from a room-count + bubble-diagram constraint set. Trained on RPLAN | **5** | **none declared** | 2026-07-30 |
| `ibuilder/massing` | Self-hosted IFC-native AEC platform | 131 | MIT | 2026-08-26 |
| `IfcOpenShell/IfcOpenShell` | The real open-source IFC toolkit | 2,732 | LGPL-3.0 | 2026-08-26 |
| `ThatOpen/engine_web-ifc` | IFC read/write in JS at native speed | 1,022 | MPL-2.0 | 2026-08-24 |
| `shapely/shapely` | Polygon offset / boolean ops — the setback maths | 4,493 | BSD-3-Clause | 2026-08-20 |
| `mozman/ezdxf` | DXF read/write | 1,422 | MIT | 2026-08-26 |
| `google/or-tools` | CP-SAT — the unit-mix / parking packing solver | 13,946 | Apache-2.0 | 2026-08-26 |
| `DEAP/deap` | Genetic algorithms | 6,436 | LGPL-3.0 | 2026-04-17 |

`[all verified 2026-08-27 via api.github.com]`

**TestFit and Finch3D are commercial SaaS, not open source** `[verified 2026-08-27 — both resolve to
live marketing sites]`. If "their open source code" referred to those, there is nothing to read.

### The finding that decides this

Apply the one question that matters: **does it output what the feasibility engine consumes?** The
engine consumes floor count, plate area, unit counts by bedroom type, parking count. It never asks
what a 2BR looks like inside.

House-GAN, House-GAN++ and floor-plan-rlvr all answer the **interior unit layout** question: given a
room count and an adjacency graph, where do the rooms go inside one dwelling. That is a real research
problem and it is **not a question Solum's engine asks at any point**. Feeding a bubble diagram in
and getting room polygons out does not move a single number in an appraisal.

Three further problems with that branch, in descending order of how fatal they are:

1. **`floor-plan-rlvr` declares no license.** No license means all rights reserved — it cannot be
   used in a commercial product at all, regardless of technical merit. Five stars, zero forks, one
   author. It is a paper artifact.
2. **House-GAN's license is "Other", not an OSI license**, and its training data (RPLAN / LIFULL) is
   research-use. Same commercial problem, and the code has not been touched since March 2024.
3. **`ibuilder/massing` is 10 weeks old** (created 2026-06-14) with ~2,400 commits from a single
   author plus `cursoragent` and `claude` bot commits, and a README claiming ~100 modules including
   a development proforma. It may well be useful, and MIT is the right license. But a 10-week-old
   single-author repo of that claimed breadth is a thing to *read for ideas*, not a thing to depend
   on. Worth noting it ships a development proforma module — the closest thing to an open-source
   overlap with Solum's own core that I have found.

The mature, genuinely usable tools on that list are the boring ones: shapely, ezdxf, OR-Tools,
IfcOpenShell. All permissive or LGPL, all actively maintained, none of them AI.

### And the repo already decided this, eight weeks ago

`git show prototype/main:docs/prd/light-hbu.md` §6, written 2026-07-25, lists under **explicitly out
of scope**:

> **Massing and design.** Capacity is strategic and indicative, same scope note the consultants put
> on their own massing stage.

and

> **Combinatorial scenario generation** ("hundreds of options"). That is marketing. A curated set of
> 4–6 sensible strategies is more useful and more honest than a machine-generated haystack.

That PRD also already contains the only capacity maths that is actually needed — four lines for the
low-rise case (`plotArea × coverage × floors × efficiency ÷ avgUnitSize`), with the apartment case
already handled by the existing `EFF` model. **The massing problem, scoped to what the engine
consumes, is four lines of arithmetic that were specified a month ago.** It does not need a GAN, an
LLM, a genetic algorithm, or a 3D viewer.

**Verdict: generative massing is a feature, and Al Mizan's own triage puts it in bucket 3.** It earns
its place in the product as an **input to the timeline model, not as a rendering** — floors and
basements are what drive construction duration, duration drives capital rotation, and that is the
FAR→timeline→IRR chain the client called the most valuable idea in their document. A crude
deterministic massing model returning floor count and basement count is worth more than a beautiful
one returning images.

> **One gap I should name rather than paper over.** The actual shared links are not on this machine —
> I searched Downloads, Desktop, Documents and the project trees and found none of these names
> anywhere on disk `[verified 2026-08-27]`. The repository list above is reconstructed from a pasted
> prior conversation, and I have verified those repositories exist and are what they appear to be.
> If the shared links pointed somewhere else, this section needs redoing against the real ones.

---

## 7. The breakthrough question, from the tech lead's chair

The test is the client's own, and it is the sentence from their triage: *is this a feature, or is it
a change to what the product optimises?* Ranked by that test, then by what is actually blocked.

### 1. Sensitivity-ranked provenance — the uncertainty ledger

**This is the one I would build, and it is blocked on nothing.**

Solum already wins exactly two rows against every incumbent: the trace, and refusal. Both say the
same thing — *the product knows what it knows*. The uncertainty ledger is the completion of that
axis, and it is the only candidate here that requires no new data, no regulatory answer and no
vendor.

The engine is pure and does no I/O, so an input can be perturbed and the whole appraisal recomputed
in process. **Measured 2026-08-27: `appraise()` runs in 0.041 ms on the beta fixture** (2,000 runs,
after warm-up), so a one-at-a-time sweep over the ~28 inputs that actually enter the residual, at
two perturbations each, is roughly **2.3 ms** — synchronous, inside the request, no queue.
(`BUILD-PLAN.md` §2 has the subset and why `plot.landCost` is not in it.) Give every input a provenance tier (`sourced`
/ `modeled` / `input` — the vocabulary already exists in the prototype UI) and a stated ± band, then
rank inputs by their contribution to the spread in residual land value. The output stops being a
number and becomes something like this — *illustrative shape, not engine output*:

> Residual land value AED 83.2M. **60% of the uncertainty in that figure comes from one number: the
> construction cost per sqft, which you typed and nothing verified.** Verify it and the band halves.

Why this is the breakthrough and not a nice-to-have:

- **It changes what the product optimises** — from producing a defensible number to *ranking what
  makes the number indefensible*. That is a different objective function, and it passes the client's
  own test.
- **It delivers item 8 without building the AI layer they warned against.** Yogi's ask was literally
  "out of thousands of assumptions, tell me which ones to review — misc cost unusually high, parking
  too high, efficiency low, construction cost looks high." Sensitivity ranking answers that by
  *computation*, not by an LLM guessing. It is the guidance layer, arrived at from the direction the
  client said was safe.
- **It makes item 21 load-bearing instead of cosmetic.** Their stated risk is an agent supplying a
  GFA the authority later contradicts. Today provenance is a badge. Here, "agent-entered" carries a
  wider band, which propagates, which surfaces that plot at the top of the review list automatically.
- **No incumbent has it.** ARGUS, Aprao and Feasly all produce point numbers with manual sensitivity
  grids you have to know to go looking for. And Aprao's IRR was observed producing 912% and -100%
  outputs `[relayed via prototype/main:docs/PROJECT_CONTEXT.md §4]` — a metric that can print nonsense is a liability. An
  engine that reports its own confidence is the structural answer to that failure.
- **It is the natural home for the refusal behaviour.** A blocker flag is the degenerate case of the
  same machinery: uncertainty so wide the verdict is meaningless.

One honesty constraint to build in from the start, because this project's whole culture is not faking
rigor: one-at-a-time perturbation ranks *which assumptions matter most*. It is not a probability
forecast. Calling the output P10/P50/P90 only becomes legitimate once the DLD-fitted price
distribution exists. Until then it ships as a **sensitivity ranking with stated bands**, labelled as
exactly that. `docs/domain-model.md` §5 lists uncertainty as step 7 of 7, blocked behind the DLD
store — I think that is wrong, and this is the correction: the *ranking* is blocked on nothing, only
the *distribution* is.

### 2. FAR → timeline → IRR

The client's own number one, and the second-cleanest pass of the test — it changes the ranking key
from ROI to IRR, which reorders the pipeline itself. Compare today says out loud that it cannot see
this: "timeline and capital rotation are not modelled, so it compares profitability rather than
risk-adjusted return on capital."

The cheap first step is already scoped by their triage: make timeline a function of floors and
basements rather than a constant, and lead with IRR on Compare. `irr()` is already built and tested,
including its refusal to return a number for a degenerate series.

**This is where massing legitimately enters the product** — as the function that turns a plot and an
FAR into a floor count and a basement count, which is a duration, which is a discount rate applied to
real cash. Four lines of arithmetic, per the light-HBU PRD. Not a renderer.

### 3. The escrow-gated collection curve

The largest structural moat of the three — no competitor models any of it, and it is the failure mode
that actually kills Dubai developers. It ranks third only because of §5: **it is blocked on
regulatory verification, and no amount of engineering removes that block.** Building a collection
curve on a `[relayed]` retention percentage produces a confidently wrong number, which is worse for
this product than having no curve at all.

The sequencing that follows: get the legal answers first (one lawyer, one conversation), then build.
Meanwhile the four pieces that are *not* blocked on anything — cost curve, payment plan, escrow
mechanics, cashflow — are pure mechanics and produce the Finance and Cashflow tabs the landing page
already claims exist.

### Below the line

**Segment-aware comparables** (items 3, 7) is real, is bucket 2, and is half-built —
`scripts/market-scrape/` has the Firecrawl pipeline and the percentile bifurcation, deliberately
stopping before it writes to Postgres until the extraction has been eyeballed against a real page.
Finish it. But it is a feature: it makes the existing number better rather than changing what the
product optimises.

**Light HBU** (`git show prototype/main:docs/prd/light-hbu.md`) is the best-specified unbuilt thing in
the project, and the
consultants' convergence is genuine signal. Its one insight is worth carrying regardless of when it
ships: RLV is land-price-independent, so it is already the correct objective to rank strategies on.
The engine change it needs is one parameter on `optimise()`.

**What I would not build:** the AI assistant layer, plot discovery, aggregation, rendering, brokerage.
Not because they are bad ideas — several are excellent — but because the client warned against the
first one explicitly and the rest are bucket 3 by their own sorting.

---

## 8. Document map

**In this tree** (`/Users/aagarwal/solum`):

| Doc | What it holds |
|---|---|
| `README.md` | Current build state, what is built, what to build next. Note the broken §Docs link — §1 above. |
| `docs/architecture.md` | Why the prototype shape fails, the pure-engine rule, the two data planes, tenancy, what "scaling" means here |
| `docs/competitive-landscape.md` | Who we are against, with published pricing. Three earlier claims corrected |
| `docs/domain-model.md` | Escrow and payment-plan mechanics. **Read the warning at the top** |
| `docs/prototype-audit.md` | What the prototype really contains, and the claims I got wrong from the outside |
| `docs/neon.md` | Deploying the database, and the RLS bug Neon surfaced that a local superuser hid |
| `scripts/market-scrape/README.md` | The look-before-you-write segmentation pipeline |

**In the prototype tree** — and, per §1, nowhere else in the world right now. These paths do **not**
resolve in this checkout. Reach them either at `/Users/aagarwal/solum-prototype-local/<path>` or, from
anywhere in the repo, with `git show prototype/main:<path>` — the form `prototype-audit.md` already
uses:

| Doc | What it holds |
|---|---|
| `docs/feedback/2026-08-almizan-demo.md` | **The most important document in the project.** 21 client items + our triage |
| `docs/PROJECT_CONTEXT.md` | Strategy: why this exists, the Bloomberg thesis, Aprao/JD Console/BCG references, decisions 1–16 |
| `SOLUM_CONTEXT.md` | Build layer: the 19 locked design decisions, the token architecture, the THEME bridge |
| `docs/DECISIONS.md` | Dated decision log, newest first |
| `docs/WORKING_AGREEMENT.md` | **How to work in this repo.** Brainstorm by default; writes gated; git gated separately |
| `docs/prd/light-hbu.md` | Highest & Best Use, four-test framework mapped to existing code. The best-specified unbuilt thing here |
| `docs/prd/dld-comps-integration.md` | The DLD comp data layer |
| `docs/prd/market-insights.md` | Market intelligence layer, guardrails included (velocity ≠ absorption) |
| `market-inspirations/analysis/consultants-vs-solum.md` | AIRE vs Land Sterling vs Solum. Where the HBU signal comes from |
| `market-inspirations/analysis/aire-vs-solum.md` | The ranked-priorities analysis |

---

## 9. The standing rules

From `WORKING_AGREEMENT.md`, and they apply to sessions as much as to people:

- **Default mode is brainstorm.** Reading is always allowed; writing is gated on an explicit
  go-ahead; **git is gated separately** — approving a build is not approval to push it.
- **"push it"** commits the agreed change and pushes in one step. **"lock it"** writes the decision
  into `DECISIONS.md`.

And from this tree:

- Money is stored as **integer fils**, never floats.
- Credentials are never committed, including demo and client accounts. `inbox/` is gitignored.
- **Seeded market data is tagged `source = 'seed'` at the row level and must be surfaced as such.**
  Synthetic data presented as observed market data is worse than no data, because nobody downstream
  can correct it.
- The engine is pure: no network, no database, no clock, no randomness. A formula change is a version
  bump, never an edit in place, and stored appraisals are never silently recomputed.

---

## 10. What I would do next, in order

1. **Push the `prototype` refs somewhere.** Forty commits of the project's best thinking exist on one
   laptop and their remote is gone. Minutes of work.
2. **Fix the README's broken link to the Al Mizan feedback**, or bring that file onto this branch.
3. **Ask the lawyer.** Five regulatory questions block the highest-value differentiator in the
   product. One conversation, and it is not an engineering task.
4. **Build the uncertainty ledger** (§7.1). It is blocked on nothing, it completes the axis Solum
   already uniquely owns, and it delivers the client's guidance ask from the safe direction.
5. **Make timeline a function of floors and basements, and lead with IRR on Compare** (§7.2). The
   client's own number one, and the only place a massing model earns its keep.
6. **Finish the segmentation pipeline** — eyeball step 1's extraction against a real page, then land
   step 3 into Postgres.
7. **Get the answer to the Excel question.** Their own note has called it the single most important
   unknown since 7 August.
