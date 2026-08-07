# Al Mizan — demo feedback

- **Date:** 2026-08-07
- **Source:** demo session with Al Mizan (credentials shared, they used the live app)
- **Overall:** positive. "Great so far." Everything below is the detailed pass.
- **Related:** `../PROJECT_CONTEXT.md` (strategy), `../prd/light-hbu.md`, `../prd/dld-comps-integration.md`

Part 1 is their feedback as given, reorganised but not reinterpreted. Part 2 is
our triage — what it means for build order, and which of it is MVP versus vision.
Keep the two apart: Part 1 is evidence, Part 2 is opinion.

---

# Part 1 — Feedback as given

## 1. Clarification on financial assumptions

- What are these numbers for? The per square foot numbers — are they per square
  foot of developed area?
- Need to clarify that the PSF calculation is based on developed area / built-up
  area, not plot size.
- The UI should clearly say which.
- Need to explain what Residual Land Value means and how it is calculated.

## 2. Unit mix flexibility

- The flexibility in the mix toggles is good.
- What if the developer wants to keep a type off completely?
- What if they want to add more unit types?
  - Example: 4 BHK.
  - Within 2BR there could be different types (Type A, Type P) with variations.
- Initially, averages per bedroom category are fine rather than modelling every
  subtype. But the system should allow adding broader categories like 4BR.

## 3. DLD transactions and comparables

- We currently take weighting from roughly 4,000 DLD transactions. Is that the
  most reliable approach?
- The developer does not want the average of all transactions. They want the most
  relevant comparable transactions for their specific project.
- Segmentation needed: luxury, ultra-luxury, mid-market, affordable.
- Possible approach: categorise DLD transactions by pricing, location and project
  characteristics. The top 5% of transactions could represent the luxury segment.
- Ask up front: what type of project are you looking to build? If they do not
  know, Solum should guide them — show a luxury scenario (mix, pricing, returns)
  against a mid-market scenario (different mix, pricing, economics).

## 4. If a plot fails, recommend a fix

Do not just stop at "this does not work". Explain what would need to change:

- Increase or decrease development size.
- Reduce construction cost assumptions.
- Change unit mix.
- Change positioning.
- Adjust the studio / 1BR / 2BR / 3BR split.
- Explore different scenarios.

The output should read: *"This plot does not work under the current assumptions.
Here are the changes that could make it viable."*

## 5. AI should handle evolving assumptions and edge cases

There will be many nuances and edge cases. Developers discover more information
over time, and new insights change assumptions. A chatbot could let them add new
information, update assumptions, and ask what impact the change has. The AI
should either adjust the relevant assumptions automatically or suggest which ones
should change.

## 6. Proactive plot discovery

Instead of "this plot does not work", Solum should ask "what other plots should
we consider?" With access to plot databases, Property Finder, land listings and
other sources: search available plots, evaluate them automatically, recommend
better opportunities.

Move from *evaluate this plot* to *find me the best plots worth evaluating*.

## 7. Better pricing logic using relevant comparables

Instead of averaging thousands of transactions, use 5 to 10 highly relevant
comparable projects, then allow adjustment: comparables sell at X, our project
has better amenities, facilities, location and proximity, therefore we can
justify a premium. Pricing should be based on relevant competitors,
differentiation, and developer inputs.

## 8. AI guidance layer

*(Yogi sir)* The tool should not just calculate, it should guide. Out of
thousands of assumptions, tell me which ones to review:

- Miscellaneous cost unusually high → review.
- Parking allocation too high → review.
- Efficiency low → review.
- Construction cost assumption looks high → review.

Identify the few important issues instead of overwhelming the user.

## 9. Strategic recommendations

Bigger strategic changes, not just parameter tweaks: residential may not be
optimal, consider commercial; luxury positioning may not work, consider
mid-market; change unit mix; change development strategy.

## 10. Competitor supply and market absorption

How much competing supply is coming? How many similar projects are launching?
Will this project actually sell? Not only "can we build it profitably" but "can
we sell it successfully".

## 11. Plot aggregation and FAR optimisation

AI could suggest merging two adjacent plots, buying two smaller plots, combining
FAR, optimising GFA. Instead of evaluating one plot: how should I assemble land
to maximise returns?

## 12. Timeline and payment plan

Incorporate development timeline, handover timeline and payment plan. When adding
a new plot, ask: expected completion timeline? Is construction already started?
What is the payment schedule? These should feed the financial calculations.

## 13. FAR impact on timeline and returns

FAR is not only about GFA. Higher FAR can mean more floors, more basements, more
podium requirements, more complexity, longer construction. Low FAR might complete
in about 1.5 years where high FAR takes about 3.

So compare opportunities on profit, timeline, capital deployment, IRR and risk. A
smaller, lower-FAR plot may outperform a larger high-FAR one because of lower
construction cost, faster completion and earlier cash recovery.

## 14. Interactive experience

Developers should be able to change assumptions, see the impact immediately, and
explore scenarios.

## 15. Rendering / visual output

From plot size, unit mix, number of units and development assumptions, generate a
visual representation or indicative rendering. Makes the output far more
compelling.

## 16. Professional feasibility report

A polished report developers can share: plot analysis, assumptions, financials,
scenarios, recommendations, visualisations.

## 17. Build a leading developer platform

The current tool is a starting point. Long term: a product with ten times the
features, more value than existing market tools, sold to developers. Potentially
the leading developer intelligence platform.

## 18. Multiple workflows

Rentals, transactions, DLD processes, authority applications, development
management.

## 19. Transaction / brokerage opportunity

Instead of a traditional 2% commission, a fixed service fee (example AED 1,000).
The platform becomes transaction facilitator, developer network, and data/network
layer. Benefits: more transactions, larger user base, stronger market position,
potential relationship and value with Dubai authorities.

## 20. Design approval status

Ask whether the design is already approved, and whether fast-track approval is
required. An approved design can save around six months, which materially changes
timeline, returns and plot attractiveness.

## 21. Verify FAR / GFA from official sources

Affection plan and DWS documents do not always contain verified GFA/FAR.
Sometimes an agent adds the information manually, or attaches another PDF, and
the data may be wrong. The risk: the agent says GFA allowed is X, the authority
later says it is lower.

Need a distinction between official authority data, DLD historical data, and
agent-entered data — a confidence and verification layer.

## Key strategic insight — plot evaluation should move beyond PSF

A developer should not simply compare Plot A (lower land PSF, higher FAR) against
Plot B (higher land PSF, lower FAR). True economics depend on FAR, GFA,
construction complexity, basement and podium requirements, construction cost,
timeline and capital rotation. A lower-FAR plot may outperform through lower
construction cost, faster completion, lower risk and better return on invested
capital.

The right question is not *which plot has the cheaper land price* but **which land
opportunity creates the highest risk-adjusted return on capital**.

## Overall product vision

Solum should evolve from a plot feasibility calculator into an **AI development
strategist for real estate developers**, answering:

1. Which plots should I evaluate?
2. What should I build?
3. What unit mix should I choose?
4. What segment should I target?
5. What changes improve profitability?
6. Should I buy another plot instead?
7. How do I maximise returns and reduce risk?

---

# Part 2 — Triage

Our reading, not theirs. Sorted by whether it blocks trust, blocks use, or
extends the product. Build strictly in that order.

## The headline

Not one item in this list is a bug report. Nothing came back as "your number is
wrong", which is the outcome we were most exposed to going in — the parking,
efficiency and BUA corrections landed before the demo and appear to have held.

What came back instead is almost entirely **explainability and guidance**. Items
1, 4, 8 and 9 are the same request in four forms: *tell me what this means and
what to do about it*. That is the through-line and it should set the next sprint.

## Bucket 1 — blocks trust. Do these first.

| # | Item | Note |
|---|---|---|
| 1 | Label every PSF with its denominator | They asked the exact question we predicted. Sale PSF is per sqft of saleable, construction PSF is per sqft of BUA, land PSF is per sqft of plot. Three different denominators on one screen, none labelled. |
| 1 | Explain RLV on screen | The headline number of the product and it is unexplained. Needs the definition and the arithmetic, the way efficiency now has. |
| 21 | Provenance on plot inputs | Distinguish authority data from agent-entered data. We already have `sourced` / `modeled` tiers and the "from DDA" / "from PDF" tags — extend the same vocabulary to flag unverified GFA. Low cost, directly addresses a stated risk. |

## Bucket 2 — blocks use on a live deal.

| # | Item | Note |
|---|---|---|
| 2 | 4BR as a unit type; turning a type fully off | Off already works (the `on` toggle). 4BR is a small change and the unit-mix CSV shows 4BR is material in real apartment projects. Subtypes (Type A / Type P) explicitly deferred by them — averages per bedroom are fine for now. |
| 3, 7 | Segment-aware comps | The single biggest gap. Averaging all transactions in an area is wrong for a luxury scheme. Ask the positioning up front, or infer it, and filter comps to the matching band. Their "top 5% = luxury" heuristic is a workable v1. |
| 12 | Timeline and payment plan on plot creation | The model already has months, payment split and off-plan share, but they are buried in Assumptions and not asked at creation. Mostly a UX move, not new maths. |
| 4 | Why it failed, and what would fix it | Currently a bare PASS verdict. We already compute every candidate mix and the RLV; the ingredients for "at land 10% lower this clears" are in hand. |

## Bucket 3 — extends the product. Not MVP.

Items 5, 6, 9, 10, 11, 15, 16, 17, 18, 19, and the plot-aggregation and
brokerage ideas. All plausible, none of them stop Al Mizan using Solum next week.

Two worth flagging as strategically important even though they are not next:

- **13 and the key insight (FAR → timeline → capital rotation).** This is the
  most valuable idea in the document and it is not a feature, it is a change to
  what the product optimises. Today we rank by ROI at a fixed 30-month timeline.
  They are saying timeline is a function of FAR and that IRR, not ROI, is the
  comparison that matters. Cheap first step: make the timeline scale with floors
  and basements instead of being a constant, and lead with IRR on Compare.
- **10, competitive supply and absorption.** The unit-mix CSV they sent is
  exactly this dataset, and forward supply by area and year is the one insight
  the comps data cannot give. Already planned; this raises its priority.

## What we should not build yet

The AI layer (5, 8, 9) is the most requested thing here and also the easiest to
get wrong. A chatbot that adjusts assumptions is worth nothing if the underlying
assumptions are not yet trustworthy or explainable — and items 1 and 21 say they
are not. **Fix the explainability by hand first.** The guidance layer becomes
much easier once every number can already state its own derivation, because that
is the same information an assistant would need to reason over.

## Open questions to take back

- Which comes first for them: better comps (3, 7) or the failure-recommendation
  engine (4)? Both are bucket 2 and we cannot do both at once.
- Is the positioning question (luxury / mid / affordable) something they know at
  plot stage, or something they decide from the analysis? That determines whether
  it is an input or an output.
- Did they reconcile any of it against their own Excel? Not covered in this pass
  and still the single most important unknown.
