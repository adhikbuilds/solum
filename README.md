# Solum

Land feasibility and development appraisal for Dubai residential development.

A beta prototype is deployed at `solum-beta-navy.vercel.app`. This repo is the rebuild. It runs
entirely locally — no cloud dependency — and is structured so it can move to AWS later without
reshaping the code.

## What the beta actually is

Checked directly on 2026-08-09:

- One 223KB HTML file. No build step, no framework. Supabase loaded from a CDN `<script>` tag.
- Three database tables: `plots`, `dld_locations`, `area_aliases`.
- No transactions table, so comparables cannot be derived from data.
- Comparable project names are string literals in the page source.
- No regression, no forecasting, no model of any kind.

Tabs are Summary, Unit Matrix, Assumptions, Plot Details, Market insights. There is no Finance tab
and no Cashflow tab, while the landing page advertises "Cashflow & Timeline — peak funding, time to
handover, payment plan modeling" as a shipped feature.

This is a form, some arithmetic, and a plot store. Treat it as a source of decisions someone already
made about Dubai cost lines, not as a foundation.

## Where the value actually is

Not the comparables — DLD transaction data is widely available and Dubai Municipality is reportedly
shipping a free plot-discovery platform. The wedge is that **in Dubai off-plan, the buyer funds the
build through a RERA-escrowed payment plan, not the lender.** Aprao, ARGUS and every other incumbent
model UK-style development debt. The collection curve is a structurally different engine, and nobody
has built it.

Four modelling problems, in dependency order. None are built yet, and all three of the later ones
need a DLD transaction store that does not exist:

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
is what makes the calls it does make worth something. The beta printed PASS on a loss-making
downside; that single behaviour is what loses an account permanently.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — why the prototype shape fails, the two data planes,
  tenancy model, and what "scaling" means for a product whose entire value is a number being right.
- [`docs/competitive-landscape.md`](docs/competitive-landscape.md) — who we are actually against,
  with published pricing. Three claims from the earlier analysis did not survive checking.
- [`docs/domain-model.md`](docs/domain-model.md) — the Dubai escrow and payment-plan mechanics the
  wedge depends on, sourced and tagged, with the open questions listed.

## Running it

```bash
pnpm install
pnpm test          # engine unit tests, hand-computed expected values
```

Node 20+. Nothing else required — no Docker, no database, no cloud account.

## Open blockers

**Two documents were referenced when this was scoped and never arrived.** Both matter more than
further competitor research:

1. **AIRE sample feasibility report** — the end-outcome artifact. What a deliverable must contain to
   be accepted by a Dubai developer or lender. This drives the result data model more than any
   screen does.
2. **Land Sterling proposal** — described as setting out methodology in detail. The closest available
   written spec of how the incumbent consultancies actually compute their numbers.

Also unresolved: **how DLD data is obtained** (official API, licensed reseller, or manual). This
blocks the entire market-data side and therefore all four models above.

## Conventions

Claims here carry a source tag: `[verified]` checked directly against a primary source with a date,
`[relayed]` from prior analysis pasted in and not re-checked, `[assumption]` our own inference.
Anything `[relayed]` or `[assumption]` that a calculation depends on is a blocker, not a footnote —
a wrong escrow retention percentage silently corrupts every cashflow the product ever produces.

Money is stored as integer fils, never floats. Credentials are never committed, including demo and
client accounts. `inbox/` is gitignored for client-supplied source documents pending review.

> **Naming:** `SOLUM` is a live trademark held by a Samsung Electro-Mechanics spin-off that is moving
> into software. Retained as a working title; resolve before the first paying invoice.
