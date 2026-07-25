# AIRE

**Category:** Both. AIRE Consulting is the service, AIRE Software is the platform
behind it. They are the same company (Global AI Real Estate Inc., trading as AIRE
Software FZ-LLC and AIRE Consulting).
**Market:** Middle East and Africa. Offices in Dubai, Casablanca, Nairobi,
Johannesburg. In the In5 Tech incubator, Dubai Internet City.
**Studied from:** a real AIRE Consulting proposal addressed to ARI Development
(ref P26110, dated 24 July 2026), plus an in-house guestimate of the software
architecture. Both under `sources/`.

## The one thing to notice first
The proposal we studied is AIRE quoting **our own firm** AED 20,000 for a three-week
residential feasibility study in Al Barsha. That is the exact plot type and market
Solum is built for. So AIRE is not an abstract competitor. It is a live quote for
the job Solum aims to do in-house, instantly. Keep that framing when reading the
gap analysis.

## What they are
AIRE productized real estate consulting. They built a platform that runs
feasibility and highest-and-best-use studies, then wrap a named consulting team,
a methodology, and a signed engagement around it. The pitch leans on proprietary
market datasets across MEA and "AI-driven software," but the delivery is a
consultant-grade PDF report and an Excel model the client does not get to keep.

They cover the full advisory range beyond single feasibility: valuations, highest
and best use, master-planning support, portfolio optimisation, city planning. Track
record includes Expo 2020 re-use, Dubai World Central, Dubai Culture Village HBU,
Zayed Sports City, KAFD, and multiple KSA masterplans.

## How they run a feasibility study
Four tasks, three weeks, delivered as a slide report. From the proposal:

1. **Site analysis.** Location, size, permissible use, height, coverage, access and
   egress, visibility, nearby uses, proximity to demand generators and competing
   supply. Summarised as a SWOT. Deliverable: 2 pages.
2. **Market assessment.** Supply, demand, and market indicators (prices, rents,
   occupancy, absorption) for the asset class. Deliverable: 4 pages.
3. **Development recommendations.** Concept, land-use plan, massing, unit size and
   mix, product configuration, parking and amenities, asset positioning, revenue
   metrics, and up to five comparable developments. Deliverable: 5 pages.
4. **Financial and investment analysis.** Development cashflows, project and equity
   IRR, NPV, and sensitivity analysis on revenue and cost. Cost inputs (land,
   construction, finance) come from the client. Deliverable: 5 pages. The Excel
   model itself is not handed over.

## What they charge and how long it takes
AED 20,000, exclusive of tax. Three weeks to a draft final report, after a one-week
mobilisation and 50% upfront. Deliverable is a PDF slide report, no live model.

## What is real vs marketing
The architecture guestimate in `sources/` rates the stack roughly as: 60%
proprietary market data, 20% financial modelling and optimisation, 10% GIS, 10% AI
(prediction models plus LLM report writing). That split is worth trusting. It says
the moat is the data and the decision engine, not the AI badge. The three-week
turnaround, versus an instant answer, tells the same story: most of the value is
validating data and running scenarios by hand, then dressing the output as prose.

Read the "AI-powered demand forecasting" language as positioning. The load-bearing
assets are the market datasets, the scenario-plus-financial engine, and the
highest-and-best-use ranking. The LLM is the last mile that makes it read like a
consultant wrote it.

## What Solum can learn
See [`../analysis/aire-vs-solum.md`](../analysis/aire-vs-solum.md) for the full gap
read, learnings, and a ranked list of their capabilities by importance.

## What Solum should not copy
- The three-week, one-plot, AED-20k engagement model. That is the thing Solum's
  speed and self-serve nature exists to beat, not match.
- A heavy ML-forecasting push early. Their own architecture rates AI at 10%. On
  thin, opaque Dubai data a trimmed transaction comp is more defensible than a
  black-box prediction.
- Free-text consultant prose as the primary output. Solum's structured, sourced
  export is a feature, not a gap to fill with essays.

## Sources
- `sources/aire-architecture-guestimate.md` — the software architecture guestimate.
- AIRE Consulting proposal P26110 (the 38-page PDF, held with the session upload,
  not committed here). Key facts extracted into this file.
- www.aire-realestate.com/aire-feasibility-study-software
