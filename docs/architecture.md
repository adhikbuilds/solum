# Architecture

The prototype answers "can we show a plausible number on a screen." This document answers a
different question: **can the same number be reproduced, defended and audited eighteen months from
now, by someone who was not in the room.** Everything below follows from that.

---

## 1. Why the prototype shape fails

The beta is a Vercel deployment whose tabs are Summary, Unit Matrix, Assumptions, Plot Details and
Market insights `[verified 2026-08-09, fetched directly]`. It has no Finance tab and no Cashflow tab,
while the landing page advertises "Cashflow & Timeline — peak funding, time to handover, payment plan
modeling" as a feature `[verified 2026-08-09]`. Its comparables panel carries a `COMING SOON` badge
and its recommended launch price does not follow from the three comps displayed beside it.

Four structural problems, in order of how expensive they are to fix later:

**1. Calculation lives with presentation.** If the appraisal maths runs in the browser next to the
chart that renders it, there is no way to prove what produced a given number. The moment a developer
puts an AED 83M land value in front of a credit committee, "the app said so" is not an answer. This
is the single most expensive thing to retrofit, because it means untangling every component.

**2. Market data is not versioned.** The prototype has a "Refresh DLD market comps" action. If
comparables mutate under a saved appraisal, the same plot yields a different answer next week with no
record of why. That destroys trust faster than being wrong, because being wrong is at least
explicable.

**3. Assumptions are not snapshotted.** An appraisal is a function of roughly forty inputs. Storing
only the latest values means the PDF exported in March cannot be regenerated in June.

**4. No tenancy boundary.** Adding organisations, seats and sharing after the schema exists is a
migration across every table.

None of these are performance problems. Scaling here is not about requests per second — it is about
**the number of appraisals whose provenance you can still defend** as the user count grows.

---

## 2. The central rule: the calculation engine is a pure library

```
packages/engine/          ← pure TypeScript. No network. No database. No clock. No randomness.
  src/
    residual.ts           ← residual land value
    cashflow.ts           ← period-by-period cashflow, S-curve cost distribution
    collections.ts        ← Dubai off-plan payment plan → collection curve
    escrow.ts             ← RERA escrow release + retention rules
    finance.ts            ← debt sizing, drawn-balance interest (estimated + cashflow modes)
    sensitivity.ts        ← grid sweeps over the above
    verdict.ts            ← thresholds → PASS / MARGINAL / FAIL
    index.ts              ← appraise(inputs: AppraisalInput): AppraisalResult
```

The engine takes a fully-resolved input object and returns a result. It performs no I/O. It does not
read the current date — any time reference is an explicit input. It cannot fetch a comparable; the
caller must have already resolved comparables into the input.

Three properties follow, and each one is load-bearing:

- **Deterministic.** Same input, same engine version, same output. Always.
- **Testable to the arithmetic.** Every rule gets a unit test with a hand-computed expected value.
  For a product whose entire value is a number being right, this is the non-negotiable part.
- **Portable.** The same package runs in an API route, a background worker, a batch re-run across
  every stored appraisal, and — later — behind an MCP server, without a second implementation.

That last point matters competitively. Aprao ships an MCP integration letting an LLM query
appraisals with "auditable calculations rather than hallucinations" `[verified 2026-08-09,
aprao.com]`. A pure engine is what makes that possible. A browser-embedded one is not.

### Versioning

The engine exports a semantic version. Every stored appraisal records the version that produced it.
Changing a formula is a version bump, never an edit in place.

```ts
type AppraisalResult = {
  engineVersion: string      // "2.4.0"
  inputHash: string          // content hash of the resolved input
  computedAt: string         // set by the caller, not the engine
  outputs: { residualLandValue: Money; irr: Rate; /* … */ }
  trace: CalculationStep[]   // see §3
}
```

When the engine changes, stored appraisals are **not** silently recomputed. They are flagged as
"computed with an earlier method," and the user chooses to re-run. Silent recomputation is how you
quietly change a number a client already acted on.

---

## 3. Every number carries its derivation

The engine emits a trace alongside its outputs — an ordered list of steps, each naming its inputs,
its rule and its result.

```ts
type CalculationStep = {
  id: 'gdv.blended_psf'
  label: 'Blended average price per sqft'
  rule: 'Σ(area_i × psf_i) / Σ(area_i)'
  inputs: { unitType: string; areaSqft: number; psf: number }[]
  output: number
  flags: Flag[]
}
```

This is not a debugging convenience. It is the product feature that separates a screening toy from
something a lender will read, and it is what the incumbent consultancies sell — a methodology you can
follow. It also makes the defects in [`docs/defects.md`](defects.md) structurally impossible to ship
undetected, because a `Flag` is raised at the step that produces the offending number rather than
noticed by a human reading a dashboard.

Flags are first-class:

```ts
type Flag = {
  code: 'PRICE_ABOVE_OWN_COMPS' | 'VERDICT_THRESHOLD_BREACH' | …
  severity: 'info' | 'warn' | 'blocker'
  message: string
  evidence: Record<string, unknown>   // the comp band, the offending psf, the contributing area share
}
```

A `blocker` flag suppresses the verdict entirely. The product must be able to say **"I will not give
you a verdict on this"** — that capability is worth more than any single computed number, because it
is what makes the verdicts you *do* give meaningful.

---

## 4. Two data planes, deliberately separated

The most consequential structural decision here.

```
        MARKET DATA PLANE                      APPRAISAL PLANE
   (shared, slow-moving, versioned)      (per-tenant, fast-moving, private)

   DLD transactions                       Organisation
     ↓ scheduled ingest                     └ Workspace
   Normalised transaction store                └ Plot
     ↓ periodic aggregation                       └ Appraisal ──pins──> Snapshot ID
   Comparable Snapshot (immutable)                   └ Scenario
     • id, communityId, asOf, method
     • band, median, sample size
```

**An appraisal pins a snapshot ID.** It never queries live market data at render time. Consequences:

- A saved appraisal is reproducible forever. Reopening it in six months shows the same numbers.
- The UI can honestly say *"comparables as of 12 July 2026, 41 transactions in Wadi Al Safa 3"* —
  which is the difference between a defensible figure and a `COMING SOON` badge.
- Refreshing comps becomes an explicit user action with a visible diff: *"the band moved from
  1,640–1,910 to 1,690–1,950. Re-run?"* That is a feature, not a chore.
- Ingest failures degrade honestly. The product shows stale-but-labelled data rather than silently
  falling back to hard-coded values, which is what the beta does today.

The market plane is shared across all tenants, so ingest cost is paid once regardless of user count.
This is the main reason the architecture gets *cheaper* per user as the platform grows.

### On the data moat

DLD-registered transactions are available through third-party APIs and the official Dubai Pulse and
Dubai REST routes `[relayed, unverified]`, and Dubai Municipality is building a 3D Land Discovery
Platform combining geospatial and DLD data with zoning and master-plan layers, positioned for
pre-feasibility work `[relayed, unverified]`. If both hold, comparables are not a moat and the plot
discovery tab has a free government competitor.

**Verify both before building anything that assumes exclusivity.** The architecture above is
deliberately indifferent to the answer: if the data is commodity, the value moves to the snapshot
discipline, the trace and the Dubai-specific engine — none of which depend on owning the data.

---

## 5. Tenancy and the data model

```
Organisation ── Membership ── User
     └── Workspace                        deal pipeline lives here
           └── Plot                       physical land: geometry, zoning, FAR, DLD reference
                 └── Appraisal            a dated point of view on that plot
                       ├── AssumptionSet  full resolved inputs, immutable once computed
                       ├── Scenario       named variation (base / downside / upside / custom)
                       └── Result         outputs + trace + engineVersion + snapshotId
```

Two things worth being explicit about:

**Plot and Appraisal are separate.** The plot is a fact about the world. The appraisal is an opinion
about it at a point in time, under a set of assumptions. Collapsing them — which prototypes always do
— makes "how did our view of this site change over six months" unanswerable, and that question is the
foundation of the pipeline product Aprao sells as personal and team boards.

**AssumptionSet is immutable once computed.** Editing an assumption creates a new set and a new
result. Storage is trivially cheap; a corrupted audit trail is not recoverable.

Row-level security scoped by organisation, enforced in the database rather than in application code.
Application-layer authorisation gets bypassed exactly once, and that once is a client's land
valuation leaking to a competing developer.

---

## 6. Synchronous vs. background

| Work | Where | Why |
|---|---|---|
| Single appraisal recompute | Synchronous, server-side | Sub-100ms; it is the core interaction loop |
| Sensitivity grid (11×11) | Background job | ~121 engine runs; too slow to block a UI |
| Unit-mix optimiser sweep | Background job | Combinatorial |
| PDF export | Background job | Rendering is slow and must not hold a request |
| DLD ingest + snapshot build | Scheduled job | Shared across tenants |
| Portfolio re-run on engine bump | Background, batched | Potentially every stored appraisal |

The engine being pure is what makes every row after the first trivial — the same function runs in a
worker with no changes.

**Do not compute appraisals in the browser.** Client-side maths cannot be audited, cannot be
versioned, ships the model to anyone who opens devtools, and drifts the moment there is a second
client. Fast interaction comes from the engine being genuinely fast, not from moving it closer to the
user.

---

## 7. Stack

| Layer | Choice | Reason |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Engine must be a real package, importable by app and workers |
| App | Next.js (App Router) + TypeScript | Already the deployment target; strict mode non-negotiable |
| Engine | TypeScript, zero runtime deps | Purity is enforceable only if there is nothing to be impure with |
| Money | Integer minor units (fils) via a `Money` type | Never floats. `0.1 + 0.2` in a land valuation is indefensible |
| Database | PostgreSQL | Row-level security, JSONB for assumption sets, real numerics |
| Queue | Postgres-backed job table, initially | One less system; migrate to Redis/SQS only when measured |
| Auth | Managed provider with SSO | Google and Microsoft SSO are already advertised on the beta |
| Reports | Server-rendered HTML → PDF in a worker | Same renderer as the screen; one source of truth |

Deliberately deferred until there is evidence they are needed: microservices, Kubernetes, a separate
Python service, event streaming, GraphQL, caching layers. The load here is tens of thousands of
appraisals, not millions of requests. Postgres handles that for years.

```
solum/
├── apps/web/                 Next.js app
├── packages/engine/          pure calculation engine  ← the asset
├── packages/schema/          shared types + Zod validators
├── packages/market-data/     DLD ingest, normalisation, snapshot building
├── packages/reports/         PDF/report rendering
└── workers/                  background jobs
```

---

## 8. What "scaling" actually means here

Not requests per second. Four things:

1. **Reproducibility** — an appraisal from any point in the past regenerates exactly. Delivered by
   pinned snapshots plus immutable assumption sets plus engine versioning.
2. **Auditability** — every number is traceable to inputs and a rule. Delivered by the trace.
3. **Correctness under change** — a formula change cannot silently alter historical results.
   Delivered by version pinning and explicit re-runs.
4. **Tenancy** — organisations cannot see each other's deals, enforced at the database.

A product that gets these right supports a thousand users on modest infrastructure. A product that
gets them wrong becomes unfixable at fifty, because by then real clients have acted on numbers you
can no longer reconstruct.

---

## 9. Open architectural questions

- **Is there existing prototype source to migrate?** The beta is deployed but its repository has not
  been located. Salvaging its formulas — even wrong ones — is faster than rederiving them, because
  they encode decisions someone already made about Dubai cost lines.
- **DLD data access route.** Official API, licensed reseller, or scraped. This determines refresh
  cadence, cost and legal exposure, and is a genuine blocker on the market data plane.
- **Escrow and payment plan mechanics.** The wedge depends on these being modelled correctly. See
  [`docs/domain-model.md`](domain-model.md) — currently `[relayed]`, and code must not depend on them
  until verified against the actual regulations.
- **Report format.** Blocked on the AIRE sample report. The output artifact drives the data model
  more than anything on screen does.
