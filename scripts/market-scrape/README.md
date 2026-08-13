# Market scrape

Two-step, look-before-you-write pipeline for turning listing pages (Property Finder, DXB
Interact / investmentmap.ai, ...) into the luxury/non-luxury split Al Mizan asked for
(`market_segment` on `comparable_snapshots`, documented in
`packages/db/migrations/0003_comps_method.sql`).

Neither step writes to Postgres. That's step 3, not built yet — on purpose, until the extraction
itself has been eyeballed against a real page.

## Setup

```bash
cd scripts/market-scrape
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Add the Firecrawl key to the repo-root `.env` (already gitignored — never in this directory,
never in chat, never committed):

```
/Users/aagarwal/solum/.env
```

```
FIRECRAWL_API_KEY=fc-...
```

## Step 1 — scrape + extract

Open `scrape.py`, fill in `TARGETS` with the real search/listing URLs for each
(community, source) pair you want — Wadi Al Safa 3 and Business Bay on Property Finder and DXB
Interact, to match what's already seeded. Left blank on purpose: guessing Property Finder's
location-ID URL scheme would just 404, and a wrong "it worked" is worse than an honest gap.

```bash
python3 scrape.py
```

Writes `output/<timestamp>-listings.json` and prints a count. **Read that file.** Pick a few
listings and check them against the actual page — price, size, unit type, whether `price_psf_aed`
is real or something the model invented despite being told not to.

## Step 2 — bifurcate by segment

Only once step 1 looks trustworthy:

```bash
python3 bifurcate.py output/<timestamp>-listings.json
```

Splits each community's listings into `affordable` / `mid_market` / `luxury` / `ultra_luxury` by
price-per-sqft percentile, computed within that community (a cheap Business Bay unit isn't
comparable to a cheap Wadi Al Safa 3 unit). Only the 95th-percentile cutoff (→ `luxury`) is Al
Mizan's documented heuristic; the other three boundaries in `bifurcate.py` are a reasonable
extension to cover the enum's other two tiers — adjust them freely, nothing downstream depends on
these exact numbers since `segment` has never been populated before.

Writes `output/<timestamp>-listings-segmented.json`.

## Not built yet

Landing the segmented output into `dld_transactions` / `comparable_launches` / populating
`comparable_snapshots.segment` for real. Field names in `schema.py` already mirror those columns
so that step should be a mapping, not a redesign — but it touches the database and the live
appraisal engine's comparables, so it's its own PR once steps 1–2 have been checked by hand.
