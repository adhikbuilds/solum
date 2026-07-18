# Decisions log

Newest first. One entry per decision. This is the lightweight record — the
canonical, fully-reasoned set of foundational decisions still lives in
`../SOLUM_CONTEXT.md` §3 (the original 19). Entries here extend that history.

Format: date · one-line decision · why (if not obvious) · link to PRD/commit if any.

---

## 2026-07-18 — Astryx question resolved: Path B
Dropped the Astryx design-system association and collapsed the token block to a
single vocabulary (retired the `--pine*` / `--brass-deep` / `--surface2` /
`--sans` / `--mono` / `--fs-xs..kpi` / `--r-*` legacy aliases, 172 usages
rewritten 1:1 to canonical tokens). Behaviour-preserving, no visual change.
See `../SOLUM_CONTEXT.md` §7.

## 2026-07-18 — Product-thinking lives in the repo
Adopted a docs-in-repo workflow (`docs/`) for the brainstorm → decide → PRD →
code loop, rather than splitting thinking into chat/Projects and code into the
repo. Keeps intent and code in one history, no re-transporting. See
`README.md`.

## 2026-07-18 — Strategic context captured in the repo
Added `docs/PROJECT_CONTEXT.md` — the why/vision/competitive-landscape/strategic decision
log (Bloomberg-terminal-for-real-estate thesis, Aprao / JD Console / BCG references, product
identity, roadmap). Kept as a separate doc from `SOLUM_CONTEXT.md` because they sit at
different altitudes (product/strategy vs. build/architecture); cross-linked both ways.
Reconciled the pre-existing Astryx framing in that doc against the Path B decision via inline
`Update (2026-07-18)` annotations rather than rewriting its history. `SOLUM_CONTEXT.md` is
authoritative where the two docs differ on current build state.

## 2026-07-18 — Collaboration protocol: brainstorm by default, gate all writes
Established a working agreement (`docs/WORKING_AGREEMENT.md`): default mode is brainstorm;
reading is always allowed; Claude asks before building (any file write) and separately before
touching git (commit/push/pull). Decisions are flagged, not filed, until "lock it". Signal
words defined ("build it", "commit it", "lock it", "brainstorm only", etc.).

<!-- Add new entries above this line. Newest first. -->
