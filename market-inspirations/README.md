# Market inspirations

A running file on how other people solve the land-feasibility problem, so Solum
borrows the good ideas on purpose instead of reinventing them by accident.

This is deliberately separate from `docs/PROJECT_CONTEXT.md`. That doc holds
Solum's own strategy and its earlier reference reads (Aprao, the JD Console, the
BCG framing). This folder is the outside-in view: who else is in the market, what
category they belong to, and what each one teaches us. Add a player whenever we
study one in enough depth to have a real opinion.

## The two categories of player

Feasibility work in this market is served two ways. Most firms sit clearly in one
camp. The interesting ones straddle both.

### 1. Traditional consulting
A named firm runs the study by hand and delivers a signed report. Human experts,
RICS-standard methodology, a few weeks of work, a slide deck plus an Excel model
that usually stays with the consultant. The client pays for the judgement and the
liability cover, not just the numbers. Typical shape in Dubai: three to four weeks,
AED 20k and up, one plot per engagement.

The value is trust and defensibility. The limit is speed and cost. You cannot run
a consulting study across twenty plots to decide which one to bid on. It is a
deep-dive tool, not a screening tool.

### 2. Software platforms
A product does the study. Plot in, feasibility out. GIS and market data feed a
financial engine that generates and ranks development scenarios, and the output is
a report. Faster and cheaper per plot, self-serve, weaker on the human trust
wrapper that a signed consulting opinion carries.

The value is speed, cost per plot, and iteration. The limit is credibility and the
depth of any one answer.

### Where the line blurs
The most relevant competitors run the software *and* sell the consulting on top of
it. The software is the delivery engine, the consultant is the trust wrapper. AIRE
is the clearest example, and the reason it is the first player profiled here.

Solum sits in category 2, built in-house for one developer. The open strategic
question this folder exists to inform: how far up the category-1 trust wrapper does
Solum need to climb, and how much of the category-1 depth is actually worth copying
versus deliberately skipping.

## Players studied

| Player | Category | Profile | Analysis |
| --- | --- | --- | --- |
| AIRE | Consulting + Software (both) | [`players/aire.md`](players/aire.md) | [`analysis/aire-vs-solum.md`](analysis/aire-vs-solum.md) |
| Land Sterling | Consulting (RICS valuation house) | [`players/land-sterling.md`](players/land-sterling.md) | [`analysis/consultants-vs-solum.md`](analysis/consultants-vs-solum.md) |

Cross-cutting read: [`analysis/consultants-vs-solum.md`](analysis/consultants-vs-solum.md)
puts both consultants side by side. The short version is that two firms with opposite
value propositions (AIRE sells tech and data at AED 20k, Land Sterling sells chartered
trust at AED 73,500) structure the same study the same way and both lead with Highest
& Best Use. When opposites agree, the agreement is signal.

Earlier references (Aprao, JD Investment Console, BCG) live in
`docs/PROJECT_CONTEXT.md` §4. Move them here if they ever get a full write-up.

## Design principles

Before building anything customer-facing, read
[`design-principles/ai-slop-antipatterns.md`](design-principles/ai-slop-antipatterns.md).
It is a pre-ship gate distilled from a YC design review of six AI-built startup landing
pages: what reads as auto-generated, what the reviewers actively praised, and the six
tests every effect on the Solum site has to pass. Source transcript is alongside it.

Site design references live in `analysis/` —
[`rudus-design-teardown.md`](analysis/rudus-design-teardown.md) is the primary one.

## How to add a player
Copy [`players/_template.md`](players/_template.md), fill it in, add a row to the
table above, and write a comparison in `analysis/` if the player is close enough to
Solum to be worth a gap read. Keep source material (proposals, screenshots, notes)
under `players/sources/`.
