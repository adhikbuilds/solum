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

## 2026-07-18 — Simplified git signal to one word: "push it"
Collapsed the two-word git flow ("commit it" then "push it") into a single signal: **"push it"
commits the agreed change and pushes it to GitHub in one step.** The build gate and git gate
stay separate; only the git step is simplified.

## 2026-07-18 — DLD comps: validated live; demo seeds from a UAE Mac (no UAE cloud)
Probed the DLD API live from the UAE and confirmed everything (auth flow a, daily-fresh
feed, numeric-ID filters, m²→ft² math, rooms/reg_type mappings) — see the DLD PRD §4.
Architecture call given the AWS me-central-1 outage (regional conflict): the demo does NOT
need a UAE cloud runner. Frontend (Vercel) + data/read-API (Supabase, Mumbai) are global;
the DLD pull runs **locally from a UAE machine** to seed Supabase. Unattended UAE-cloud
automation (proxy or recovered region) is deferred post-demo. Ingestion is now a local-first
CLI (`node index.mjs backfill`) that keeps the Lambda export for later.

## 2026-07-18 — Real demo auth via Supabase Auth (retires the fake login)
Decided to replace the presentational login (PROJECT_CONTEXT §6.7) with real **Supabase
Auth** — one shared demo credential (pre-filled on screen for easy demoing), real JWT
session, persisted across refreshes. Gate **both** the UI and the data: RLS tightened from
`using (true)` to `authenticated`, so the Supabase API returns nothing without a session.
Stays single-file (supabase-js from CDN). Ships **with** Phase 2 frontend work — the RLS
migration must land together with the frontend auth or reads break. Spec: docs/prd/auth-demo.md.

<!-- Add new entries above this line. Newest first. -->
