# Reference sites: Linear, Wispr Flow, Rudus

*Three sites supplied as design references for the Solum marketing site. Analysed from
screenshots (Linear, Wispr Flow) and a full-scroll screen recording (Rudus — separate
deep teardown in [`../analysis/rudus-design-teardown.md`](../analysis/rudus-design-teardown.md)).*

The useful thing about this set is that the three sites **share almost no styling**.
They are not three examples of one trend. Comparing them isolates what actually creates
the feeling of craft, independent of aesthetic.

---

## Linear

**Palette.** Near-pure black page (`#000000`–`#08090A`), no warm tint. White headline.
Mid-grey sub-copy. That is the entire page palette. Every other colour on the screen
comes from *inside* the product screenshots — the yellow "In Progress" dot, the red and
purple label chips, green `+4` / red `-4` diff counts. The page chrome itself is
strictly monochrome.

**Typography.** One family. A single geometric sans across headline, nav, body, and
buttons — **no monospace at all**. Hierarchy is created purely by size and colour, not by
switching families. The H1 is enormous (~90px), **regular weight**, tight leading, tight
letter-spacing. Sub-copy is small, grey, and quiet.

**Structure.**
- Nav: grey text links, a divider, then a white pill "Sign up" as the only bright element.
- H1 left-aligned, huge, two lines. Sub-copy beneath in two short lines.
- A small right-aligned "New · Coding Sessions →" marker on the same baseline as the
  sub-copy — using the horizontal space rather than centring everything.
- **The product UI is the hero image, and it is cropped by the bottom of the viewport.**
  Exactly the "let it peek" pattern the YC review recommended. It invites the scroll with
  no "scroll down" label.
- Product panels are given a subtle 1px light border and rounded corners so they read as
  objects against the black.
- Monochrome logo wall (Vercel, Cursor, OpenAI, Coinbase, Cash App, Ramp) — all white,
  no colour, no cards.
- Later sections use an **asymmetric two-column header**: headline left, descriptive deck
  right, on the same baseline. Not a centred stack.
- Product panels **overlap and layer** (a Slack thread card floating over a kanban board)
  to create depth without shadows or 3D.

**The lesson.** Linear's product is dark, so its screenshots sit *inside* the page rather
than glowing against it. Restraint is total: no gradient, no glow, no accent colour in
the chrome. All visual interest comes from scale of type and from real product density.

---

## Wispr Flow

The opposite of the other two, and the most useful counter-example.

**Palette.** Light **cream / butter** background (roughly `#FAFAE2`). Near-black text.
A **lilac** pill CTA (`#E9D5FF`-ish) with black label — a genuinely unexpected accent, and
notably *not* a purple gradient. Later sections **invert to near-black** with cream text.

**Typography.** A **high-contrast serif display** headline — "Don't type, just speak" — set
very large. This is the single biggest differentiator on the page. Almost no startup uses
a serif display, so it reads as designed rather than generated. Body copy is a clean sans,
centred, dark grey. So: serif for voice, sans for information.

**Two-tone headline.** "Don't type," in warm grey, "just speak" in black. Emphasis created
inside a single line by colour rather than weight.

**The signature visual — text on a path.** Transcribed speech text spirals around the hero
on a curved path, and a black ribbon of running text curves across the bottom. On the
second screen, app icons (Slack, Telegram, Signal, Teams, Snapchat) fly along a curve into
a phone mockup.

This is the important idea: **the signature visual *is* the product concept made visual.**
Wispr turns speech into text, so the site is built from text flowing along a path. It is
not decoration bolted on; it could not belong to any other company.

**The lesson.** Light mode can be more distinctive than dark, precisely because dark is now
the default for technical products. And a bespoke visual motif derived from what the
product *does* is worth more than any amount of animation.

---

## Rudus (summary — full teardown separately)

Near-black warm page `#0E0F0E`, cards *darker* than the page at `#080808`, no shadows.
Large regular-weight sans headlines, **monospace for everything else**. Sage green accent.
Ambient architectural wireframe drifting behind the hero. Product screenshots are light,
so they glow against the dark page. Simulated cursors performing interactions. Lead magnet
is "upload a sample plan and we'll run it."

---

## What the three have in common

They agree on nothing stylistically, which is why the overlap matters:

1. **One bold typographic decision, held with discipline.** Linear: single sans at enormous
   scale. Wispr: high-contrast serif. Rudus: sans headline + mono everything. Each picked
   one idea and did not blend a second.
2. **Large type at regular weight.** None of the three sets its H1 bold. Confidence comes
   from scale, not weight.
3. **A signature visual that is the product concept made visual.** Linear: the real product
   UI, dense and cropped. Wispr: text flowing along a path. Rudus: architectural drawings.
   None uses stock illustration, abstract 3D shapes, or generic gradient blobs.
4. **Severely restricted colour.** Linear's chrome is pure monochrome. Rudus uses one muted
   sage. Wispr uses one lilac. No gradients anywhere in the set.
5. **No decorative motion.** No particle fields, no scroll-following lines, no cursor
   effects. Motion, where it exists, is ambient and slow (Rudus's drift) or is the product
   demonstrating itself.
6. **Real product density on display.** All three show genuinely dense, real interfaces —
   not simplified mock dashboards with four rounded cards.

Points 3 and 6 are the ones Solum is best positioned to exploit, because the product is
genuinely dense and the subject matter (plots, envelopes, comps) is genuinely visual.

---

## Two viable directions for Solum

Solum already owns cream, `#FF6B19` orange, and graphite from the app. That gives two
honest routes, and they lead to very different sites.

### Direction A — Dark terminal (Rudus + Linear)
Near-black page, cream-and-orange product screenshots glowing against it, sans headline
with mono for data and labels, ambient plot-geometry drift behind the hero.

- **For:** orange on near-black is genuinely striking; mono reads as "numbers you can
  check"; the light app will glow the way Rudus's plan drawings do; matches the
  investor-terminal / Bloomberg feel Solum has been chasing.
- **Against:** dark is the default for technical products in 2026, so it is the *expected*
  answer. Harder to feel surprising.

### Direction B — Cream editorial (Wispr, but serious)
Solum's own cream background, a high-contrast serif display headline, orange as the single
accent, dark inverted sections for the demo, and a bespoke plot-geometry motif as the
signature visual.

- **For:** almost nobody in real estate tooling looks like this; continuous with the app's
  actual identity rather than a separate marketing skin; a serif says "considered document"
  which is precisely what a feasibility study is; the strongest defence against the
  AI-generated look, since the AI default is dark or purple.
- **Against:** harder to make product screenshots pop on light; higher execution risk —
  cream and serif done badly reads as a law firm.

**Recommendation: Direction B**, with dark inverted sections for the demo and data
moments so we still get the glow effect where it matters most. It is the braver choice,
it is more defensible against the slop critique, and it is the only one of the two that
could not have been generated by default.
