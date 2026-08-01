# Rudus.ai — design teardown

*Reference for the Solum marketing site. Analysed from a 52-second full-scroll screen
recording, frame-sampled at 2.2s intervals with exact colour values pulled from the
pixels. Rudus is a YC-backed AI takeoff/estimating tool for concrete subcontractors —
adjacent industry (construction), same problem shape (technical buyers, dense
drawings, a number at the end).*

## Why this reference is the right one

Rudus sells software to construction estimators. Solum sells software to land buyers.
Both audiences are technical, sceptical, and care about a number being defensible. The
site earns trust the way Solum needs to: by showing the product working on real
drawings, not by claiming outcomes. Nothing on the page is a stock illustration.

## The exact palette (sampled, not guessed)

| Role | Hex | Note |
| --- | --- | --- |
| Page background | `#0E0F0E` | Near-black, faintly warm/green |
| Card background | `#080808` | **Darker than the page** |
| Headline | `#FEFFFD` | Near-white, not pure |
| Body text (mono) | `#777976` | Mid grey, deliberately quiet |
| Accent (eyebrow, small marks) | `#96B596` | Sage green |
| Button fill | `#445543` | Deep sage |
| Button label | `#D9E5D9` | Pale sage-white |
| Input background | `#1C1E1B` | |
| Input border | `#292B28` | |
| Badge pill | `#2A2C29` | The "Backed by Y Combinator" chip |

**The move worth stealing:** cards are *darker* than the page (`#080808` on `#0E0F0E`).
Panels recede instead of floating. No drop shadows anywhere. This is the opposite of
the default SaaS instinct (white card, soft shadow, elevated) and it is most of why the
page reads as considered rather than assembled.

## Typography

Two families only, doing completely different jobs.

- **Headlines** — large geometric sans, near-white, tight leading, sentence case with
  full stops ("Faster takeoffs. Sharper estimates. More bids."). Notably **not bold** —
  regular-to-medium weight at large size. Confidence through scale, not weight.
- **Everything else** — **monospace**, grey, small, generous line-height. Body copy,
  nav, buttons, form labels, footer links. The mono is what signals "technical tool."
- **Eyebrows** — mono, uppercase, letterspaced, sage, prefixed with a `•` bullet
  (`• CORE FEATURES`).
- **Buttons** — mono, uppercase, letterspaced, inside a full-radius pill.

The sans/mono split does the heavy lifting. No third font, no weight soup.

## Structure, in order

1. **Hero** — three-line headline, mono sub-paragraph, one pill CTA (`SEE DEMO`), and a
   `Backed by Y Combinator` chip above. Behind it, a **slowly drifting architectural
   wireframe** of a building, drawn in near-black lines barely above the background.
   Comparing frames 2.2s apart, the drawing perceptibly pans and scales. Ambient, not
   decorative — it says "this tool reads drawings" without a caption.
2. **Core features** — eyebrow, big headline, mono deck, then alternating left/right
   feature blocks.
3. **Feature blocks** — each pairs copy with **live product UI**, not a screenshot.
   One shows AI element detection highlighting footings in blue with a simulated cursor
   and a `⇥ Tab to accept` tooltip. The interaction is *performed* for the visitor.
4. **Demo video** — a full narrated walkthrough (5:35) with the founder's webcam in a
   circular bubble, **live word-by-word captions** with the spoken word highlighted in
   green, and custom player chrome: scrubber with chapter segments, timestamp, `1.0x`
   speed, CC, volume, expand, fullscreen.
5. **Gated CTA** — centred, huge headline ("See how fast your takeoffs can be."), mono
   deck, six fields in a two-column grid, and crucially **"Upload Sample Plan
   (optional)"** as a field. The lead magnet is *bring your own work and we'll run it*.
6. **Footer** — positioning line as a headline top-left, three mono links top-right, and
   a giant ghosted logo mark plus wordmark in near-invisible dark grey filling the base.

## The two ideas that make it work

**1. Product screenshots are light; the page is dark.** Every embedded plan drawing and
app panel is white or near-white against `#0E0F0E`. They glow. The dark page is a
frame, not a theme — it exists so the product looks luminous.

**2. The product performs, it does not pose.** Simulated cursors, tooltips mid-action,
elements being detected in real time. A static screenshot says "this exists." An
animated interaction says "this works, watch."

## What this means for Solum

**Take the structure and the discipline. Do not take the palette.**

Solum already owns a colour identity (cream, `#FF6B19` orange, graphite). Copying sage
green would make Solum a Rudus clone and throw away brand equity. But the *structural*
logic transfers directly, and one substitution makes it stronger:

- **Dark page, light product.** Solum's app is light cream with orange accents. Against a
  near-black marketing page it will glow exactly the way Rudus's white plan drawings do —
  and orange on near-black is far more arresting than sage. Same mechanic, better contrast.
- **Cards darker than the page. No shadows.** Directly applicable.
- **Sans headline + mono everything-else.** Suits a feasibility tool at least as well as
  an estimating one. Mono reads as "numbers you can check."
- **Ambient drift behind the hero.** Rudus uses a building wireframe. Solum's equivalent
  is a **plot/parcel geometry** — the DDA plot outline, setbacks, a massing envelope —
  drifting slowly. Same idea, native to land rather than construction.
- **Performed interaction over screenshots.** Solum's version: the optimiser visibly
  sweeping mixes, comps streaming in, the verdict resolving to PURSUE. Animate the thing
  that is genuinely impressive.
- **Upload as the lead magnet.** Rudus asks for a sample plan. Solum should ask for a
  **plot sheet** — the exact artefact the OCR feature now accepts. "Send us a plot and
  we'll return the feasibility." That is the single most directly transferable idea on
  the page, and Solum is already built to deliver it.

## What not to copy

- The sage palette (brand collision, and Solum's orange is better on black).
- The `Backed by Y Combinator` chip pattern — Solum has no equivalent badge, and a fake
  or borrowed trust marker is worse than none.
- A 5-minute narrated video as the *primary* demo. Solum's buyer will not watch five
  minutes cold. A short silent loop up top, with the long video available below, fits the
  attention curve better.
