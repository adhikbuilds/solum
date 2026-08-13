"""
Step 1 of the market-data pipeline: scrape, extract, save to a local file, print a summary.

Deliberately does NOT write to Postgres. The point of this file is to look at
scripts/market-scrape/output/*.json yourself and decide the extraction is trustworthy before
anything downstream (bifurcate.py, then a real ingest into dld_transactions/comparable_launches)
touches the database.

Setup:
    cd scripts/market-scrape
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt

    # The key goes in the repo-root .env (already gitignored) — NOT in this file, NOT in chat:
    #   /Users/aagarwal/solum/.env
    #   FIRECRAWL_API_KEY=fc-...

Run:
    python3 scrape.py
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from firecrawl import FirecrawlApp

from schema import EXTRACTION_PROMPT, LISTING_SCHEMA

# ---------------------------------------------------------------------------
# 1. CONFIGURATION
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
if not FIRECRAWL_API_KEY:
    raise ValueError(
        f"Missing FIRECRAWL_API_KEY. Add it to {REPO_ROOT / '.env'} — see this file's docstring."
    )

app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# 2. TARGETS
#
# Fill in the real search/listing URLs for each (community, source) pair — a location search on
# Property Finder or DXB Interact's own listing pages. Left as placeholders because guessing a
# site's URL scheme (Property Finder's location IDs especially) would just produce a 404, and a
# wrong "it worked" is worse than an honest gap here.
# ---------------------------------------------------------------------------

TARGETS = [
    {
        "community": "Wadi Al Safa 3",
        "source_site": "property_finder",
        # NOT apartments-for-sale — confirmed directly on the site (screenshot, 2026-08-13) that
        # Wadi Al Safa 3 has exactly 2 live listings, a villa and a townhouse, zero apartments.
        # The apartments-only URL doesn't 404 or return empty on zero matches — it silently
        # substitutes unrelated "similar" listings from other communities, which is what broke
        # this the first time. "properties" (all types) is correct here precisely because this
        # community's real inventory isn't apartments. bifurcate.py segments per-community, so a
        # villa/townhouse market here next to an apartment market in Business Bay isn't a
        # statistical problem — it's just what this community actually has for sale.
        "url": "https://www.propertyfinder.ae/en/buy/dubai/properties-for-sale-wadi-al-safa-3.html",
    },
    {
        "community": "Business Bay",
        "source_site": "property_finder",
        # Business Bay has ~6,500 live listings; a single scrape only gets what's rendered on
        # the first page (Firecrawl doesn't paginate for us) — fine as a first-run sample, not a
        # census. Revisit with pagination once step 1's extraction quality is confirmed.
        "url": "https://www.propertyfinder.ae/en/buy/dubai/apartments-for-sale-business-bay.html",
    },
    # DXB Interact's real numbers are paywalled behind sign-in (see the screenshots this came
    # from) — left out of this first run rather than silently scraping the login wall and
    # calling it data.
]

if not TARGETS:
    print("TARGETS is empty — add the real search URLs in scrape.py, then re-run.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# 3. SCRAPE + EXTRACT, ONE TARGET AT A TIME
# ---------------------------------------------------------------------------


def run_target(target: dict) -> dict:
    """
    One `scrape` call, two formats: `markdown` (so a human/us can sanity-check what the crawler
    actually saw) and `json` (the schema-guided structured extraction).

    Not `app.extract()` — that endpoint is marked "in maintenance mode, use discouraged" in the
    installed firecrawl-py (4.35.0); `scrape(..., formats=[{"type": "json", ...}])` is the
    documented replacement and does both jobs in a single request.
    """
    url = target["url"]
    print(f"\n--- {target['source_site']} · {target['community']} ---")
    print(f"scraping {url}")

    doc = app.scrape(
        url,
        formats=[
            "markdown",
            {"type": "json", "prompt": EXTRACTION_PROMPT, "schema": LISTING_SCHEMA},
        ],
    )

    if not doc.markdown:
        print("  no content extracted — page may need JS rendering or is blocking the crawler.")
        return {**target, "listings": [], "error": "no_markdown"}

    print(f"  got {len(doc.markdown)} chars of markdown")

    extracted = doc.json if isinstance(doc.json, dict) else {}
    listings = extracted.get("listings", [])

    for listing in listings:
        listing["source_site"] = target["source_site"]
        listing["community"] = listing.get("community") or target["community"]

    print(f"  extracted {len(listings)} listing(s)")
    return {**target, "listings": listings}


def main() -> None:
    all_results = [run_target(t) for t in TARGETS]

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = OUTPUT_DIR / f"{stamp}-listings.json"
    out_path.write_text(json.dumps(all_results, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(r["listings"]) for r in all_results)
    print(f"\n==============================")
    print(f"{total} listing(s) across {len(all_results)} target(s)")
    print(f"saved to {out_path}")
    print(f"==============================")
    print("\nOpen that file and check a handful of listings by hand against the real page before")
    print("running bifurcate.py or anything that touches the database.")


if __name__ == "__main__":
    main()
