"""
Step 2: turn a reviewed scrape output into the 4-tier market_segment split.

Deliberately separate from scrape.py — segmentation is a property of the whole sample (a
percentile), not something the extraction step should compute per-listing, and Al Mizan's
documented heuristic (packages/db/migrations/0003_comps_method.sql) is only "top 5% by price =
luxury". This file makes that call, and only that call — it still does not write to Postgres.

Run after scrape.py, pointing at the file it printed:
    python3 bifurcate.py output/<timestamp>-listings.json

Percentile cutoffs below the documented 95th (luxury) are my own extension, not Al Mizan's — they
exist so mid_market/affordable/ultra_luxury aren't left undefined. Adjust freely; nothing else in
the codebase depends on these exact numbers yet, since `segment` has never been populated before.
"""

import json
import sys
from pathlib import Path
from statistics import median
from typing import Optional

CUTOFFS = {
    # percentile (within a community's own listings) : segment
    0.40: "affordable",
    0.95: "mid_market",
    0.99: "luxury",
    1.01: "ultra_luxury",  # anything above the 0.99 boundary
}


def price_psf(listing: dict) -> Optional[float]:
    """Prefer the page's own psf figure; only derive it if both size and price are present."""
    if listing.get("price_psf_aed"):
        return listing["price_psf_aed"]
    price, size = listing.get("price_aed"), listing.get("size_sqft")
    if price and size:
        return price / size
    return None


def segment_for_percentile(pct: float) -> str:
    for boundary, segment in CUTOFFS.items():
        if pct <= boundary:
            return segment
    return "ultra_luxury"


def bifurcate(listings: list[dict]) -> list[dict]:
    """Percentile is computed within each community — a cheap Business Bay unit and a cheap Wadi
    Al Safa 3 unit aren't comparable to each other, only to their own community's distribution."""
    by_community: dict[str, list[dict]] = {}
    for listing in listings:
        psf = price_psf(listing)
        if psf is None:
            continue
        by_community.setdefault(listing.get("community", "unknown"), []).append({**listing, "_psf": psf})

    result = []
    for community, group in by_community.items():
        ordered = sorted(group, key=lambda l: l["_psf"])
        n = len(ordered)
        for i, listing in enumerate(ordered):
            pct = (i + 1) / n
            listing["segment"] = segment_for_percentile(pct)
            del listing["_psf"]
            result.append(listing)
        med = median(l["_psf"] if "_psf" in l else price_psf(l) for l in group)
        print(f"{community}: n={n}, median psf={med:.0f} AED")
        for segment in ("affordable", "mid_market", "luxury", "ultra_luxury"):
            count = sum(1 for l in result if l["community"] == community and l["segment"] == segment)
            if count:
                print(f"  {segment:12s} {count:3d}  ({count/n*100:.0f}%)")

    skipped = len(listings) - len(result)
    if skipped:
        print(f"\n{skipped} listing(s) skipped — no price_psf_aed and no (price_aed, size_sqft) pair.")
    return result


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python3 bifurcate.py output/<timestamp>-listings.json")
        sys.exit(1)

    path = Path(sys.argv[1])
    targets = json.loads(path.read_text(encoding="utf-8"))
    all_listings = [l for t in targets for l in t["listings"]]

    segmented = bifurcate(all_listings)

    out_path = path.with_name(path.stem + "-segmented.json")
    out_path.write_text(json.dumps(segmented, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main()
