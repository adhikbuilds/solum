# AIRE vs Solum: gaps, learnings, and what actually matters

*A comparison read, written to answer three questions: where are the gaps, what is
worth learning, and which of AIRE's capabilities matter most in order.*

## The framing that makes the comparison honest

AIRE and Solum are not the same kind of thing, and pretending they are leads to the
wrong shopping list.

AIRE productized consulting. The software is the delivery engine, the human is the
trust wrapper, the output is a signed PDF, and the price is AED 20,000 over three
weeks per plot. Solum is a self-serve tool that answers the same question instantly,
in-house, at near-zero marginal cost, across as many plots as a developer wants to
test in an afternoon.

So the comparison is not "who has more features." It is "which of AIRE's depth is
worth adding to a tool whose whole advantage is speed, live official data, and
iteration." Some of AIRE's depth is the point. Some of it is the slowness Solum
exists to remove.

Solum's structural advantages, which AIRE cannot easily match, are worth stating
because they set the boundary on what to copy:

- **Speed.** Instant versus three weeks.
- **Self-serve.** The developer drives it. No engagement, no mobilisation week.
- **Live official data.** Direct DDA plot lookup and direct DLD transaction comps,
  not a consultant's internal database refreshed on their schedule.
- **Cost per plot.** Effectively zero, so you can screen a whole pipeline.
- **Iteration.** Test twenty land prices before lunch, not one study per AED 20k.

The wedge that follows: Solum should own the top of the funnel, the fast screen and
the bid-price call on every plot, where AIRE is too slow and too expensive to play.
A deep AIRE-style study is what you commission for the one plot you have already
decided to chase. The two are complementary, not identical. Solum screens
everything, a deep study validates the shortlisted one. Longer term, Solum can
generate that deep study itself.

## Side-by-side

| Dimension | AIRE | Solum today |
| --- | --- | --- |
| Core question | What is the highest and best use of this land, across asset classes | Does this residential scheme clear the hurdle, and what is the RLV |
| Turnaround | 3 weeks | Instant |
| Price per plot | AED 20,000 | ~0 |
| Delivery | Signed PDF slide report, model withheld | Live self-serve tool plus investor-grade PDF export |
| Input | Client brief plus consultant data gathering | DDA lookup by plot number, PDF or scan upload with OCR, manual entry |
| Site data | GIS catchment: metro, schools, offices, malls, competing supply within radii | Plot geometry from DDA (area, GFA, FAR, height) |
| Market data | Proprietary MEA datasets: supply, demand, absorption, pipeline, velocity, vacancy | DLD transaction comps, recency-weighted, outlier-trimmed, per unit type |
| Scenarios | Auto-generated, many permutations, ranked | A few manual scenario-test cards |
| Asset classes | Residential, office, retail, hotel, logistics, mixed, and more | Residential apartments only |
| Financial model | Cashflow, project and equity IRR, NPV, sensitivity | Cashflow, IRR, NPV, peak funding, payment plan, cost inflation, price growth |
| Optimisation | Highest and best use ranking across uses | Profit-maximising unit mix within bands |
| Forecasting | ML price and demand models (claimed) | Deterministic, comp-anchored, user assumptions |
| Report | LLM-written consultant narrative | Structured sourced sections, provenance tags |
| Trust wrapper | RICS methodology, named experts, signed engagement, PI cover | None. It is a tool, not an opinion |

Read across the table and the pattern is clear. Solum already matches or beats AIRE
on speed, input, comps quality, and core financial metrics. The real gaps are
concentrated in four places: use-mix breadth, forward-looking market data, model
completeness, and the trust wrapper.

## The gaps, concretely

1. **Single-use, not highest-and-best-use.** Solum answers "does residential work
   here." AIRE answers "what should go here at all." For a land buyer the second
   question sits above the first. Solum never asks it.
2. **Backward-looking data only.** Solum's comps are sold transactions, which tell
   you yesterday's price. They do not tell you the pipeline coming to market, the
   absorption rate, unsold inventory, or launch velocity. That is the difference
   between "here is the price" and "here is whether you can actually sell it and how
   fast." Solum's own coming-soon layers (competitive supply, off-plan comps,
   absorption) target exactly this gap, which is the right instinct.
3. **No sensitivity analysis.** AIRE runs revenue and cost sensitivity as a standard
   deliverable. Solum has scenario cards but no tornado or two-way price-by-cost
   table, which is the artifact an investment committee expects.
4. **Un-levered model.** AIRE splits project IRR from equity IRR, which means it
   models debt. Solum's returns look un-levered. For a developer using construction
   finance, equity IRR is the number that matters.
5. **No location or catchment context.** Solum knows the plot geometry but not what
   surrounds it. Proximity to metro, schools, offices, and competing supply is what
   makes a price-positioning claim credible.
6. **No narrative layer.** Solum exports structured sections. AIRE writes prose. A
   minor gap, and arguably a Solum strength, but worth noting.
7. **No trust wrapper.** This is not a software gap. It is why a client pays AED 20k
   for a signed opinion instead of running a tool. It is a positioning decision, not
   a backlog item.

## What to learn, in priority order

1. **Reframe toward best use, even lightly.** Solum does not need seven asset classes
   to steal the idea. The pragmatic version for a residential developer is
   configuration and positioning: sell versus hold, apartment versus townhouse,
   which tier, which mix. That is highest-and-best-use scoped to the market Al Mizan
   actually builds in, and it turns Solum from a calculator into a decision engine.
2. **The moat is data, so keep building the forward-looking layers.** AIRE's own
   architecture rates proprietary data at 60% of the value. Solum's coming-soon
   supply, off-plan, and absorption work is aimed at the single highest-value gap.
   Push it. DXB Interact plus off-plan data is the concrete path.
3. **Add sensitivity analysis. It is the cheapest credibility win.** Solum already
   has the financial model. A price-by-cost table and a tornado chart are a small
   addition that produces the exact artifact a committee asks for.
4. **Keep the model deterministic and explainable.** Do not rush ML forecasting.
   AIRE rates it at 10% of the stack, and on thin, opaque Dubai data a trimmed comp
   plus explicit assumptions is more defensible than a black box. Explainability is
   a feature here, not a compromise.
5. **Package trust deliberately.** Solum already labels estimates and tags
   provenance, which is the honest core of a trust wrapper. A methodology page and a
   consistent assumptions-transparency view get most of the credibility a named
   consultant sells, without the three-week engagement.
6. **Lean into speed and self-serve. Do not dilute them.** The temptation is to chase
   full-report parity with AIRE. That trades away the one thing AIRE cannot copy.
   Solum should be the tool you run on every plot, not a slower clone of the study
   you run on one.

## AIRE's capabilities, ranked by importance

The question was how important AIRE's features are, in order. This ranks them by how
much each one changes the land-buy decision, with a note on whether it is worth
Solum building. Decision impact and build priority are not the same thing, so both
are called out.

1. **Highest and best use across asset classes.** Highest decision impact. It is the
   question a land buyer actually has. Solum is single-use today. Build priority is
   high but the scoped, residential-only version is the realistic first step, not a
   seven-asset-class engine.
2. **Forward-looking market data: pipeline supply, absorption, unsold inventory,
   launch velocity.** AIRE's real moat and the answer to "can I sell it, how fast."
   Solum's biggest data gap, and already the target of its coming-soon layers.
   Highest build priority because it compounds and Solum has a data path to it.
3. **Financial completeness: equity-versus-project IRR and sensitivity analysis.**
   The investment-committee artifacts. Solum has the engine already, so this is the
   best effort-to-value ratio on the list. Build it early even though its raw
   decision impact ranks below the top two.
4. **Scenario generation and ranking at scale.** The mechanism that makes best-use
   real. Tightly coupled to item 1. Note that "hundreds of options" is partly a
   marketing number. A developer cares about the three to five that make sense.
5. **Location and catchment GIS intelligence.** Grounds demand and price positioning.
   Useful, but for a known submarket like Al Barsha the developer already holds much
   of this qualitatively, which lowers its urgency.
6. **ML price and demand forecasting.** Rated at 10% by AIRE's own architecture, and
   a credibility risk without data volume. Low priority. The honest read is that the
   moat is the data feeding a model, not the model.
7. **LLM narrative report generation.** Cosmetic relative to the decision. Solum
   already exports an investor-grade PDF. A quick polish win, not a moat.
8. **The consulting trust wrapper.** Listed last as a feature because it is not a
   software feature at all. Strategically it is the most important thing to have a
   deliberate position on: compete with it on transparency and speed, or wrap Solum
   in a light version of it. It is a choice to make, not a component to build.

## The one-line takeaway

AIRE is a three-week, AED-20k consulting study with a good engine under it. Solum is
that engine, minus the wait and the invoice, aimed at the screening decision AIRE is
too slow to serve. Copy AIRE's best-use framing, its forward-looking data ambition,
and its sensitivity analysis. Skip its timeline, its ML pitch, and its instinct to
deliver prose. Own the speed.
