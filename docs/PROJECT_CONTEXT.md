# Solum — Project Context & Decision Log

*A land feasibility console built for Al Mizan, and a wedge into AI-native real estate tooling.*

> **How this doc relates to the others.** This is the **strategic / product** layer — why
> Solum exists, who it's for, the competitive landscape, the long-run vision, and the
> product-level decision log. For the **build & architecture** handoff (the working file,
> token system, structural checks) read [`../SOLUM_CONTEXT.md`](../SOLUM_CONTEXT.md). Read
> order for a new session: this doc for the *why*, then `SOLUM_CONTEXT.md` for the *how*.
>
> **One reconciliation to know up front:** this document predates the **Path B** decision
> (2026-07-18). Its Astryx framing in §5, §6.5 and §10 has since been superseded — Solum
> dropped the Astryx association and committed to its own token vocabulary. Those spots are
> annotated inline. See `SOLUM_CONTEXT.md` §7 and `DECISIONS.md`.

---

## 1. Why this project exists

Real estate is one of the least AI-penetrated major industries. Investment in AI as a share of revenue in real estate runs meaningfully below the cross-industry average, and the gap is widening rather than closing — despite the sector being structurally exposed to exactly the kind of inefficiency AI is good at fixing: fragmented data, manual underwriting, spreadsheet-based feasibility work passed around as static files, and decisions made on incomplete or stale comparables.

That gap is the opportunity. The bet behind Solum is not "build Al Mizan a nice internal tool" — it's **use one real client's real workflow as a wedge into AI-native real estate software**, starting narrow (one workflow, one client, one market) and expanding outward once the core loop is proven:

1. **Land feasibility for one developer (Al Mizan, Dubai)** — the workflow being built right now.
2. **Adjacent developer workflows** — investor/JV proposals, portfolio-wide plot comparison, market comps — expanding Solum's surface area for the same client.
3. **Other developers / markets** — once the core product is proven on one client, it generalizes.
4. **A category-defining platform** — the long-run ambition (see §7) is something closer to a Bloomberg Terminal for real estate: one place where developers, investors, and analysts get live, sourced, model-backed answers instead of assembling them by hand across Excel, PDFs, and broker calls.

Al Mizan is the beachhead client, not the ceiling.

---

## 2. Who Solum is for, and what job it does

**Client:** Al Mizan — a Dubai land/real estate investment firm. (Important distinction locked early: **Al Mizan is the client, not the product name.** The tool itself is called **Solum**.)

**Core job Solum does today:** given a plot of land, help a developer decide — quickly, defensibly — whether to pursue it. Concretely:
- Test a land acquisition price against a margin hurdle
- Optimize the buildable unit mix inside realistic min/max bands
- Compute Residual Land Value (RLV) — the maximum price payable and still hit the hurdle
- Return a clear verdict: **PURSUE / NEGOTIATE / PASS**
- Let a developer hold multiple plots and compare which is worth chasing this week

**Who uses it:** developers and investors doing land acquisition — people who think in margins, hurdles, and unit economics, not people who want a beautiful dashboard for its own sake. This shaped almost every downstream design decision (see §6).

---

## 3. Real estate developer workflows this is modeled on

Several real workflows were explicitly discussed and used to shape the product, not invented in the abstract:

- **The land-buy decision itself.** A developer is handed a plot, a broker's asking price, and has to decide fast whether it's worth pursuing, worth negotiating down, or worth walking away from — before someone else buys it. This is Solum's primary loop.
- **Portfolio triage.** Real developers aren't evaluating one plot in isolation — they have several live opportunities on their desk at once and need to rank them by which is worth chasing. This drove the "All Plots" portfolio view (sortable by margin, verdict, RLV) as the second core screen, and Compare as a first-class multi-plot view.
- **Investor / joint-development (JV) proposals.** A different but adjacent workflow: once a developer wants to bring in outside capital, they need a polished document showing the total project economics and the investor's proportional slice (land cost, development cost, total investment, profit share) at whatever equity percentage is being offered. This is *not yet built in Solum* but was studied directly via Al Mizan's own prior tool (see §4) and is a planned adjacent workflow.
- **Sensitivity / downside stress-testing.** Developers don't trust a single-scenario number — they want to know how fragile a deal is if prices soften or costs overrun. This is why Solum has editable-flex scenario cards rather than a single static forecast.
- **Assumption ownership and defensibility.** In real underwriting, every assumption in a feasibility model has to be traceable — is this number from a market source, is it something the team decided, or is it a placeholder someone should sanity-check? This is the origin of Solum's three-tier provenance system (sourced / modeled / input) attached to every editable field.

---

## 4. Competitive / reference landscape reviewed

Three concrete references were studied in depth during this project, each contributing different lessons:

### Aprao (UK land feasibility / residual appraisal tool)
A live, real UK-market feasibility SaaS product, reviewed via screenshots and product documentation. Key takeaways adopted:
- **Persistent live-metrics rail** visible across every tab (key metrics don't disappear when you go edit an assumption) — directly shaped Solum's decision to keep the top bar/verdict context always reachable.
- **Scenarios as saved, comparable objects** rather than disposable cards — informed Solum's multi-plot Compare thinking.
- **Price × cost sensitivity heat map** as a stronger stress-test visual than static ±10% cards.
- **What to avoid:** Aprao's IRR calculations broke visibly in the reviewed examples (one appraisal showed 912% IRR, another showed -100% Equity IRR) — a direct lesson that **adding a metric is a liability if it can produce nonsense outputs**, and part of why Solum has deliberately avoided adding IRR/cashflow/debt-structuring complexity it can't yet compute reliably.
- **What was explicitly rejected:** kanban-style deal-stage board, free-text narrative write-up fields (Site Location paragraphs, Market Positioning essays) — manual busywork with no data behind it, opposite direction from where Solum is headed.

### JD Investment Console (Al Mizan's own existing/prior tool)
Al Mizan's actual current tool, reviewed in full (a single dense HTML file bundling jsPDF and SheetJS for export). This is a fundamentally different workflow from Solum — **it's a proposal generator for pitching JD/joint-development investors**, not a land-buy decision tool. No optimizer, no hurdle-based verdict, everything manually entered, single scenario only.

What it does well and Solum is adopting:
- **Clean, investor-grade KPI strip** — 7 headline numbers up top, large and immediately legible. This directly triggered Solum's typography/color simplification pass (see §6).
- **Investor/JD bifurcation table** — splits total project economics into "100% project" vs. "investor's X% share" side by side for land cost, development cost, total investment, and profit share. Solum does not have this yet; it's a planned adjacent feature once the JV-proposal workflow is prioritized.
- **Granular, named cost line items** (architect fees split into design-vs-supervision, named authority fees DEWA/RTA/DDA, landscape/variations, misc) — being adopted into Solum's Assumptions tab in place of coarser blended percentages.
- **Real PDF/Excel export**, already wired to working libraries — validated that a polished export is achievable and worth building into Solum.

What it does poorly, and why Solum is still ahead structurally despite the polish gap:
- Zero optimization or automated recommendation — the user manually types one unit mix.
- No concept of "max price I can pay for this land" (no RLV equivalent).
- No sensitivity/downside scenarios anywhere in the proposal.
- No provenance on any number — every figure is just typed in, with the same visual confidence whether it's sourced or guessed.
- An unrelated unit converter tab and flat, unsortable saved-proposals list.

### BCG "AI-First Real Estate Companies" research
Referenced for the macro backdrop in §1 — real estate's AI investment lagging the cross-industry average, and BCG's framing of where AI creates value across DevCo / Investment Management / FM-PM business models (deal sourcing, diligence/underwriting, portfolio value creation, exit timing). This grounds Solum's category thesis: land feasibility sits squarely in the "diligence and underwriting" value pool BCG identifies as one of the highest-impact AI use cases in real estate investment management.

---

## 5. Product identity decisions

- **Tool name: Solum.** Landed after multiple naming rounds (functional names like "Plot Verdict," metaphor names like "Land Compass," dictionary words like "Groundtruth," then coined/brand-style names). Solum was chosen for being short, real-adjacent (Latin root: ground/soil/foundation), ownable, and not overused in proptech.
- **Al Mizan ≠ product name.** Al Mizan is the client and appears as a small tag under the Solum wordmark ("Land Feasibility Console · Al Mizan"), not as the app identity.
- **Logo mark:** a geometric parcel-boundary line icon — a rectangle with one corner cut, small survey-style corner ticks, and a single filled vertex — chosen over more generic/abstract options (contour-line monogram, cross-section symbol) because it's literal to the actual job (evaluating a land parcel) without being a cliché building icon.

---

## 6. Design and product decisions, in order, with rationale

Roughly chronological; later decisions sometimes reverse or refine earlier ones — the reversals are kept here because the reasoning matters as much as the current state.

1. **Started from an existing single-plot HTML tool** (Al Mizan's initial feasibility build) with a hand-rolled pine/brass/brick color system and an optimizer already computing margin-maximizing unit mix.
2. **Diagnosed the core accuracy problem:** the optimizer was always pushing toward whatever min/max bands the user typed by hand, meaning the "recommended mix" was really just restating the user's own guess with a profit label on it — not genuinely market-grounded. This is why DLD/comps grounding was flagged early as the real fix, but deliberately **deferred** (see §8) since real data access wasn't in place yet.
3. **Provenance system introduced:** every assumption tagged as one of three tiers — *market-sourced* (has a real citation), *modeled assumption* (editable, no external source yet), or *your input* (the user's own judgment call, e.g. land price/hurdle). This was a direct response to the "we're indexing too much on a number we don't understand" concern — the fix chosen was honesty about uncertainty rather than fake precision.
4. **Multiple candidate mixes instead of one silent "best" mix.** Rather than trying to make the optimizer smarter (which isn't possible without real absorption data), the fix was to surface the full set of candidate mixes the optimizer considered, so the single recommended mix is understood as one choice among many, not an oracle.
5. **Astryx (Meta's open-source design system) evaluated as a styling reference.** Concluded it's a React/npm/StyleX system incompatible with a static single-file HTML tool with no build step — decision made to borrow Astryx's *token values* (spacing scale, radius scale, shadow tiers, motion durations, type scale) into the existing hand-rolled CSS variables, without adopting the actual library or migrating off the single-file architecture. Explicitly flagged as revisit-later if Solum ever becomes a real hosted product with a dev team and backend.
   > **Update (2026-07-18) — superseded by Path B.** On closer verification only motion and spacing actually matched Astryx; radius, type scale, colour philosophy, font, and naming all diverged. Solum **dropped the Astryx association** and committed to its own single token vocabulary (the leftover `--pine*`/`--brass*` legacy aliases were retired). Astryx is no longer a reference. See `SOLUM_CONTEXT.md` §7.
6. **A full portfolio/multi-plot view added,** reversing an earlier "that's just noise, single-plot is the job" call — corrected once it was pointed out that real developers evaluate several live plots at once and need to rank/compare them. Became the "All Plots" table (sortable by margin/verdict/RLV, searchable) plus a Compare mode.
7. **Login screen added for demo purposes,** explicitly presentational only (no real backend/auth exists — this is a static client-side tool). Demo credentials shown pre-filled, one-click login, plus Google/Microsoft SSO-style buttons that all lead into the app regardless of what's clicked (cosmetic, not functional auth).
8. **Full navigation/IA rebuild**, after recognizing Al Mizan is the client, not the product — triggered a full color/type/logo refresh (orange-accent Urbanist system) and, separately, several rounds of correcting the information architecture:
   - First pass: login → lands on portfolio. *Rejected* — portfolio isn't the daily-use home base for a returning user.
   - Second pass: login → lands on last-opened plot; tabs move into the sidebar as primary navigation. *Refined further* — plot-scoped tabs (Summary/Recommended Mix/Assumptions/Plot & Pricing) belong in a left nav; cross-plot actions (All Plots, Compare, +New) belong in a persistent top bar. This is the structure that shipped.
9. **"How it could look" floor-plate/stack visualization cut entirely** — judged as a decorative element without enough informational value to earn its space, especially once the "investor-grade seriousness over dazzle" direction was set later.
10. **Tab content reorganized multiple times** based on direct usage logic, landing on:
    - **Summary** — the one-screen answer: KPI strip, small verdict indicator, cost buildup, recommended unit table, land price & hurdle levers (the two things a user flexes most while negotiating), and editable-flex scenario cards.
    - **Unit Matrix** (renamed from "Recommended Mix") — unit programme bands/switches, the optimizer's output (mix bar, unit cards, P&L, RLV), and the full candidate-mix expander.
    - **Assumptions** — every cost input (construction cost, soft costs, contingency, parking, marketing, now being made more granular JD-style), unit type pricing (moved here from Plot & Pricing, since it's a modeled assumption, not a hard fact), scenario flex%, and (new) an absorption toggle.
    - **Plot Details** (renamed from "Plot & Pricing") — pure geometry: plot number, community, sub-community, GFA, plot area, FAR, floors.
11. **"Investor-grade, not dazzle" as the explicit design mandate**, prompted directly by comparing Solum's polish against Al Mizan's own JD Investment Console PDF export. Concrete changes locked from this:
    - Collapse the type scale from ~11 sizes down to ~5; make KPI numbers the visually largest element on the page (previously they were smaller than decorative headline text — backwards for a numbers-first audience).
    - Collapse the color palette to an orange monochrome scale plus gray, reserving red/amber/green *only* for the PURSUE/NEGOTIATE/PASS verdict tag — removing yellow/purple/multi-hue unit-type colors that made the tool feel like a design demo rather than a financial instrument.
    - Cut the large tilting verdict-scale SVG animation entirely, replacing it with a small icon-sized static scale glyph next to the verdict word — no motion, no dazzle, all attention redirected to the KPI numbers.
    - Real PDF export via jsPDF, targeting the same investor-document tone as the JD reference export (KPI strip, cost buildup, unit sales table, profitability waterfall) but backed by Solum's actual sourced/modeled numbers rather than unlabeled inputs.
12. **Absorption toggle added (not full absorption modeling).** Per-unit-type absorption ceilings can optionally constrain the optimizer, but default OFF, and explicitly labeled as a "modeled assumption" placeholder — not wired to any real market data yet. This was a deliberate middle ground: the shape of the feature exists in the UI so it's ready to plug into real DLD/comps data later, but nothing pretends to be market-grounded before it actually is.
13. **Solum AI assistant added** — a floating natural-language interface for editing the model ("make 1BR and 2BR bands equal," "raise the hurdle to 22%"). Deliberately built with a **confirm-before-apply pattern**: the AI proposes a diff (old value → new value per field), and nothing changes in the model until the user explicitly approves. Built against the real Claude API (not a hand-coded pattern matcher) for genuine natural-language flexibility, with an empty API-key placeholder the user fills in themselves for demos, and a graceful fallback if no key is present — chosen deliberately over the safer-but-dumber pattern-matching alternative because the "wow, it actually understood that" moment was judged worth the tradeoff for a demo context.
14. **Delete-plot flow hardened** — demoted from a prominent, easily-misclicked sidebar button to something that always requires explicit confirmation; row-level Duplicate/Delete moved into a kebab menu so they don't visually compete with the primary "open this plot" action.
15. **Row-click as the primary way into a plot**, replacing a small, easy-to-miss "Load" text button as the *de facto* only obvious entry point — the whole portfolio row is now the target, with a lightweight open affordance rather than a busy row of competing text buttons.
16. **Compare becomes a full dedicated view**, not a modal — a real side-by-side project-summary screen for 2–4 plots, reflecting that comparing plots is a first-class workflow, not an afterthought dialog.

---

## 7. The long-run vision: a Bloomberg Terminal for real estate

The explicit end-state ambition behind Solum, articulated as the reason this is being built with real rigor rather than as a one-off client tool:

**Bloomberg built its moat by being the terminal where finance professionals could get any number they needed — priced, sourced, comparable, and trusted — faster than anywhere else, and then made itself indispensable by becoming the place deals actually got done.** Real estate has no equivalent. Feasibility lives in Excel. Comps live in broker relationships and PDFs. Portfolio views live in whatever internal tool a firm happened to build. There is no single, trusted, live terminal for "what is this piece of real estate actually worth, and should I buy it."

The advanced end-state version of Solum is that terminal for real estate investment decisions:

- **Live, sourced market data** — DLD transaction feeds (and equivalent registries in other markets) replacing every "modeled assumption" badge currently in Solum with a real "market-sourced" one, refreshed continuously rather than typed in once.
- **Absorption and demand intelligence** — not just historical prices but forward-looking sell-through rates by community and unit type, turning the currently-parked absorption toggle into a genuinely grounded constraint.
- **Portfolio-wide, multi-market intelligence** — not one developer's plots, but the ability to benchmark any plot against comparable transactions, comparable developers' launches, and comparable markets, the way a Bloomberg terminal lets you benchmark any security against its peers instantly.
- **The full deal lifecycle, not just acquisition** — extending from the current land-buy decision into JV/investor proposal generation (directly informed by JD Investment Console's bifurcation workflow), then into portfolio value-creation and exit-timing decisions, mirroring the BCG-identified value pools across the real estate investment lifecycle (deal sourcing → diligence/underwriting → portfolio value creation → exit timing).
- **An AI layer that doesn't just answer questions but does underwriting work** — the current "Solum AI" natural-language editor is the earliest version of this; the end-state is closer to an analyst-in-the-loop that can independently pull comps, run scenarios, and flag risk the way a junior underwriter would, always with the same confirm-before-apply discipline established now so trust isn't sacrificed for speed.
- **Multi-tenant, multi-client** — Al Mizan is client zero. The generalized version serves any developer or investment manager who needs the same rigor: sourced numbers, defensible assumptions, fast verdicts, comparable across the whole deal pipeline.

The throughline connecting where Solum is today to that end-state: **every current-state decision to say "not yet" (DLD integration, absorption modeling, JV proposals, real backend/auth) was made to avoid faking rigor Solum doesn't have yet** — the provenance-tagging system exists specifically so that as real data gets wired in, tiers upgrade honestly from "modeled" to "sourced" rather than the tool ever having pretended to know something it didn't.

---

## 8. What's explicitly out of scope / parked right now, and why

| Parked item | Why |
|---|---|
| DLD/comps API integration | Real market-grounding is the single highest-leverage upgrade, but needs a deliberate methodology decision (which data source, how to aggregate by sub-community/size-band/recency) rather than being bolted on quickly. Sequenced as its own phase. |
| Full absorption modeling | Same reasoning — a toggle/placeholder exists in the UI, but the underlying data isn't real yet. Explicitly avoided pretending otherwise. |
| Real backend / authentication | Solum is currently a static client-side tool with `window.storage` persistence. The login screen is presentational only. A real product would need a real backend, which is a bigger, separate infrastructure decision. |
| JV / investor bifurcation proposal generator | A validated, valuable adjacent workflow (seen working well in JD Investment Console) but a different feature surface — planned for after the core land-buy workflow (Summary/Unit Matrix/Assumptions/Plot Details/Compare/PDF export/Solum AI) is solid. |
| Audit trail / user logs / settings page | Real "eventually" features, but judged as adding sidebar surface area without anything substantive to put in them yet given the current single-user demo context. |
| IRR / cashflow / debt-structuring metrics | Deliberately avoided after seeing Aprao's IRR calculations produce nonsensical outputs (912% IRR, -100% Equity IRR) in real examples — a metric is a liability, not a feature, if it can't be computed reliably. Revisit only once there's confidence in the underlying math. |

---

## 9. Current build priorities (as of the most recent working session)

The active build pass, locked and approved, covers:

1. Typography collapse (~5 sizes, KPI numbers largest)
2. Color reduction to orange-monochrome + verdict-only semantic color
3. Summary tab rebuild (KPI strip, small icon-scale verdict indicator, cost buildup, unit table, land/hurdle levers, scenarios, Export PDF button)
4. Tab rename: "Recommended Mix" → **"Unit Matrix"**
5. Assumptions expansion: unit pricing moved in, cost lines made granular (JD-style), scenario flex% moved in, absorption toggle added (default off, tagged as modeled assumption)
6. Plot & Pricing → renamed **"Plot Details"** (geometry only)
7. Delete-plot flow hardened (demoted, always confirms)
8. Portfolio table: whole-row click to open; row actions moved to kebab menu
9. Compare rebuilt as a full dedicated view, not a modal
10. **Solum AI** floating assistant — real Claude API calls, diff-preview-then-confirm pattern, empty API key placeholder for the user to fill in
11. Login flow fix — clicking any login option should land directly on the Summary tab of the last-opened plot (flagged as not fully wired yet, needs verification/fix)
12. Real jsPDF export matching investor-grade tone of the JD reference document

> **Build-state note (2026-07-18).** Per `SOLUM_CONTEXT.md`, items 1–4, 6–10 and 12 are reflected in the shipped `solum.html`, and the login-screen scroll/hide bug (item 11) has been fixed in `enterApp()`. The type scale was ultimately collapsed further than "~5" to a **3-size scale** (`--fs-label/body/data`). Treat `SOLUM_CONTEXT.md` §3 as the authoritative current build state where these two docs differ.

---

## 10. Open threads / natural next conversations

- **DLD/comps data source decision** — official Dubai REST API vs. aggregators (Property Monitor, Reidin, DXBinteract-style sources), and the aggregation methodology (sub-community match, size-band match, off-plan vs. ready split, recency decay) needed to actually move provenance tags from "modeled" to "sourced."
- **JV/investor proposal generator** — bringing the JD Investment Console's bifurcation workflow into Solum properly, once the core land-buy workflow is fully polished.
- **Whether/when to move off the single static-HTML-file architecture** — relevant once real backend auth, multi-tenant data, or a real component library become worth adopting for real (currently deferred).
  > **Update (2026-07-18):** the Astryx component library specifically is no longer a candidate (Path B dropped the association). This thread is now purely "when does a static single file stop being enough" — independent of Astryx.
- **Model rigor conversation** (explicitly flagged as "we'll talk later about model") — separate from the structure/formatting pass just completed, a future session on tightening the underlying feasibility math itself.
