# Locked components

*Component decisions that are settled. Do not redesign these without a deliberate
call to reopen them. Add to this file only when something is genuinely locked.*

---

## 1. Top bar (locked 2026-08-01)

**Reference:** [sphinxhq.com](https://sphinxhq.com/)

The nav has two states and transitions between them on scroll.

- **At the top of the page:** transparent. No container, no border, no shadow. The nav
  items and the CTA sit directly on the page background.
- **Once scrolled:** the nav collapses into a **floating capsule**. A fully rounded
  white pill, narrower than the page width, with a soft shadow, floating over the
  content beneath it rather than sitting in a full width band.

Why it is worth taking: the capsule reads as an object rather than a browser chrome
band, it works over both light and dark sections without needing a second colour
scheme, and the transition gives the page a sense of state without any scroll jacking.
It is a class toggle on a scroll position, nothing more.

Solum's adaptation: same two states, Solum's own cream and orange rather than Sphinx's
black and cyan.

---

## 2. Book a demo CTA (locked 2026-08-01)

**Reference:** [sphinxhq.com](https://sphinxhq.com/)

Two variants of the same idea, and both are locked.

**Nav variant.** Compact solid pill, no arrow. Sits at the right end of the bar.

**Section CTA variant.** The one that matters:
- Fully rounded pill, light fill, dark label
- Label in **monospace, uppercase, letterspaced**
- A **filled circle at the right end of the pill containing an arrow** pointing up and
  to the right, inset so the circle nearly touches the pill edge
- The circle carries the accent colour, so the button has one bright point rather than
  being a solid block of colour

Why it is worth taking: it reads as considered rather than as a default framework
button, the arrow gives direction without a word, and the mono label ties the CTA to
the data vocabulary used everywhere else on the page. It also avoids the orange fill
plus white bold label pairing that reads as a generic SaaS default.

Solum's adaptation: cream pill, ink label, **orange circle with a white arrow**.
