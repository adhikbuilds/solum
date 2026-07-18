# SOLUM — Handoff Context

**Read this before touching `solum.html`.** It captures every decision made across the build sessions, why each was made, and what's deliberately out of scope. If you're a future Claude session, this file replaces about 12 hours of prior conversation.

---

## 1. What Solum is

Solum is a single-file HTML tool (no backend, no build step) that helps **Al Mizan** — a Dubai land-investment firm — decide whether to pursue a specific land plot. Given a tested land price, a margin hurdle, and a set of construction/soft-cost assumptions, it optimises the profit-maximising unit mix inside user-set min/max bands per unit type, then reports whether the plot clears the hurdle (Pursue / Negotiate / Pass) and the residual land value (the most you could pay and still hit the hurdle).

**Al Mizan** = the client (real estate firm). **Solum** = the tool. Don't confuse them.

**Environment:** built for Claude's artifact environment. Uses `window.storage` for per-plot key-value persistence (personal scope, not shared). Client-side only. All external libraries (jsPDF, jsPDF-autotable, pdf.js) lazy-load from cdnjs on demand.

**Currently at:** `solum.html`, ~2100 lines, one file. Working, validated, no known bugs at last pass.

---

## 2. The reference file that matters

**`JD_Investment_Console.html`** is Al Mizan's *other* tool — a proposal generator for joint-development (JD) investors. Different job than Solum, but a critical *visual and vocabulary* reference. When in doubt about clean investor-grade formatting, look at JD's cost buildup, its KPI strip, its PDF export layout. Solum has explicitly borrowed:

- The ROI-first vocabulary: **Return on Investment** (net profit ÷ total investment), **Return on Project** (net profit ÷ gross sales), **Net Profit** as the headline metrics.
- The granular cost line items: architect design + supervision split, named authorities, landscape/variations, misc as separate lines (not lumped).
- The dense sectioned PDF layout (dark header band, KPI strip, autoTable-driven sections).
- The convention of showing AED-total *and* AED/sqft on cost buildup rows.

Solum has explicitly *not* borrowed:
- JD's investor-split machinery (bifurcated columns, JD%, developer%). Solum's question is "should we buy the land," not "how do we split the deal."

---

## 3. Locked design decisions (the 19)

These are the calls made through the build process, in the order they were locked. If future work reverses one, do it deliberately, not by accident.

### Design token architecture
1. **Single source of truth in `:root`.** All colour, type, radius, spacing, motion, shadow tokens live in one clearly-labelled block at the top of the `<style>`. Nothing downstream (CSS, JS, inline SVG, PDF export) hardcodes a brand value. JS reads tokens at runtime via the `THEME` bridge (see §5). A palette swap = editing 7 lines in section 1 of the `:root` block. This was designed specifically so future design changes don't require a rewrite.

### Typography
2. **Three sizes, compressed range.** `--fs-label` (12px), `--fs-body` (15px), `--fs-data` (24px). No more than 3. The range is kept *tight* so the eye doesn't jump when scanning down the page. This is a deliberate reversal of an earlier 5-size scale.
3. **Weight + contrast + mono do the hierarchy, not size.** Numbers get bold + full-ink + mono. Labels get medium weight + muted, but stay legible (not shrunk to nothing). Panel headings anchor sections but don't tower over data.

### Colour philosophy
4. **Orange-monochrome accent only.** Every accent surface uses shades of the same accent family. Verdict tag (Pursue/Negotiate/Pass) is the *only* place semantic red/amber/green appears. Nowhere else.
5. **De-muted, higher contrast.** Data is full-ink, not soft. Muted colour is reserved for genuinely secondary information (labels, footnotes, tertiary meta).

### Investor-grade / decision-first
6. **KPI restructure, JD vocabulary.** Headline tier: ROI, Return on Project, Net Profit, Verdict. Side tier (smaller): Total Investment, Gross Sales, Avg Price/sqft, Cost/sqft with land, Cost/sqft no land.
7. **AED/sqft alongside AED-total** on the cost buildup table — so the "how is this built up" derivation is visible at a glance.
8. **Development programme strip** on Summary: total units, total sellable area, avg unit size, efficiency — the "what am I actually building" line.
9. **Breakeven price/sqft** shown on the Land & Hurdle panel — the average sale price the mix needs to hit at this land price to clear the hurdle. High-signal figure for a land buyer.

### Layout
10. **Summary is two columns, not three.** Left: Cost Buildup. Right: Recommended Unit Mix → Land & Hurdle stacked beneath. Rationale: unit mix table is shorter than cost buildup, so Land & Hurdle fills the right column's leftover space and both columns roughly balance.
11. **Land & Hurdle stays on Summary**, not Assumptions — these are live levers you flex while staring at the verdict, not settled defaults.
12. **Recommended unit mix table has a Total Size column** (size × units) and a summed area row — so you can see total sellable area per type, not just AED value.
13. **"Scenario testing"** — renamed from "If assumptions move." Heading weight matches every other panel heading. No special typographic treatment.
14. **Export PDF button lives in the topbar**, small accent-highlighted, next to the plot name. Not a giant bottom CTA. Always visible without scrolling.

### Chrome & interaction
15. **Radius: tighter, but not sharp.** Cards ~6px, buttons/inputs ~4px, containers ~8px max. Pills (verdict tag, badges) stay fully round because that's a *shape* choice, not a *corner* choice. Deliberately squarer than the original build; deliberately *not* JD-level sharp.
16. **Sidebar stays white** (kept clean, not tinted).
17. **Mix bar has a legend row.** Every type identified below the bar regardless of segment width — thin segments no longer render as unlabelled colour slivers.
18. **Unit programme sliders: middle path.** Track + two draggable handles only. Decorative band-fill, sliding chosen-marker, and animations have all been removed. "Chosen: X%" is now plain text in the label row, not a moving marker. User keeps full min/max control via drag.
19. **Unit sizes/pricing table moved to Unit Matrix tab** (was on Assumptions). Now sits next to the programme bands. When a type is toggled off in the programme, its row mutes automatically in the sizing/pricing table (grayed, non-editable).

### Bug fixes folded into the same pass
- **Login screen scroll bug** — root cause: `#loginScreen` was never hidden on successful login, only the `pre-login` body class was toggled. Fix: explicitly set `#loginScreen.style.display='none'` in `enterApp()`. Also `window.scrollTo(0,0)`.
- **Login demo credentials** — restyled as real bordered input fields (`.login-field .box`), not tiny muted text rows.
- **"Save failed" chip removed** — the chip now only ever shows `Saving…` or `Saved`. On error it silently retries after 2s rather than flashing an alarming state to the user.
- **Export PDF button icon** — the loading-state label swap targets a `#btnExportPdfLabel` span so the SVG icon isn't destroyed by `textContent`.
- **PDF export errors are now visible** — real `console.error` + `alert` with the actual error message, not a silent generic failure.
- **Plot Details expanded** — added usage/designation, basement levels, podium levels, computed coverage% (readonly, derived), and a free-text notes field.

---

## 4. The Solum AI feature (chatbot)

Floating orange FAB, opens a right-side panel. User types a natural-language instruction ("raise the hurdle to 22% and widen the 2BR band to 10–45%"). The panel calls the real Claude API (`claude-sonnet-4-6`) with a system prompt listing every editable field path, and requires the response to be minified JSON in this exact shape:

```json
{"reply":"one-sentence description","changes":[{"path":"assumptions.cont","oldValue":10,"newValue":12}]}
```

Solum then renders a diff card showing before → after per field, with **Apply** and **Discard** buttons. **Nothing is applied without explicit confirmation.** The system is designed to never edit model state silently.

The API key is an empty `ANTHROPIC_KEY` constant near the top of the AI section — the user pastes their own key for a demo. If the key is empty, the chatbot returns a graceful fallback message ("paste a key to enable this") rather than silently failing.

---

## 5. Architecture: how the token system actually works

This is the most important part of the codebase to preserve when editing. It's what makes future design changes trivial.

**The `:root` block** (top of `<style>`) is organised into 8 numbered sections with header comments telling the next editor exactly where to look for common changes. Every value used anywhere in CSS routes through a token.

**The `THEME` JS bridge** reads CSS tokens at runtime via `getComputedStyle`, so any code that can't use `var(--x)` — canvas, inline SVG built by JS, jsPDF — still tracks the same source of truth. It exposes:

- `THEME.color('--accent-500')` — resolved hex string
- `THEME.rgb('--ink')` — `[r,g,b]` array for jsPDF
- `THEME.resolveVar('var(--u-2br)')` — resolves a raw CSS var reference (used because unit-type `.hex` values are stored as `var(--u-2br)` strings in STATE)

**Verified guarantees (do not break these):**
- Swapping 7 accent values in `:root` § 1 recolours the entire app (CSS + JS-drawn SVG + PDF) with **zero residual orange** anywhere in the file. This was acid-tested.
- Changing `--font-family` in `:root` § 4 is a **one-line font swap** (plus the Google Fonts `<link>` href).
- Changing 4 radius values in `:root` § 5 restyles every corner in the app.

**Common change reference:**

| Task | Where to edit |
|---|---|
| Orange → any other colour | `:root` § 1, seven `--accent-*` values |
| Change font | `:root` § 4 `--font-family`, plus `<link>` href |
| Tighter/looser corners | `:root` § 5, four `--radius-*` values |
| Tighter/looser type | `:root` § 4, three `--fs-*` values |
| Motion timing | `:root` § 7 `--dur-*` |

---

## 6. Explicitly out of scope

Do not add these without being explicitly asked. They were considered and parked:

- **DLD / Property Finder / Propsearch API integration.** All pricing, absorption, and comparable data is currently manual/modeled with `sourced/modeled/input` provenance badges. Real API integration is future work.
- **Absorption modelling.** Was in an earlier version, explicitly cut. Do not resurrect without an ask.
- **IRR.** Requires a phased cash-flow timeline (multiple periods with dates). Solum is a single-point snapshot. Do not add a fake IRR figure — it would be misleading. If a phased cash-flow model is ever added, IRR can be revisited then.
- **Real backend authentication.** Login is presentational only — clicking any login button just enters the demo app. Not a security boundary.
- **Audit trail, user logs, settings page.**
- **JD-style investor bifurcation** (JD%, developer%, split cash columns). Solum's job is the land-buy decision, not proposal generation.

---

## 7. The Astryx question — RESOLVED (Path B, 2026-07-18)

**Decision: Path B. The Astryx association is dropped. Solum owns its own design direction.**

Background: Solum's original brief claimed its tokens were "adapted from Meta's Astryx design system." Verification found only two things actually matched Astryx (motion values, spacing scale); radius, type scale, colour philosophy, font, and naming conventions all diverged. Three paths were on the table (A: full literal Astryx adoption — reverses locked decisions; B: commit to Solum's own direction; C: Astryx token *naming* over Solum values). The user chose **B**, which is where the last two sessions were already drifting.

**What was done to execute Path B:**
- Retired the entire legacy alias layer that made the token block half-and-half. The `:root` block previously carried two parallel vocabularies: the canonical tokens (`--accent-*`, `--surface-2`, `--font-sans/mono`, `--fs-label/body/data`, `--radius-*`) *and* a back-compat set left over from earlier iterations (`--pine*`, `--brass-deep`, `--surface2`, `--sans`, `--mono`, `--fs-xs/sm/base/lg/kpi`, `--r-none/inner/el/container/page/full`).
- All 172 downstream usages of the legacy aliases were rewritten to the canonical tokens (1:1, behaviour-preserving), and the alias *declarations* were deleted from `:root`. The token block is now a single vocabulary.
- Verified after the change: every `var(--x)` resolves to a defined token; the blue-swap acid test still leaves **zero** residual orange (the §5 token guarantee holds); JS syntax clean; tag balance and IDs intact.

No visual change was intended or made — this was purely collapsing two naming systems into one. There are no remaining open Astryx-related questions.

---

## 8. Working method (things that made this build go well)

- **Lock decisions before executing.** Every big pass was preceded by a bullet list of what was about to change, confirmed by the user before any code was touched.
- **Read the reference files.** JD_Investment_Console had the answers for cost line items and PDF layout. Astryx docs had the answer for what the token vocabulary should look like. Look before inventing.
- **Test the acid case, don't just claim it works.** After the token architecture pass, actually simulated a blue-swap and grep'd for orange residue. That's the reason the token guarantee is real, not aspirational.
- **Structural validation on every pass.** JS syntax check, duplicate-ID check, tag balance check, CSS var completeness check. These caught real bugs each time.
- **Don't over-format prose.** The user prefers direct answers with reasoning inline. No bullet-point storms. No summary sections at the bottom of every reply.

---

## 9. Repo layout (recommended)

```
solum/
├── solum.html                        the working file
├── SOLUM_CONTEXT.md                  this file
├── JD_Investment_Console.html        reference for visual/vocab decisions
├── docs/
│   ├── README.md                     how we work: brainstorm → decide → PRD → code
│   ├── DECISIONS.md                  running decisions log (extends §3)
│   └── prd/                          one spec per feature (TEMPLATE.md to start)
└── (any plot PDFs to test upload extraction)
```

For any new session: `Read SOLUM_CONTEXT.md before we start`, then work from there.

**Working in the repo:** the whole loop — brainstorm, decide, PRD, code — happens
here, with the thinking captured as docs next to the code. See `docs/README.md`.
Lock decisions in writing (`docs/DECISIONS.md` for one-liners, `docs/prd/` for
anything bigger) before executing them.
