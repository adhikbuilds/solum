# Dubai Healthcare City, Phase 1 — city base

Built 2026-09-09T18:00:47+00:00 from snapshot `2026-09-09` (1 page(s), 88 features fetched).

**Basis: permitted.** Every height in this base is what DDA PERMITS on the parcel, not what is standing on it. MAX_HEIGHT_FLOORS is a ceiling. A completed plot may be built well below it, and an empty plot carries a permitted height with nothing on it at all. CONSTRUCTION_STATUS is carried through per feature so the two can be told apart downstream, but it does not change the height -- it only says whether anything is there.

## Frame

- CRS: EPSG:3997 in, EPSG:3997 out (no reprojection of geometry)
- Origin: 498990 E, 2791831 N
- Units: metre · LOD: LOD1
- Vertical: flat at 0.0 m [assumption]

## Parcels

| | |
|---|---|
| kept | 88 |
| drawn as buildings | 51 (58.0%) |
| drawn as ground outlines | 37 (42.0%) |
| extending past the AOI edge | 5 |
| rejected | 0 |
| tallest | 156.8 m |
| total permitted GFA | 909,171 sqm |

## Where the heights came from

| provenance | parcels | share |
|---|---|---|
| derived | 53 | 60.2% |
| unavailable | 30 | 34.1% |
| authority | 4 | 4.5% |
| assumption | 1 | 1.1% |

## Construction status (source: DDA)

| status | parcels |
|---|---|
| Completed | 39 |
| Empty | 33 |
| Under Construction | 8 |
| Suspended | 4 |
| Pre-Construction | 4 |

## What is standing (OpenStreetMap)

| | |
|---|---|
| surveyed footprints | 471 |
| with a surveyed height (OSM) | 28 |
| dominant structures drawn at their plot ceiling | 25 |
| shape known, height not — drawn flat | 418 |
| total built footprint | 449,874 sqm |
| parcels carrying at least one building | 46 of 88 |

DDA says what may be built; OSM says what is standing. Heights are sparse in OSM, so a footprint without one is drawn at its parcel’s permitted ceiling and labelled `deferred` — a real shape at a height that is a ceiling, never a measurement.

## What the land is worth

| | |
|---|---|
| parcels priced | 51 |
| withheld, with a reason | 37 |
| hypothetical (published use is not residential) | 40 of 51 |
| RLV per sqft of land | -39.7 / 676.0 / 1344.3 (min / median / max) |

The engine prices a residential schedule. Most of this district is published as FACILITIES, so those figures answer “what would this land be worth under a residential scheme of the permitted size”, and are flagged hypothetical rather than presented as a valuation of what is there.

## The outlines

37 parcels are drawn flat. Each is a real plot with no derivable building: either DDA published no height for it, or no GFA to divide into a floor plate. They are the shape of what this source does not describe, and the honest alternative to inventing a box.

## Attribution

- Parcel data: Dubai Development Authority
- Imagery: Esri, Maxar, Earthstar Geographics
- Building footprints: © OpenStreetMap contributors, ODbL
