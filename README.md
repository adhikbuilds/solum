# Solum

Land feasibility for Dubai residential development. **Al Mizan is the client; Solum is the tool.**

Two scales of one question — *what may be built here, and what is the land worth to it.*

| | |
|---|---|
| **One plot** | fetch the DDA record live, inset the setbacks, fit the plate, price it |
| **The city** | all 100,215 plots DDA publishes, as vector tiles cut from Postgres |

## Run it

```bash
docker compose up --build -d       # postgres + backend + web
docker compose run --rm seeder     # fill the database from the committed seed
open http://localhost:5180
```

That is the whole fresh-clone path — no network fetch, no prerequisites.
`massing/twin/seed/downtown-dubai.json` is 1,078 plots of Downtown Dubai, Business Bay and DIFC,
committed: a verbatim, checksummed slice of the 2026-09-11 DDA snapshot, loaded through the same
loader the full city uses. Details and the JSON's shape: **[docs/seed-data.md](docs/seed-data.md)**.

The seed is one district, and a flattering one — the whole-city RLV distribution looks very
different. Read that doc before quoting a number off a seeded stack.

### The whole city

100,215 plots instead of 1,078, and it has to be fetched once. `twin/raw/` is gitignored, so
nothing on a fresh clone can shortcut this:

```bash
cd massing
python -m twin.pipeline.city fetch     # ~101 paginated requests to DDA   (~35 min, once)
python -m twin.pipeline.city massing   # the derived scheme per plot      (~20 min, 12 workers)
cd ..
docker compose run --rm loader         # load the dated snapshot, warm the overview  (~35 s)
echo 'SOLUM_AOI=dubai-all' >> .env     # point the backend at it
docker compose up -d backend
```

`fetch` writes a dated, immutable snapshot; re-running on the same day is a no-op. `massing` is
optional — without it the map draws plots and skips schemes, and the Massing toggle has nothing
to show. Both are slow once and then never again: the loader reads what they wrote in 35 seconds.

The loader is a job, not a service: it reads the dated acquisition from `massing/twin/raw/` on the
host rather than from the image, because that is ~300 MB of immutable JSON and no backend image
should carry a copy of one day's Dubai. The seeder needs no such mount — its data is in the image.

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

## What to do next

In the order a second engineer would hit them.

| | |
|---|---|
| **`feasibility.py` has no unit test** | It is the module that produces the AED figure and the only engine module the suite does not import directly. Everything downstream of it is asserted; the money itself is not. |
| **The cost basis is unsourced** | Fourteen numbers in `DEFAULT_COSTS` — construction at 345/sqft BUA, BUA factor 1.45, efficiency 0.82, 20% profit on cost — and only the podium premium documents where it came from. The repo's own `[verified]`/`[relayed]`/`[assumption]` convention is not applied to any of them. |
| **The cost model is calibrated for towers** | AED 3.5 m of fixed soft cost is 4-5% of a tower and 70-77% of a villa, so 64,884 of 70,183 priced plots come out negative. See below. Recalibrating is a modelling decision, not a bug fix. |
| **No CI** | `pytest massing/tests`, `pnpm build`, `python scripts/e2e.py` are exactly what a workflow should run on every PR, and nothing does. |
| **Secrets are literals** | `POSTGRES_PASSWORD: solum` is in `docker-compose.yml`. Fine locally, a liability on a shared host. `.env` + `env_file`. |
| **No schema versioning** | `schema.sql` is idempotent, which covers adding things and nothing else. The first column rename has no migration path. |
| **`sys.path.insert` x6** | How `service/` reaches `twin/`. Works, fragile. A `pyproject.toml` and `pip install -e .` retires all six. |
| **`massing/twin/` is misnamed** | It began as a digital twin of one district and now holds the database layer and the city pipeline. It is `massing/city/`. |

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
