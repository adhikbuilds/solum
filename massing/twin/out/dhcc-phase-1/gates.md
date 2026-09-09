# Validation gates — Dubai Healthcare City, Phase 1

Run against the district built 2026-09-09T18:00:47+00:00 from snapshot `2026-09-09`.

| | gate | status |
|---|---|---|
| ✓ | A — CRS and positioning | pass |
| ✓ | B — Building statistics | pass |
| — | C — Terrain alignment | n/a |
| — | D — LOD transitions | n/a |
| ✓ | E — Semantic selection | pass |
| — | F — Performance | n/a |
| ✓ | G — Licensing and attribution | pass |

## A — CRS and positioning · pass

- 88 parcels round-tripped to EPSG:3997; worst vertex error 0.500 mm (limit 1 mm)
- scale: baked area vs DDA AREA_SQM, median error 0.006%, max 1.11% over 88 parcels
- north: +y, local y range [-922, 249] m about the origin
- vertical: flat at 0.0 m [assumption] — no DEM sampled, so no elevation to check

## B — Building statistics · pass

- 88 parcels: 51 solid, 37 outlined
- height source: assumption 1, authority 4, derived 53, unavailable 30
- heights m: min 3.2 / median 22.4 / max 156.8
- zero or negative heights on a solid parcel: 0
- duplicate plot numbers: 0
- overlapping footprints (>1 sqm): 0
- footprints exceeding their own plot: 0

## C — Terrain alignment · n/a

- no terrain is sampled: the vertical model is flat at 0.0 m, declared as an assumption
- nothing in this base is clamped to, or seated on, a surface -- so there is no coastline, bridge or foundation alignment to inspect
- this gate becomes live the moment a DEM is introduced, and the reason it is not is recorded in config: No DEM is sampled at LOD1. This AOI spans 1.6 km of Dubai coastal plain, where terrain relief is a small fraction of one…

## D — LOD transitions · n/a

- one tier only (LOD1), no tiling and no distance-based switching, so there is no transition that could pop, hole or duplicate
- 88 parcels in a 0.40 MB payload is below the scale where tiling earns its complexity

## E — Semantic selection · pass

- 88 rendered ids resolve to a source record; 0 unresolved
- attributes still agree with the source for 88/88 parcels
- ids are DDA PLOT_NUMBERs, so the same key resolves in the study path (`GET /api/twin/appraise/<id>`) and against the DDA layer itself

## F — Performance · n/a

- payload 0.40 MB, one request, no streaming
- 88 parcels / 883 footprint vertices / ~190 draw calls (one mesh and one edge set per solid, one line set per plot)
- no hardware or browser target is set, so there is no limit to enforce -- these are the numbers such a target would be written against

## G — Licensing and attribution · pass

- dda-parcels: used and attributed — “Parcel data: Dubai Development Authority”
- esri-world-imagery: used and attributed — “Imagery: Esri, Maxar, Earthstar Geographics” [required]
- osm-buildings: used and attributed — “Building footprints: © OpenStreetMap contributors, ODbL” [required]
- DDA parcel data is a public authority layer read at 1 request per build; Esri World Imagery is fetched by the browser under Esri’s terms, which require the source named wherever the imagery is shown

4 pass, 0 fail, 3 n/a.
