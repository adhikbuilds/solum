# Solum — how we work in this repo

This folder is where the *thinking* lives, next to the code it drives. The rule
that made the original build go well (`SOLUM_CONTEXT.md` §8) still holds: **lock
the decision before you execute it.** These docs are how we lock it in writing,
in git, so intent and code never drift apart.

The whole loop happens in this one repo — brainstorm, decide, PRD, code — so
there is nothing to copy between tools and nothing to keep in sync by hand.

## The loop

1. **Brainstorm.** Talk it through. Explore options, weigh trade-offs, argue
   both sides. Nothing is written yet.
2. **Lock it.** The decision gets written down — a one-liner goes in
   `DECISIONS.md`; anything bigger than a tweak gets a short PRD in `prd/`
   (copy `prd/TEMPLATE.md`). Commit it. This is the point of no silent changes.
3. **Build.** Implement against the PRD, render/screenshot to verify it does
   what the PRD said, then commit and push. The commit references the PRD.

Small tweaks (a colour, a label, a copy fix) skip straight to a `DECISIONS.md`
line — no PRD needed. PRDs are for features and anything that touches the model,
the layout, or a locked decision.

## What lives where

| File | What it holds |
|---|---|
| `PROJECT_CONTEXT.md` | The **strategic layer** — why Solum exists, who it's for, competitive references, the long-run vision, and the product-level decision log. Read this for the *why*. |
| `../SOLUM_CONTEXT.md` | The **build/architecture handoff** — what Solum is, locked design decisions, the token system, structural checks. Read this for the *how*. Authoritative on current build state. |
| `DECISIONS.md` | Running log of decisions, newest first. The lightweight record. |
| `prd/TEMPLATE.md` | Copy this to start a new PRD. |
| `prd/*.md` | One file per feature/change worth a spec. |

**Read order for a new session:** `PROJECT_CONTEXT.md` (why) → `SOLUM_CONTEXT.md` (how) → this file (workflow).

## Using chat / Projects alongside this

Fine for quick standalone ideation (e.g. away from the repo) or a throwaway
artifact to gut-check a concept. Treat it as a scratchpad, not the system of
record — paste the conclusion back here and it gets folded into these docs.
