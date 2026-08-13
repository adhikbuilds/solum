"""
Extraction schema for a listings page (Property Finder, DXB Interact / investmentmap.ai, ...).

Field names deliberately mirror the Postgres columns they will eventually land in
(packages/db/migrations/0001_core.sql: dld_transactions, comparable_launches) so that turning
`listings_extracted.json` into a real ingest is a rename, not a redesign:

  unit_type, area_sqft, price_fils         -> dld_transactions
  project_name, developer, price_psf_fils,
    pct_sold, completion                   -> comparable_launches

`segment` is deliberately NOT part of this schema. It is Al Mizan's v1 heuristic (top 5% of a
community's listings by price/sqft = luxury) — a computed property of the whole sample, not
something to ask an LLM to guess per-listing. It gets filled in by `bifurcate.py` after scraping,
against the existing `market_segment` enum ('affordable' | 'mid_market' | 'luxury' | 'ultra_luxury').
"""

LISTING_SCHEMA = {
    "type": "object",
    "properties": {
        "listings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "developer": {"type": "string"},
                    "community": {"type": "string"},
                    "sub_community": {"type": "string"},
                    "unit_type": {
                        "type": "string",
                        "description": "e.g. Studio, 1BR, 2BR, 3BR, 4BR — normalise to bedroom count where the page shows a plain number.",
                    },
                    "bedrooms": {"type": "number"},
                    "size_sqft": {"type": "number"},
                    "price_aed": {"type": "number"},
                    "price_psf_aed": {
                        "type": "number",
                        "description": "Take the page's own per-sqft figure if shown; otherwise leave null — do not silently compute it from price/size, a mis-parsed size would then corrupt this too.",
                    },
                    "is_off_plan": {"type": "boolean"},
                    "pct_sold": {
                        "type": "number",
                        "description": "For a project/launch card, not an individual resale unit. 0-100.",
                    },
                    "completion_date": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": ["available", "sold", "rented", "unknown"],
                    },
                    "listing_url": {"type": "string"},
                },
            },
        }
    },
}

# The prompt is the other half of the schema — it tells the model what "correct" means for
# fields a bare JSON Schema can't constrain (units, which figure is authoritative, what to do
# when the page doesn't say).
EXTRACTION_PROMPT = """
Extract every individual unit listing or project card on this page.

Rules:
- Only extract what is actually printed on the page. Do not infer a value that is not shown.
- price_aed is the AED total price (or asking price) for that specific unit/listing, not a
  project's starting-from price band unless that is genuinely all the page shows.
- size_sqft is built-up area / BUA in sqft. If the page shows sq.m, convert to sqft
  (1 sq.m = 10.7639 sqft) and note that you did in listing_url's neighbouring text is not needed —
  just do the conversion silently and correctly.
- unit_type: use the page's own label (Studio / 1BR / 2 Bedroom / etc). Do not normalise beyond
  what is printed.
- If a field is not present for a given listing, OMIT THE KEY ENTIRELY. Do not write 0, "Unknown",
  "N/A", or any other placeholder — an omitted key and a real 0 must stay distinguishable.
- Leave price_psf_aed out entirely if the page does not show a per-sqft figure directly — do not
  write 0 for it.
- bedrooms must agree with unit_type for the same listing (e.g. unit_type "2 Bedroom" implies
  bedrooms 2). If the page's own labels disagree with each other, prefer unit_type's exact wording
  and set bedrooms to match it rather than a separately-guessed number.
"""
