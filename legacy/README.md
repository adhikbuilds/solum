# legacy/

Superseded, not deleted. Nothing in `apps/` or `packages/` imports any of it.

| | |
|---|---|
| `solum.html` | The 233 KB single-file prototype. **Still live** — `vercel.json` rewrites `/` to it. |
| `district-viewer.html` | The standalone single-plot three.js viewer, before `apps/web` existed. |
| `supabase/` | Seven migrations: DLD comps, market insights, area aliases, RLS. |
| `ingestion/` | The DLD comps ingestion pipeline that fed those tables. |
| `site/`, `market-inspirations/` | Marketing site and the references it was built from. |
| `SOLUM_CONTEXT.md` | The original brief, before the PRDs in `docs/prd/`. |

`api/plot.js` is *not* here: it stays at the repo root because Vercel only runs serverless
functions from `/api`, and `solum.html` calls it.

An earlier TypeScript implementation of the whole product — Next.js on :3100, a TS appraisal
engine, and `packages/db` with auth, tenancy and RLS migrations — is on the branch
`archive/ts-platform`. It shares no git history with this tree; the two were developed in
parallel and this one is the product. The auth and RLS work there has no equivalent here yet.
