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

<!-- Add new entries above this line. Newest first. -->
