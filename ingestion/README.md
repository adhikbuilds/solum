# DLD ingestion

Pulls DLD "Real Estate Transactions" (Sales of Units) into Supabase. The DLD API
is **UAE-geofenced**, so this must run from a UAE IP.

- **For the demo:** run it **locally from your UAE Mac** — you are the UAE runner,
  no cloud region needed. Seed Supabase once; the app serves that data globally.
- **For later automation:** the exported `handler` runs in a UAE cloud runner
  (AWS me-central-1 when it recovers, a UAE proxy, or similar). Deferred — the
  demo doesn't need it.

Verified against live data on 2026-07-18 (auth flow a, daily-fresh feed, numeric
ID filters, m²→ft² math). See `../docs/prd/dld-comps-integration.md`.

## Run it locally (demo seed)

From a UAE network, with Node ≥ 20:

```bash
cd ingestion/dld-ingest
npm install

# secrets — paste YOUR values (from the DDA email + Supabase dashboard)
export DLD_CLIENT_ID='…'
export DLD_CLIENT_SECRET='…'
export DLD_APP_IDENTIFIER='…'          # x-DDA-SecurityApplicationIdentifier
export SUPABASE_URL='https://<ref>.supabase.co'
export SUPABASE_SERVICE_KEY='…'        # service_role key (server-only)

# 1 · sanity check — confirms auth + newest transaction date
npm run probe

# 2 · seed — pull recent Sales-of-Flat rows into Supabase.
#     DLD_SINCE caps the seed (data goes back to 1995). Store a bit WIDER than you
#     aggregate on (~2.5y) so the recency window is tunable later without re-seeding.
#     ~2 years of Sales+Unit+Flat is only ~8–15 MB in Supabase — nowhere near the limit.
export DLD_SINCE='2024-01-01'
npm run backfill

# later, to top up with new transactions only:
npm run incremental
```

`backfill` pulls newest-first and stops at `DLD_SINCE` (omit it to pull all
~599K rows). It paces at ~1 req/s to stay under the 60/min limit, upserts by
`transaction_id`, and keeps `dld_locations` current.

## Secrets

Never commit these — they live only in your shell (local) or the runner's env
(cloud). Rotate the DLD creds once set up (they passed through chat during design).

## Modes

| `node index.mjs <mode>` | Does |
|---|---|
| `probe` (default) | Auth + newest `instance_date`. Writes an `ingestion_runs` row. |
| `backfill` | Pull Sales+Unit newest-first → upsert; stop at `DLD_SINCE`. |
| `incremental` | Same, but only rows newer than the last run's watermark. |
