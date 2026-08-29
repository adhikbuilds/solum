# Onboarding a second person onto this repo

**Written 2026-08-29**, for exactly one situation: someone new is joining to work on a piece of
this independently (scraping, market data, whatever the current split is) and needs to get
oriented fast without stepping on the parts already in flight.

## Start here, in order

1. **`KNOWLEDGE-BASE.md`** — the index. What Solum is, where the code actually lives (there are
   two worktrees of one repo, not two repos — read its §1 carefully, it's not obvious from the
   GitHub UI), and the roadmap reasoning.
2. **`architecture.md`** — the *how*: the pure-engine/impure-shell split (`packages/engine` has no
   I/O, ever), why that's the one rule not to break.
3. If the work touches DDA entitlement/massing specifically: switch to `feat/massing-engine` and
   read `docs/prd/massing.md` on that branch (different `docs/` tree — see below).

## Two different `docs/` trees — don't be confused by this

`main` and `feat/massing-engine` are branches of the **same repo** but grew separate `docs/`
folders during a period where they were effectively two different projects (a pnpm-monorepo
rebuild, and a prototype-plus-new-massing-service). `main`'s docs are `KNOWLEDGE-BASE.md`,
`architecture.md`, `domain-model.md`, etc. `feat/massing-engine`'s are `PROJECT_CONTEXT.md`,
`WORKING_AGREEMENT.md`, `DECISIONS.md`, `prd/*.md` — a completely different set, for a completely
different codebase (`solum.html`, `massing/`, `web/`). If a doc you're looking for "doesn't
exist," you're probably on the wrong branch, not looking at a gap.

They have **no shared git history** (`git merge-base main feat/massing-engine` errors — confirmed
2026-08-29) — this was deliberately *not* merged for that reason. `main`'s Rail nav has a "Massing
study" and "Classic (legacy)" link that route out to the other codebase rather than embedding it.

## The "will my work drift from the base code" worry

It won't, if this stays a normal git branch instead of a zip. A zip is a snapshot with no common
ancestor to diff against — reconciling two zips later is a blind, manual merge. A branch off the
current tip has a real merge-base, so reconciling later (or having Claude Code do it) is an
ordinary `git merge`/`git rebase`, the same operation used twice already today to bring
independent work back into `main` cleanly. Concretely:

```
git clone https://github.com/adhikbuilds/solum.git
cd solum
git checkout -b <your-branch> main      # or feat/massing-engine, whichever you're building on
# do the work, commit as you go
git push -u origin <your-branch>        # open a PR, or hand it back for a merge
```

No zip needed at any point. If the base branch moves while you're working, `git fetch origin &&
git rebase origin/main` (or a merge, if history matters more than a linear log) resolves it —
don't recreate the branch from a fresh zip to "catch up."

## On plan0.ai, since it came up

Different pipeline stage, not a direct competitor to what's being built here. Plan0 takes an
**architect's PDF drawings** and outputs a construction cost estimate/value-engineering
report — it needs computer vision because its input is a scanned drawing. Solum's massing engine
answers a question a stage earlier, before any drawing exists: *given a plot's DDA-published
entitlement (permitted GFA, height, setbacks, parking rule — all structured API data, not a
drawing), what can legally be built, and what's it worth?* No CV, because there's nothing to parse
a drawing out of — see `feat/massing-engine`'s `massing/solum_massing/dda.py` docstring for the
argument in full, and `docs/prd/massing.md` §1 on that branch for how it relates to `solum.html`.
