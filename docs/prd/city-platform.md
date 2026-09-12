# PRD — City map as a service: PostGIS, one backend, one frontend

- **Status:** Shipped 2026-09-12 — `docker compose up --build` verified green
- **Date:** 2026-09-12
- **Owner:** adhik
- **Related:** `docs/prd/city-map.md` (the map itself), `massing/twin/README.md`

## 1. Problem / why now

The city map works and is not a system. It is a hand-written HTML page served by a second FastAPI
app on a second port, reading three generated files that live outside git:

```
massing/twin/out/dubai-all/plots.pmtiles      33 MB   the map
                          /plots-index.json  3.2 MB   read whole into process memory for search
                          /plots.geojsonl     58 MB   the thing both were cut from
```

Three consequences, and none of them are style:

1. **It cannot be containerised.** `massing/Dockerfile` does not `COPY twin/` at all. The city map
   has never been in an image.
2. **There are two frontends and two backends.** `web/` is React + Vite + nginx with a design
   system, an API client and a Dockerfile; the city map is hand-written JS on `:8081` with its own
   `/api/twin/*` surface. The study panel re-implements `fetch` rather than using `api/client.ts`.
3. **Nothing is queryable.** "Which plots in Al Barsha are priced above 900/sqft and still empty?"
   is the question the tool exists to answer, and today it is a grep over a 58 MB JSONL file.

## 2. What it does (scope)

One Postgres, one backend, one frontend, all containerised.

- **PostGIS is the source of truth.** Plots and derived massing land in tables. The files become
  an import format, not a store.
- **Tiles are served live from Postgres** via `ST_AsMVT`, through a tile cache table.
- **The city map becomes a React route** in the existing `web/` app, on the existing design system,
  through the existing API client.
- **`docker compose up`** brings up `postgres` + `backend` + `web`, and that is the whole stack.

## 3. The measurement that decided the architecture

Live `ST_AsMVT` vs baked PMTiles is not answerable from taste. Measured 2026-09-12 on
arm64 PostGIS 3.5 / PG 16, all 100,215 plots loaded, GiST index on `ST_Transform(geom,3857)`,
best of 5 on the **densest** tile at each zoom:

| zoom | best | tile size | verdict |
|---|---|---|---|
| z16 | **6.1 ms** | 73 KB | live, trivially |
| z14 | 27.8–49.3 ms | 295–465 KB | live |
| z12 | 87.3 ms | 908 KB | live, warm it |
| z10 | **511.4 ms** | 4.0 MB | too slow **and** too big |

Generalising the geometry for the overview (`ST_SimplifyPreserveTopology` at 30 m, a third of a
pixel at z10) helps and does not rescue it: z10 goes 511 → 304 ms, 4.0 → 3.4 MB. It cannot, because
the cost at the overview is **88,000 features in one tile**, not vertex count — and dropping
features is the one thing this map will not do.

So the answer is neither branch of the original fork:

**Live MVT from Postgres, through a cache table, with the overview pre-warmed.**

Occupied tiles per zoom, measured on the same data:

| z8 | z9 | z10 | z11 | z12 | z13 | z14 | z15 | z16 |
|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 6 | 12 | 29 | 77 | 199 | 520 | 1,326 |

z8–12 is **51 tiles total** — the entire overview costs about ten seconds to compute once and is
then a primary-key lookup. z13–16 is 2,122 tiles at 6–50 ms each, computed on demand and cached on
first ask. Postgres is genuinely the store; there is no bake step between the data and the map.

## 4. Design decisions to lock

- [ ] **Two geometry columns per plot, and the reason is the invariant.** `geom_4326` is what tiles
      are cut from. `geom_3997` is what setbacks, plates and RLV are computed in. The metric
      geometry stays queryable or the appraisal can never move out of the raw snapshot, and
      `basemap.py`'s rule — reproject for display only — stops being enforceable.
- [ ] **`geom_lo`**, generalised at 30 m, for z ≤ 12 only. Below a third of a pixel it cannot
      change what the overview looks like; above z12 the full geometry is used.
- [ ] **The tile cache is a table, not a file or a CDN.** Keyed `(layer, z, x, y)`, invalidated by
      snapshot date. A dated snapshot changes only when a load runs, which is exactly when the
      cache should be dropped.
- [ ] **One backend.** `twin/web/serve.py`'s routes move into `service/main.py`. Two FastAPI apps
      over the same pure modules was a staging decision, not a design.
- [x] **`plots-index.json` is deleted, not ported.** It existed because a file cannot be queried.
      `WHERE plot_number = %s` is the whole feature, and it drops 3.2 MB from process memory.
      Done: the file is gone and `pipeline/city.py` no longer writes it.
- [x] **`plots.pmtiles` is superseded, not deleted.** Live MVT is how the stack serves the map,
      but a PMTiles archive is the one artefact that needs no server at all -- a single file to
      hand someone, open in a desktop GIS, or host on static storage. `pipeline.city tiles` stays
      and says so.
- [x] **The pre-Postgres city viewer is deleted.** `twin/web/static/city.{html,js,css}` and the
      `locate` endpoint that fed them are gone. Two implementations of one screen, one reading
      files the other made optional, is precisely the drift this restructure existed to end.
      `viewer.html` stays: it is the district, which is a different tool.
- [ ] **The frontend is `web/`.** The city map becomes a React component on the existing tokens,
      not a second design system to keep in sync.

## 5. Schema

```
snapshots(id, aoi, fetched_on, feature_count, source)      -- which acquisition a row came from
plots(id, snapshot_id, plot_number, land_name, project,
      area_sqft, gfa_sqft, floors, height_m, height_src,
      status, land_use, use_detail,
      rlv, rlv_psf, rlv_verdict, rlv_why,
      geom_4326, geom_3997, geom_lo)
massing(id, plot_number, kind, base_m, top_m, floors, geom_4326)
tile_cache(layer, z, x, y, snapshot_id, body bytea, built_at)
```

Indexes: GiST on `geom_4326`, `geom_lo`, `massing.geom_4326`; btree on `plot_number`,
`rlv_psf`, `status`, `land_use`; primary key on the tile cache tuple.

## 6. Phases

| | phase | done when |
|---|---|---|
| **P1** | Schema + loader from the dated snapshot | 100,215 plots and 72,019 volumes in Postgres |
| **P2** | `/api/tiles/{layer}/{z}/{x}/{y}.mvt`, cached, pre-warmed | z10 second hit is a PK lookup |
| **P3** | Merge the city routes into the one backend; `locate` becomes a query | the city no longer has a second server |
| **P4** | Port the city map to a React route in `web/` | one origin, one design system |
| **P5** | `docker compose up --build` — postgis + backend + web | verified up, not merely written |

All five done. Measured on the running stack: load 34 s for 100,215 plots + 72,019 volumes,
overview warm 2.3 s for 51 tiles, a cached z16 tile 1.5 ms, the whole city on screen from a cold
browser.

## 8. On Redis — asked, measured, declined

The cache it would replace is already a primary-key lookup: **1.8 ms** for a cached z16 tile,
1.4 ms for a massing tile. Redis might make that 0.3 ms, which is less than the request's own
round-trip, and it would not touch the one slow row — z10 at 39 ms — because that row is slow
from *payload size*, which Redis would serve just as slowly.

What actually fixed z10 was storing tiles **gzipped**: a vector tile compresses to 28-36%
(the overview, 4.4 MB -> 1.25 MB) but compressing costs 124 ms, far more than reading the
uncompressed blob. Done per request it would make the cache slower than no cache; done once at
fill time and served under `Content-Encoding: gzip` it is free. Result: **4.4 MB -> 1.25 MB on
the wire, 38.7 ms -> 12.3 ms**.

A second stateful service earns its place when it removes a bottleneck that exists.

## 9. What the whole-city load found

The engine had never been run over anything but Dubai Healthcare City — towers and institutional
plots. The city is 67,000 villa plots, and putting them through it produced this:

| | |
|---|---|
| priced | 70,183 |
| of those, **negative** | **64,884** (92%) |
| median RLV/sqft | **-623** |
| fixed cost > half of non-land cost | **49,015** |

The cause is not the arithmetic. `appraise()` carries **AED 3.5 m of fixed soft cost**
(authorities 2.0 m, landscape 1.0 m, misc 0.5 m), which is 4-5% of a tower scheme and **70-77% of
a villa scheme**:

| scheme | GFA | RLV/sqft | fixed as % of non-land cost |
|---|---|---|---|
| G+1+R villa | 1,484 | **-1,567** | 77.2% |
| G+2 villa (median) | 2,326 | **-1,387** | 69.7% |
| G+6 apartment | 91,300 | +313 | 4.8% |
| G+14 tower | 103,183 | +685 | 4.2% |

This is a cost model being asked a question it was not calibrated for. **The numbers were not
changed** — that is a modelling decision for Al Mizan, not a bug fix. Instead `fixed_cost_share`
travels with every row, the manifest reports how many rows exceed a half, and both the city panel
and the plot panel say so in words. A figure that rests on a fixed cost dwarfing its own scheme
should be visible as such, not discovered from a choropleth.

## 10. Bugs found and fixed in the port

Six, all of which rendered as "looks fine" until measured:

1. **`manifest.basis.statement` printed twice** in Source mode — visible in the user's screenshot.
2. **`new URL()` percent-encoded the tile template.** `{z}/{x}/{y}` became `%7Bz%7D`, MapLibre
   never substituted it, and the map requested **zero tiles** under a perfectly healthy legend.
3. **Constructor `bounds` + padding on an unlaid-out container.** MapLibre applied the fit during
   construction, got a transform it never recovered from, loaded its style, reported no error and
   requested no tiles at all — not even the basemap's.
4. **`maplibre-gl.css` overrode Tailwind's `absolute`.** MapLibre stamps `.maplibregl-map` on its
   container and its stylesheet sets `position: relative`, loading after Tailwind at equal
   specificity. `inset-0` stopped producing height and the map collapsed to **0 px**.
5. **Postgres `NUMERIC` is a *string* in an MVT.** `ST_AsMVT` has no arbitrary-precision type, so
   `rlv_psf` arrived as text, `["interpolate", ...]` was rejected, and the value choropleth
   rendered one flat pale colour under a correct legend. Every numeric is now cast to `float8`.
6. **Empty tiles returned 200, not 204** — emptiness was tested after gzip, and gzip of nothing is
   still ~20 bytes of header.

Plus two structural ones: `massing/Dockerfile` never copied `twin/` (the real reason the city map
had never been containerised), and `nginx.conf` proxied to a service named `massing` that no
longer exists.

## 7. What would make this wrong

- **Letting the display geometry become the only geometry.** If `geom_3997` is dropped as
  redundant, every future appraisal silently starts from degrees and no test fails.
- **Caching a tile without its snapshot.** A cache that outlives the load it was cut from serves
  yesterday's city with today's numbers, and nothing in the UI would say so.
- **Porting the map's look instead of its behaviour.** The panel copy carries provenance —
  `authority / derived / assumption / unavailable`, the coverage statement, the withheld reason. A
  port that keeps the colours and drops those sentences is a downgrade wearing the same palette.
