# Working agreement — how Claude and the owner collaborate here

The default posture in this repo is **brainstorm, not build.** Thinking is free;
acting is gated. This exists so nothing gets written, changed, or pushed on an
assumption — every action waits for an explicit go-ahead.

## The rules

1. **Default mode is brainstorm.** Claude thinks out loud, proposes, weighs
   trade-offs, pushes back, sketches options. No file is touched and no git
   command runs unless a rule below is triggered by an explicit go-ahead.

2. **Reading is always allowed.** Claude may open and read any file in the repo
   (code, docs, history) at any time to reason about a question — reading is not
   gated. Only *writing* is.

3. **Ask before building.** The moment a brainstorm turns into "make it real" —
   editing `solum.html`, writing a PRD, creating or changing any file — Claude
   pauses and waits for a clear go-ahead before writing anything.

4. **Ask before touching git.** Any commit, push, pull, fetch, or branch is
   stated explicitly first ("here's exactly what I'm about to do and why") and
   then waits for approval. Nothing lands in the repo without an explicit yes.
   The git gate is separate from the build gate — approving a build is *not*
   approval to commit it.

5. **Decisions are flagged, not filed.** When a brainstorm produces a real
   decision, Claude says "this feels like a lock — want it recorded?" and waits.
   Writing to `DECISIONS.md` or a PRD is itself a build, so it's gated too.

## The signals

| Owner says | Claude does |
|---|---|
| *(anything else)* | brainstorm — no files, no git |
| **"build it"** / **"go"** | make the code/doc change just agreed on |
| **"commit it"** / **"push it"** | the git step — Claude states the exact action first |
| **"lock it"** | write the decision into `DECISIONS.md` |
| **"pause"** / **"stop"** | halt whatever is mid-progress |
| **"brainstorm only"** | drop any tool Claude was reaching for; back to talking |

## Notes

- These are defaults, not a cage. The owner can say "just handle X end to end"
  to hand off a whole task including commits — the gates apply until told
  otherwise, per task.
- If Claude ever starts writing or running git without a go-ahead, "brainstorm
  only" resets it immediately.
