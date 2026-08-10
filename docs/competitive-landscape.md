# Competitive landscape

Researched 2026-08-09/10 against primary sources. Every figure is tagged. Where this contradicts
the analysis carried over from the earlier Cowork session, the contradiction is stated rather than
smoothed over — three of those claims did not survive checking.

---

## 1. The list we were given is mostly not competitors

Four URLs were shared as "key competitors in relevance order." Three are consultancies selling
reports, and the fourth markets itself as software but sells through a demo funnel.

| Named | What it actually is | Evidence |
|---|---|---|
| AIRE | Feasibility studies delivered as a service. Pitches "reduce analysis time from several weeks to just five business days." Every CTA is Request Free Demo / Watch Preview / Request Consultation. No login, no trial, no published price. Covers Middle East and Africa. | `[verified]` aire-realestate.com |
| Land Sterling | RICS consultancy. Quote-request funnel. | `[relayed]` |
| ValuStrat | RICS-regulated consultancy, 150+ consultants, runs the ValuStrat Price Index. | `[relayed]` |
| Stonehaven | Development management consultancy. | `[relayed]` |

**These are not who to build against. Two of them are the distribution channel.** Land Sterling and
ValuStrat will not build software and would rent it. Arriving at an Emirati developer through a firm
they already pay is the fastest credibility route available, and it is cheaper than manufacturing
RICS standing from nothing.

### Correction to the earlier analysis

The Cowork write-up stated AIRE is "not SaaS," charges "USD 7,000 including VAT" for a feasibility
study and "USD 9,000" for Highest & Best Use. **The five-business-day turnaround is confirmed. The
prices are not.** AIRE's page publishes no pricing at all and presents itself as "AI-powered
feasibility study software" with HBU analysis, market indicators and master-planned multi-plot
modelling. It may well be a report shop, but the USD 7,000 figure is unsourced, and the entire
pricing argument built on it — "a developer running 20 plots spends USD 140k, so a AED 500–1,000
seat is trivial ROI" — currently rests on nothing. **Do not use that number in a meeting.**

---

## 2. The real product benchmarks

| Product | Segment it owns | Notes |
|---|---|---|
| **ARGUS Developer** (Altus) | Complex multi-phase institutional schemes | The institutional standard. Rigid, expensive, slow to learn. `[verified]` |
| **Forbury** / ARGUS Workbook (Altus) | Commercial income assets, valuation | "First model within 30 minutes… deals in less than 15 minutes." `[verified]` |
| **Aprao** | Private residential, BTR, mixed-use | London, 2017, Pi Labs backed. Closest analogue to Solum. `[verified]` |
| **Caldes** | Residential, Excel-based | `[relayed]` |
| **ProVal** | UK social housing | `[relayed]` |
| **Feasly** | **GCC + AU/NZ. The one that actually matters.** | See below. |

### Feasly is the real competitor, and it was not on the list

Positioning: "Real Estate Feasibility Software for the GCC" — "structured feasibility modelling
built for GCC institutional capital." Separate `feasly.com.au` for Australia and New Zealand.
`[verified]`

Shipped capability `[verified]`:

- Cashflow, interest, LVRs and GST calculated automatically
- Scenario comparison across land options, funding strategies and equity positions
- Funding structures including **senior debt, mezzanine and profit splits**
- Centralised dashboard: create, duplicate, template, archive, share, PDF export
- Residential, commercial, industrial, retail and mixed-use

**Correction to the earlier analysis:** it described Feasly as "currently on a private beta." Feasly
has live, published, two-tier pricing. It is shipping.

---

## 3. Published pricing — the first hard numbers we have

| Product | Monthly | Annual | Setup | Source quality |
|---|---|---|---|---|
| **Feasly Lite** | **$49**/user | $539 | none | `[verified]` own site |
| **Feasly Pro** | **$149**/user | $1,639 | none | `[verified]` own site |
| **Aprao** | $549 | $6,588 | **+$900** | `[verified]` but competitor-sourced — from Feasly's comparison table |
| **ARGUS Estate Master** | not public | not public | Dev. Feaso $2,000 · Dev. Mgmt $2,000 · Excel/Word link $900 · Training $950 | `[verified]` same table |

Two things worth noting:

**Aprao claims "transparent pricing, and a free trial to prove it" and then publishes no figures.**
Its pricing page routes to a 7-day trial or a demo booking. `[verified]` The $549 number comes from
a direct competitor's comparison page, so treat it as indicative — Feasly has an obvious interest in
Aprao looking expensive.

**The pricing conversation therefore anchors at $49–$149 per seat, not at consulting rates.** This is
the single most important correction in this document. If the internal assumption was "AED 500–1,000
per seat is a trivial ROI against a USD 7,000 study," the actual market comparison is a shipping
GCC-specific competitor at **$149**. That is roughly AED 550. Solum is not entering an empty market
at consulting prices; it is entering an occupied one at software prices.

---

## 4. Where Solum stands against Aprao and Feasly

`[verified 2026-08-09]` from the deployed beta: tabs are Summary, Unit Matrix, Assumptions, Plot
Details, Market insights. Three Supabase tables. No transactions store. Comparable project names are
string literals in the page source.

| Capability | ARGUS | Aprao | Feasly | Solum beta | Solum now |
|---|---|---|---|---|---|
| Residual land value | ✅ | ✅ | ✅ | ✅ buried | ✅ engine |
| Unit mix / revenue | ✅ | ✅ | ✅ | ✅ | ✅ engine |
| Build & other costs | ✅ | ✅ | ✅ | ✅ | ✅ engine |
| Scenario comparison | ✅ | ✅ | ✅ | 3 fixed | 3 fixed, engine |
| **Cashflow forecast** | ✅ | ✅ | ✅ auto | ❌ | ❌ |
| **Finance / interest** | ✅ | ✅ two-mode | ✅ senior + mezz + splits | ❌ | ❌ |
| **S-curve cost spread** | ✅ | ✅ | ✅ drawdown | ❌ | ❌ |
| Sensitivity | ✅ | ✅ automatic | ✅ | ❌ | ❌ |
| Deal pipeline / boards | ✅ | ✅ personal + team | ✅ dashboard | partial | ❌ |
| Branded PDF report | ✅ | ✅ | ✅ | claimed | ❌ |
| Audit trail / derivations | ❌ | via MCP | ❌ | ❌ | **✅ trace** |
| Refuses on contradiction | ❌ | ❌ | ❌ | ❌ | **✅ flags** |
| **Dubai escrow + payment plans** | ❌ | ❌ | ❌ | ❌ | ❌ |

The landing page advertises "Cashflow & Timeline — peak funding, time to handover, payment plan
modeling" as shipped. There is no Cashflow tab. `[verified]`

**Do not try to out-feature Aprao.** It has been at this since 2017 to reach that column. The two
rows Solum uniquely holds — derivations and refusal — cost days, not years, and they attack the
credibility problem rather than the feature problem.

Also worth knowing: **Aprao ships an MCP integration** so an LLM can query appraisals with
"auditable calculations rather than hallucinations." `[verified]` The strongest incumbent is already
selling auditability. Our trace is not a novel idea — it is table stakes we currently lack.

---

## 4b. RealCube — the competitor that actually overlaps, found 2026-08-11

**This section corrects §5 below. The "nobody models Dubai mechanics" claim was wrong.**

RealCube, by **Exalogic Consulting** (Dubai-headquartered), is an AI-powered real estate ERP for the
GCC. Its **PMIS Pre-Construction / Land Acquisition & Feasibility** module is, feature for feature,
substantially the product Solum is trying to be. `[verified]`

What it ships:

| Capability | RealCube | Solum |
|---|---|---|
| Lead pipeline with plot ownership, coordinates, land-use, plot number, system-generated Parcel IDs | ✅ | partial |
| **GIS plot rendering** | ✅ | ❌ |
| Colour-coded feasibility states for prioritising acquisitions | ✅ | ❌ |
| Land parcel & **GFA calculators with building-mix planning** | ✅ | ✅ engine |
| **Efficiency %** (roads, green areas, utilities) → auto **Net GFA** and **Price per sq.ft** | ✅ | ❌ |
| Multiple efficiency versions for comparison | ✅ | ❌ |
| **Bell-curve sales velocity over 12 / 18 / 24 months** | ✅ | ❌ |
| Revenue recognition adjustments | ✅ | ❌ |
| Comparables stored alongside the financial model | ✅ | ✅ engine input |
| ROI scenarios "before design begins" | ✅ | ✅ engine |
| Escrow-linked milestone payments | ✅ | ❌ |
| **Oqood** + Title Deed registration | ✅ | ❌ |
| RERA compliance, Ejari, UAE Pass KYC, VAT-aware accounting | ✅ | ❌ |
| NOVA AI: CapEx/feasibility insights, predictive revenue forecasting, anomaly detection | ✅ | ❌ |
| Residual land value as the primary metric | not shown publicly | ✅ engine |
| Derivation trace on every number | ❌ | ✅ engine |
| Refuses a verdict on contradictory inputs | ❌ | ✅ engine |
| Uncertainty as distributions rather than an assumed curve | ❌ bell curve | ❌ |

Scale claimed: **100,000+ units, 150,000+ active users.** `[verified via search; not confirmed on
their own site]`

### What this means

**The regulatory plumbing we identified as the moat is already built by an incumbent with an
installed base.** Escrow-linked milestone payments, Oqood, Title Deed, RERA, VAT — RealCube has all
of it. That is a far harder asset to replicate than an appraisal formula, and they are much better
placed to deepen their feasibility maths than we are to build their compliance stack and their
distribution.

Their sales-velocity model is a **bell curve over 12/18/24 months** — a shape assumption, not a
fitted forecast. That is the one place their approach is beatable on merit: a model fitted to DLD
transactions beats an assumed curve. But we have neither today, so this is a plan, not an advantage.

**Two honest distinctions remain, and they are about buyer moment, not features:**

1. **RealCube is an ERP.** Land acquisition is the front door to sales, lease, community, facility
   management, finance and procurement. That is a long enterprise sale to a developer's whole
   organisation. Solum can be a standalone tool an analyst uses on a Tuesday afternoon without a
   six-month implementation.
2. **RealCube's escrow features are operational, not predictive.** They administer real payments on
   real sold units — collection, compliance, reconciliation. That is a different job from
   *forecasting* a hypothetical collection curve against an S-curve to decide whether to bid. The
   wedge survives, but narrowed: it is now **pre-acquisition collection-curve forecasting**, not
   "Dubai mechanics" generally.

**The strategic risk, stated plainly:** if RealCube adds residual land value and a proper absorption
model, Solum's remaining differentiation is the trace and the refusal behaviour. Those are good, and
they are days of work rather than years — which means they are also days of work for RealCube.

---

## 5. The wedge, as originally stated — now qualified

> **Superseded in part by §4b.** The claim below was based on a search that missed RealCube. Read
> both. What survives is narrower: no competitor was found doing *pre-acquisition collection-curve
> forecasting*. RealCube does the operational side.

Searched for any competitor modelling Dubai escrow, Oqood, RERA or off-plan payment plans. Among the
appraisal tools — Aprao, ARGUS, Feasly, Forbury, Caldes, ProVal — **nothing.** Feasly is
GCC-positioned and models senior debt, mezzanine and profit splits: the *lender-funded* structure.
None of them model the buyer-funded one. That part holds. `[verified]`

This matters because Dubai off-plan inverts the funding question:

- Escrow is mandatory, project-specific, at a RERA-approved bank, under Law No. 8 of 2007.
- **At least 20% of total estimated construction cost** must be deposited or guaranteed before sales
  commence (Law No. 9 of 2007).
- Releases require a completion certificate from an independent engineer plus RERA approval, at
  foundation, structural, MEP, finishing and handover.
- **5% of the escrow is retained as a defects guarantee for one year** after completion.
- Payment plans run 80/20, 60/40, 50/50, 1%-monthly, and post-handover plans deferring **40–60% of
  price interest-free over 2–5 years** (occasionally 7–10).

Every one of those figures is `[verified]` — see [`docs/domain-model.md`](domain-model.md).

So the Dubai question is not "what does my debt cost." It is **"what does my collection curve look
like against my S-curve, given a 20% pre-funding requirement, milestone-gated releases, a 5% one-year
retention, and 40–60% of revenue arriving after I hand over the keys."** That is a structurally
different engine, and the search says nobody has built it.

**Caveat that must not be lost:** the moat is only real if these mechanics are modelled correctly. A
wrong retention percentage silently corrupts every cashflow the product ever produces. Verify against
the regulations themselves, not secondary guides, before code depends on them.

---

## 6. What the data moat is not

`[relayed, unverified]` DLD transaction data is reportedly available through third-party APIs and the
official Dubai Pulse and Dubai REST routes, and Dubai Municipality is reportedly building a 3D Land
Discovery Platform combining geospatial and DLD data with zoning and master-plan layers, positioned
for pre-feasibility work.

If both hold, comparables are commodity and the Plot Details tab has a free government competitor.
**Both need verifying before any roadmap assumes exclusivity.** The architecture is deliberately
indifferent: value sits in snapshot discipline, the trace, and the Dubai engine, none of which
require owning the data.

---

## 7. What to say in the meeting

1. **Our competitor list was wrong in both directions.** Three of the four names given are
   consultancies — and two of those are our distribution channel, not our rivals. Meanwhile the two
   companies that actually compete with us were not on it at all.
2. **RealCube (Exalogic, Dubai) is the real threat.** Its PMIS Pre-Construction module already does
   land pipeline with GIS plot rendering, GFA and efficiency calculators, price per sq.ft,
   building-mix planning, ROI scenarios, bell-curve sales velocity, *and* escrow-linked milestone
   payments, Oqood and Title Deed registration. Claimed 100k+ units. The Dubai regulatory plumbing we
   called our moat is already built by an incumbent with distribution.
3. **Feasly is the second one nobody named** — GCC-specific, shipping, **$49–$149 per seat**. Our
   pricing assumption was anchored to an unverified USD 7,000 consulting figure. Reset it.
4. **Aprao and Feasly both ship Finance and Cashflow. We ship neither, and our landing page says we
   do.** That claim should come down until it is true.
5. **Don't try to out-feature any of them.** What we hold today: every number shows its derivation,
   and the tool refuses to call a deal when the inputs contradict each other. Both are built and
   tested. Neither competitor does either.
6. **The narrowed wedge:** pre-acquisition collection-curve forecasting. RealCube administers real
   escrow payments; nobody forecasts a hypothetical collection curve against an S-curve to decide
   whether to bid. Their sales velocity is an *assumed bell curve* — a model fitted to DLD
   transactions beats that. We have neither yet, so it is a plan, not an advantage.
7. **Honest position:** we are not early in an empty market. We are late in an occupied one, with two
   genuine assets — auditability and refusal — and a plausible technical edge on absorption if we get
   DLD data. That is a real business, but it is not the story of a blue ocean.

---

## Sources

Primary sources fetched directly: [aprao.com](https://aprao.com/),
[aprao.com/pricing](https://www.aprao.com/pricing),
[feasly.com/product](https://feasly.com/product),
[feasly.com.au comparison](https://www.feasly.com.au/feasibility-software-comparison),
[aire-realestate.com](https://aire-realestate.com/aire-feasibility-study-software),
[solum-beta-navy.vercel.app](https://solum-beta-navy.vercel.app/).

Segment mapping and ARGUS/Forbury positioning:
[Altus Group — Forbury](https://www.altusgroup.com/solutions/uk/forbury/),
[Aprao — best UK appraisal software](https://www.aprao.com/blog/best-property-development-appraisal-software),
[SourceForge — ARGUS Developer alternatives](https://sourceforge.net/software/product/ARGUS-Developer/alternatives).

Regulatory: [Kayrouz & Associates — RERA developer obligations](https://www.kayrouzandassociates.com/insights/rera-developer-obligations-off-plan-dubai),
[Dealr.ae — how off-plan payment plans work](https://dealr.ae/guides/how-off-plan-payment-plans-work-dubai).

Not reachable: [investmentmap.ai](https://investmentmap.ai/?m=p) — TLS certificate chain could not be
verified. Worth a look in a browser; it appeared in our list as a map-first product and the 3D
question is open.

## Sources added 2026-08-11 (RealCube)

[realcube.estate](https://www.realcube.estate/),
[PMIS — Land Acquisition & Feasibility](https://www.realcube.estate/pmis),
[PMIS Pre-Construction](https://www.realcube.estate/pmis/pmis-pre-construction),
[PropTech software for Dubai developers](https://www.realcube.estate/blog/top-proptech-software-solutions-for-dubai-real-estate-developers).

The 100,000-units / 150,000-users figure and the escrow/Oqood/UAE-Pass/VAT list came via search
summary of RealCube's own marketing pages, not from a page fetched directly. Confirm before quoting
either in a client or investor setting.
