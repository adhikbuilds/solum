# PRD — <feature name>

- **Status:** Draft | Locked | Building | Shipped
- **Date:** YYYY-MM-DD
- **Owner:** <you>
- **Related decision(s):** DECISIONS.md#<anchor>, SOLUM_CONTEXT.md §<n>

## 1. Problem / why now

One or two paragraphs. What decision does the Al Mizan user need to make that
Solum doesn't help with yet, or helps with badly? Keep it about the user's job,
not the feature.

## 2. What it does (scope)

Plain description of the behaviour. If it's a new input/lever, say where it lives
(Summary, Unit Matrix, Assumptions, Plot Details) and why there. If it changes a
number, say exactly which figure and how it's derived.

## 3. Explicitly out of scope

List what this is *not*, so it doesn't creep. Cross-check against
`SOLUM_CONTEXT.md` §6 — if this touches something parked there (IRR, absorption,
API integration, real auth, JD-style bifurcation), call it out and justify.

## 4. Design decisions to lock

The specific calls, each one a line. These graduate into `DECISIONS.md` when
locked. Flag any that reverse an existing locked decision — do that deliberately,
never by accident.

- [ ] ...
- [ ] ...

## 5. Token / architecture impact

Does it need new design tokens, or does it resolve from the existing `:root`
system? Anything drawn in canvas/SVG/PDF must read through the `THEME` bridge,
not hardcode values. If it adds a colour, confirm it stays inside the accent
monochrome (verdict semantics are the only exception).

## 6. Acceptance check

How we'll know it's right — the thing to render/screenshot and eyeball, plus the
structural checks (token graph resolves, blue-swap acid test stays clean, JS
syntax, tag balance). Name the specific screen/number to look at.
