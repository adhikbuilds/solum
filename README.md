# Solum

Land feasibility and development appraisal for Dubai residential development.

A beta prototype is deployed at `solum-beta-navy.vercel.app`. This repo is the rebuild. It runs
entirely locally — no cloud dependency — and is structured so it can move to AWS later without
reshaping the code.

## What the prototype actually is

Source at `github.com/DKubadia/solum`, available here as the `prototype` remote (fetched, not
merged). Read [`docs/prototype-audit.md`](docs/prototype-audit.md) before anything else — several
claims made from black-box inspection of the deployed page were wrong, and they are corrected there.

It has more than the page suggests: a `dld_transactions` store of roughly 4,000 rows, a real
comparables method (`get_comps()` — P5–P95 outlier trim per unit type, recency weighting on a
one-year half-life), a working DLD ingest script, RLS correctly enabled, seven migrations, written
PRDs, and a competitor analysis.

What it lacks is structural, and it is what this rebuild addresses: plots are scoped per user
(`user_id = auth.uid()`) rather than per organisation; a plot is a single `data jsonb` blob
overwritten in place, so there is no appraisal history; comparables are computed live against
`current_date`, so a saved plot silently re-prices as data moves; and the calculation runs in a
218KB single-file page with no build step.

It also has a **full quarterly cashflow** — `cashflow()` in `solum.html` — with cost inflation,
price growth, off-plan share and a 20/50/30 booking / construction / handover split, plus peak
funding and an annualised IRR. There is no Finance or Cashflow *tab*, which is what misled me from
the outside, but the logic exists. It even hit the same IRR sign-change problem this engine guards
against, and solved it the same way: launch follows acquisition rather than sitting at period zero.
What it does not have is an S-curve — construction spreads linearly with escalation.

## Where the value actually is

Not the comparables — DLD transaction data is widely available and Dubai Municipality is reportedly
shipping a free plot-discovery platform. The wedge is that **in Dubai off-plan, the buyer funds the
build through a RERA-escrowed payment plan, not the lender.** Aprao, ARGUS and every other incumbent
model UK-style development debt. The collection curve is a structurally different engine, and nobody
has built it.

Four modelling problems, in dependency order. None are built yet — but the prototype already has a
`dld_transactions` store and a working ingest script, so these are no longer blocked on data access
the way I first assumed:

1. **Price model** — price per sqft as a function of community, unit type, size, floor, completion
   date and time, fitted on DLD transactions. Replaces a hardcoded number with a band, a confidence
   interval and a sample size.
2. **Absorption forecast** — given price, mix, competing supply and handover date, how fast units
   actually sell, month by month.
3. **Collection curve** — absorption × payment plan × escrow release rules = cash in, by month.
4. **Uncertainty** — distributions propagated through all of the above, output as P10/P50/P90
   residual land value rather than three fixed scenarios.

The engine's interfaces take a comparables band and an absorption curve as **inputs**, so these
models slot in later without reshaping anything.

## What is built

`packages/engine` — the calculation engine. Pure TypeScript: no network, no database, no clock, no
randomness. Same inputs always produce the same outputs, and every result carries the engine version
that produced it plus a full trace of how each number was derived.

It implements the credibility fix first: **the engine can refuse.** When inputs contradict each
other — a launch price above the tool's own comparables band, or a downside scenario running at a
loss — it raises a blocking flag and returns no verdict at all. Being able to decline to call a deal
is what makes the calls it does make worth something.

> **A correction worth keeping.** The earlier analysis held that the prototype "printed PASS on a
> loss-making downside" and treated that as the defect losing the account. Its verdict vocabulary is
> `PURSUE / NEGOTIATE / PASS`, where **PASS means pass on the deal** — decline it. The tool was
> saying the right thing and the analysis misread the label. Al Mizan's feedback contains no bug
> report at all. The refusal behaviour here is still worth having, but as explainability, not as a
> fix for a bug that was never there. This engine avoids the ambiguity entirely: verdicts are
> `PASS / MARGINAL / FAIL / NO_VERDICT` and the interface renders them as
> Endorsed / Held / Declined / Withheld.

## It is a platform, not a report

Auth is real and tenant context comes from the session, not from "the first organisation in the
table". Row-level security can only isolate tenants if something actually chooses which tenant a
request is for.

- **Sign in** with opaque server-side sessions rather than a stateless token, because revocation has
  to take effect immediately — an analyst leaves, a laptop goes missing, and access stops now.
  Deleting a row does that; invalidating a signed token needs a denylist, which is a session table
  with extra steps. scrypt from the standard library, salted per password.
- **Roles.** A `viewer` reads an appraisal and its derivation but cannot re-run it.
- **Change an assumption and recompute.** Land price, construction cost per sqft of BUA, hurdle,
  downside severity, and each unit type's price. Fields are pre-filled as placeholders rather than
  defaults, so nothing is resubmitted by accident, and a blank field means "leave this alone".
- **Nothing is ever overwritten.** A re-run writes a new appraisal linked to the one it supersedes,
  a new assumption set and a new result, against the *same* pinned comparables snapshot — so it is a
  re-run of the same view of the market, not a refresh of it. Verified: a plot went Declined at
  AED 120,000,000 to Endorsed at AED 90,054,101, and the original run is byte-identical afterwards.
- **Run history** on every plot. The prototype stored a plot as one jsonb blob overwritten in place,
  so "how did our view of this site change" was unanswerable. Here it is a query.

Checked by command, not by clicking once: `pnpm db:verify-auth` (15 checks — salting, timing,
expiry, revocation, session unguessability, and that the app role cannot read the sessions table at
all) and `pnpm db:verify-rls` (6 checks).

## The interface

`apps/web` — Next.js, server-rendered from Postgres. Every read goes through `withTenant`, so
row-level security does the filtering; no query carries a `WHERE organisation_id` clause, because
authorisation the application has to remember to apply is authorisation that gets forgotten.

The direction is **document-on-desk**, not dashboard. The characteristic artifacts of Dubai land are
the affection plan and the engineer's completion certificate that gates every escrow release — both
stamped, dated, endorsed documents. So an appraisal is an instrument sheet with an endorsement
stamp, and the stamp reads **Withheld** when the engine declines to call the deal. Vermilion is
reserved absolutely for annotation and withholding, the way a checker marks up a survey drawing in
red; if something is red on the page, a human needs to look at it.

Three things it does that the prototype did not, each from Al Mizan's feedback:

- **Every figure names its denominator** — sale price per sqft of saleable, construction per sqft of
  BUA, land per sqft of plot. Their first question was exactly this.
- **Every number opens to its derivation** — the ledger gives the rule in surveyor's notation and
  the inputs that went in. Collapsed by default: the clutter problem was not too much information,
  it was information arriving with equal weight whether or not it was wanted.
- **A declined plot says what would fix it** — one lever at a time, with the exact figure. A FAIL
  becomes "negotiate the land to AED 90,054,101, 25% below asking"; a withheld plot becomes "reprice
  1BR to AED 1,816 and the blend moves to AED 1,798". Where it is a judgement rather than
  arithmetic, it says so and declines to decide.

The pipeline shows headroom against the walk-away price rather than the residual land value itself —
residual is a property of the scheme, so plots sharing a mix share it, and two identical figures
read as a bug.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — why the prototype shape fails, the two data planes,
  tenancy model, and what "scaling" means for a product whose entire value is a number being right.
- [`docs/competitive-landscape.md`](docs/competitive-landscape.md) — who we are actually against,
  with published pricing. Three claims from the earlier analysis did not survive checking.
- [`docs/domain-model.md`](docs/domain-model.md) — the Dubai escrow and payment-plan mechanics the
  wedge depends on, sourced and tagged, with the open questions listed.

## Running it

```bash
cp .env.example .env
pnpm install
pnpm db:up          # local Postgres in Docker on :5433
pnpm db:migrate
pnpm db:seed        # synthetic transactions; the comparables band is DERIVED from them
pnpm demo           # the engine, on the prototype's own numbers
pnpm dev            # the app on http://localhost:3100
pnpm verify         # tests + typecheck + tenant-isolation checks
```

Node 20+ and Docker. Nothing cloud-specific. Neon is Postgres, so moving there is a `DATABASE_URL`
change — see `.env.example`.

Seeded market data is tagged `source = 'seed'` at the row level and must be surfaced as such in the
UI. It flows through the real query path rather than being hardcoded in a component, so the pipeline
is genuinely exercised while DLD access is settled. Synthetic data presented as observed market data
is worse than no data, because nobody downstream can correct it.

## What to build next

Ordered by Al Mizan's own triage (`docs/feedback/2026-08-almizan-demo.md`, 2026-08-07), not ours.
Their note is blunt: not one item was a bug report — it is almost entirely explainability. And they
warned explicitly against building the AI layer before the numbers can explain themselves.

**Blocks trust:** label every PSF with its denominator (sale = saleable, construction = BUA,
land = plot — three denominators on one screen, none labelled); explain residual land value on
screen; separate authority data from agent-entered data.

**Blocks use:** 4BR as a unit type; segment-aware comparables (their v1 heuristic: top 5% of
transactions = luxury); timeline and payment plan asked at plot creation; and *"this does not work —
here is what would make it viable"* instead of a bare verdict.

**The strategic one:** FAR drives timeline, timeline drives capital rotation, so **IRR not ROI** is
the comparison that matters. Cheap first step is making timeline a function of floors and basements
rather than a constant.

## Open blockers

1. **AIRE sample feasibility report** — never arrived. The output artifact drives the result data
   model more than any screen does.
2. **Land Sterling proposal** — methodology in detail; the closest available spec of how the
   incumbent consultancies actually compute their numbers.
3. **Did Al Mizan reconcile anything against their own Excel?** Their own triage calls this "the
   single most important unknown." It still is.

## Conventions

Claims here carry a source tag: `[verified]` checked directly against a primary source with a date,
`[relayed]` from prior analysis pasted in and not re-checked, `[assumption]` our own inference.
Anything `[relayed]` or `[assumption]` that a calculation depends on is a blocker, not a footnote —
a wrong escrow retention percentage silently corrupts every cashflow the product ever produces.

Money is stored as integer fils, never floats. Credentials are never committed, including demo and
client accounts. `inbox/` is gitignored for client-supplied source documents pending review.

> **Naming:** `SOLUM` is a live trademark held by a Samsung Electro-Mechanics spin-off that is moving
> into software. Retained as a working title; resolve before the first paying invoice.
