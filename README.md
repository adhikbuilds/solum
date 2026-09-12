# Solum

Land feasibility for Dubai residential development. **Al Mizan is the client; Solum is the tool.**

Two scales of one question — *what may be built here, and what is the land worth to it.*

| | |
|---|---|
| **One plot** | fetch the DDA record live, inset the setbacks, fit the plate, price it |
| **The city** | all 100,215 plots DDA publishes, as vector tiles cut from Postgres |

## Run it

```bash
docker compose up --build          # postgres + backend + web
docker compose run --rm loader     # load the dated snapshot, warm the overview  (~35 s)
open http://localhost:5180
```

The loader is a job, not a service: it reads the dated acquisition from `massing/twin/raw/` on the
host rather than from the image, because that is ~300 MB of immutable JSON and no backend image
should carry a copy of one day's Dubai.

## The shape

```
                     ┌──────────────────────────────────────────────┐
  browser ──:5180──▶ │ web        nginx + React (Vite)              │
                     │            /api/* proxied, so one origin     │
                     └───────────────────────┬──────────────────────┘
                                             │
                     ┌───────────────────────▼──────────────────────┐
                     │ backend    FastAPI                           │
                     │   /api/plot/{n}         live DDA → study     │
                     │   /api/city/tiles/…     MVT from PostGIS     │
                     │   /api/city/search      plot or area         │
                     │   /api/city/appraise/…  live DDA → study     │
                     └───────────────────────┬──────────────────────┘
                                             │
                     ┌───────────────────────▼──────────────────────┐
                     │ postgres   PostGIS 3.5                       │
                     │   plots     geom_4326 · geom_3997 · geom_lo  │
                     │   massing   derived podium/tower volumes     │
                     │   tile_cache  gzipped MVT, keyed by snapshot │
                     └──────────────────────────────────────────────┘
```

### Two geometries, and it is not redundancy

`geom_4326` is what tiles are cut from, because tiles are Web Mercator and nothing else.
`geom_3997` is Dubai Local Transverse Mercator — plain metres — and it is what every setback,
plate and residual land value is computed in. A 10 m setback has to be 10 m. The reprojection
happens once, offline, on the way *into* the tiles, and nothing reads it back.

### Tiles are cut on request, not baked

Measured over all 100,215 plots (arm64 PostGIS 3.5 / PG 16, densest tile at each zoom):

| | z16 | z14 | z12 | z10 |
|---|---|---|---|---|
| cold | 268 ms | 438 ms | — | 528 ms |
| **cached** | **1.5 ms** | **2.8 ms** | 7.6 ms | 12.3 ms |
| on the wire | 40 KB | 225 KB | 281 KB | 1.25 MB |

Tiles are stored **gzipped** in Postgres. A vector tile compresses to 28–36%, but compressing
costs more than reading the uncompressed blob — so it happens once, at cache-fill, and is served
under `Content-Encoding: gzip`. The overview (z8–12) is 51 tiles and is warmed in 2.3 s; z13–16 is
2,122 tiles built on first ask.

**This is also why there is no Redis.** A cached lookup is 1.4–1.8 ms; Redis would save about
1.5 ms on a request whose round-trip is longer than the saving, and it would not touch the one
slow tile, which is payload-bound.

## What the map will not do

- **Invent a height.** 13,973 plots have none published. They carry no `height_m` at all — not a
  zero, not a null — and render as outlines. 13,973 invented buildings is a convincing lie.
- **Fill a jurisdiction gap.** DDA governs 44.8% of Dubai's registered projects. Trakhees,
  Municipality, Dubai South and DSO govern the rest, and their areas are drawn as nothing.
- **Present a figure without its premise.** Value carries `priced` / `hypothetical` / `withheld`,
  and `fixed_cost_share` — see below.

## Known: the cost model is calibrated for towers

The first whole-city run found that **64,884 of 70,183 priced plots are negative**, median
−623/sqft. The cause is not the arithmetic: `appraise()` carries **AED 3.5 m of fixed soft cost**,
which is 4–5% of a tower scheme and **70–77% of a villa scheme**, and Dubai is mostly villas.

```
G+1+R villa   GFA   1,484   RLV/sqft  -1,567   fixed = 77.2% of non-land cost
G+2   villa   GFA   2,326   RLV/sqft  -1,387   fixed = 69.7%
G+6   apts    GFA  91,300   RLV/sqft   +313    fixed =  4.8%
G+14  tower   GFA 103,183   RLV/sqft   +685    fixed =  4.2%
```

The numbers have **not** been changed — recalibrating the cost basis is a modelling decision, not
a bug fix. Instead `fixed_cost_share` travels with every row and the UI says so in words.

## Layout

```
massing/            the engine and the backend
  solum_massing/    pure: DDA record → envelope → candidates → money.  No I/O but dda.py
  service/          FastAPI: the study, and the city surface
  twin/             the city base
    db/             schema, loader, MVT cutter
    pipeline/       fetch → geojson → massing → tiles
    web/            the single-district three.js viewer (separate tool, still useful)
web/                React + Vite + nginx
docs/prd/           what each piece is for, and what would make it wrong
```

## Conventions

Every claim in this repo is tagged `[verified]`, `[relayed]` or `[assumption]`, because five
confident claims have already failed on checking. A `[relayed]` regulatory figure never reaches a
calculation. Start at `docs/KNOWLEDGE-BASE.md`.
