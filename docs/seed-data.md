# Seed data: a city in a file

A fresh clone has an empty Postgres and no way to fill it. `solum_city/raw/` — the dated ArcGIS
acquisition the loader reads — is 206 MB and gitignored, for the same reason nobody commits a
database dump: it is derived, it is large, and it is dated. So `python -m solum_city.db.load` on a new
machine correctly says *no snapshot on disk*, and the only path forward is a twenty-minute fetch
against a public authority layer followed by a twenty-minute massing bake.

That is a reasonable thing to ask of someone rebuilding the city. It is an unreasonable thing to
ask of someone who wants to see whether the stack runs.

So one district is committed instead.

```
docker compose up --build -d
docker compose run --rm seeder      # a few seconds, no network
open http://localhost:5180
```

---

## What the seed is

`packages/city/solum_city/seed/downtown-dubai.json` — **1,078 plots, 1.9 MB**, a 6 km × 6 km window of the
DDA parcel layer centred on the Burj Khalifa district. It covers Downtown Dubai, Business Bay and
DIFC: the exact area the reference products (DXB Interact, investmentmap.ai) show, and the area
with the richest published height data in the city — 699 of the 1,078 plots carry a
`MAX_HEIGHT_FLOORS` value, so the seeded map shows real massing rather than a field of outlines.

It is a **verbatim slice** of a dated snapshot. Nothing is synthesised, rounded, or filled in:

| | |
|---|---|
| Source | `gis.dda.gov.ae/.../BASIC_LAND_BASE/MapServer/2` |
| Acquired | 2026-09-11, as part of the 100,215-plot `dubai-all` snapshot |
| CRS | EPSG:3997 (Dubai Local TM, metres) — as delivered, not reprojected |
| Attributes | the authority's own field names and values, unedited |
| Provenance | `authority` |

The rule the rest of the codebase follows — *reproject for display only* — is why the seed stores
3997 rings. The 4326 geometry the map draws is derived at load time, in the same place and by the
same code as it is for the full city.

## Shape of the file

```jsonc
{
  "seed": {
    "id": "downtown-dubai",
    "title": "Downtown Dubai and Business Bay",
    "feature_count": 1078,
    "window_3997": { "centre": [494643, 2787278], "half_extent_m": 3000 },
    "envelope_3997": [491693.651, 2785493.851, 497777.402, 2790389.096],
    "sha256": "8888647b992b94f5f1679ae4221bb49214d500ebeb0c6177455d8e4d47655b69",
    "provenance": "authority",
    "extracted_from": {
      "source_id": "dda-parcels",
      "layer": "https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2/query",
      "crs": 3997,
      "fetched_on": "2026-09-11",
      "aoi": "dubai-all",
      "snapshot_feature_count": 100215
    },
    "out_fields": ["OBJECTID", "PLOT_NUMBER", "...18 fields"],
    "regenerate": "python -m solum_city.db.seed --extract"
  },
  "features": [ /* 1,078 ArcGIS features, exactly as the layer returned them */ ]
}
```

One feature, rings truncated:

```jsonc
{
  "attributes": {
    "OBJECTID": 254908,
    "PLOT_NUMBER": "3372254",
    "LAND_NAME": "337-457",
    "PROJECT_NAME": "DUBAI INTERNATIONAL FINANCIAL CENTER",
    "ENTITY_NAME": "DUBAI INTERNATIONAL FINANCIAL CENTER",
    "AREA_SQM": 15872.83,
    "AREA_SQFT": 170853.72,
    "GFA_SQM": 145645.48,
    "GFA_SQFT": 1567714.9,
    "MAX_HEIGHT_FLOORS": "G+55",
    "MAX_HEIGHT_METERS": 200,
    "HEIGHT_CATEGORY": "51 - 60",
    "MAX_PLOT_COVERAGE": 0,
    "CONSTRUCTION_STATUS": "Completed",
    "MAIN_LANDUSE": "COMMERCIAL - FACILITIES - RECREATIONAL",
    "SUB_LANDUSE": "CHILDREN NURSERY - CLINIC - OFFICES - RETAIL - SPORTS FACILITY",
    "LANDUSE_DETAILS": "COMMERCIAL (OFFICES,RETAIL), FACILITIES (CHILDREN NURSERY,CLINIC), ...",
    "LANDUSE_CATEGORY": "COMMERCIAL"
  },
  "geometry": {
    "rings": [[[494634.9348, 2789444.7761], [494574.5052, 2789476.9869], "..."]]
  }
}
```

`sha256` is over the `features` array serialised compactly with sorted keys. `solum_city.db.seed`
verifies it before loading and refuses a seed that does not match — a snapshot slice that has been
hand-edited is no longer a snapshot slice, and silently loading one would put invented numbers in
a database whose whole contract is that its numbers are traceable.

Features are ordered by `OBJECTID`, so re-cutting the same snapshot produces a byte-identical
file. Page order is the server's, and the server does not promise one.

## Seeding a fresh table

**In Docker** — nothing else required:

```bash
docker compose up --build -d
docker compose run --rm seeder
```

**On the host**, against the published port:

```bash
pip install -r massing/requirements.txt
cd massing
python -m solum_city.db.seed --warm
```

Either way the sequence is:

1. `schema.sql` is applied (idempotent — the backend applies it at startup too, so an
   already-running stack needs no ordering).
2. The seed's checksum is verified.
3. Massing is baked **in-process**. The file pipeline spends twenty minutes on 100k plots across a
   process pool; 1,078 plots is a few seconds, so the seed carries no derived geometry and the
   plates are computed fresh at load time.
4. Rows land through **the real loader** — `solum_city.db.load.load()`, with the seed passed as a
   `snapshot` override. The height chain, the placeholder cleaning, the RLV, the dual 4326/3997
   geometry and the per-snapshot idempotency are not reimplemented here. A second loader that
   drifts from the first is worse than no seed at all.
5. `--warm` cuts the z8–12 overview tiles (~51 tiles).

The seeded AOI is **`downtown-dubai`**, deliberately distinct from `dubai-all`, so seeding never
collides with or overwrites a real city load. One database can hold both.

### Pointing the backend at it

The backend serves one AOI, from `SOLUM_AOI`. Compose defaults it to `downtown-dubai` so the seed
path works with no configuration. After a full city load, override it:

```bash
echo 'SOLUM_AOI=dubai-all' >> .env
docker compose up -d backend
```

Get this wrong and the API says so by name rather than just reporting an empty city:

> no snapshot loaded for `dubai-all`, but the database holds `downtown-dubai`. Point the backend
> at it with SOLUM_AOI, e.g. `SOLUM_AOI=downtown-dubai docker compose up -d backend`.

## Regenerating it

Needs `solum_city/raw/` — a developer re-cutting the seed has the full snapshot; everyone else just
loads the committed result.

```bash
cd massing
python -m solum_city.db.seed --extract                      # from the newest dubai-all snapshot
python -m solum_city.db.seed --extract --source-aoi dhcc-phase-1
```

The window is defined in `twin/db/seed.py` as `WINDOW_CENTRE` / `WINDOW_HALF_M`. The centre is the
mean first-vertex of the 53 parcels the layer itself labels `BURJ KHALIFA DISTRICT` — anchored to
the data rather than to a coordinate typed off a map. Changing either invalidates the checksum,
which is the point: `--extract` rewrites it, hand-editing does not.

## What the seed changes about the numbers

Worth stating plainly, because it flatters the model. Across the full city the RLV median is
**−623 per sqft of land** and 64,884 of 70,183 priced plots come out negative — the calibration
finding in `docs/prd/city-platform.md`, driven by AED 3.5 m of fixed soft cost landing on small
villa plots. Across the Downtown seed the median is **+873** and only 152 of 1,078 plots are
negative, because Downtown is towers and DIFC, where that same fixed cost is 4–5% of the scheme
rather than 70–77%.

So a stack seeded with this file looks like a working appraisal engine. A stack loaded with the
whole city looks like an engine calibrated for towers and applied to villas. Both are true; the
second is the one that needs a decision. Do not read the seed's distribution as evidence the cost
model is settled.

## What the seed is not

- **Not the city.** 1,078 of 100,215 plots. Search, the district statistics and the value
  distribution are all computed over what is loaded, so they describe Downtown, not Dubai.
- **Not a fixture for the appraisal tests.** Those run against
  `packages/engine/fixtures/parcel-3156315.json`, a single verified parcel, and stay offline and fast.
  This is display data.
- **Not a representative sample.** See above — it is the densest, tallest 1% of the city.
- **Not a substitute for a fetch when the numbers matter.** It is pinned to 2026-09-11. Plot
  boundaries, heights and construction status change. `python -m solum_city.pipeline.city fetch` is
  still how you get today's city.
