# PRD — City map: all of Dubai, as vector tiles

- **Status:** Building — all six phases shipped 2026-09-11
- **Date:** 2026-09-11
- **Owner:** adhik
- **Related:** `docs/prd/massing.md`, `packages/city/solum_city/README.md`, `packages/engine/solum_massing/basemap.py`

## 1. Problem / why now

The city base works and stops at 1.6 x 1.6 km. `packages/city/solum_city` bakes one AOI — Dubai
Healthcare City Phase 1, 88 parcels — into a single 388 KB `district.json` that the browser
fetches whole and three.js draws as one scene. Every gate passes. It is the right shape for a
district and the wrong shape for a city.

The arithmetic settles it. 388 KB / 88 parcels is **4.4 KB per parcel**. DDA's plot layer holds
**100,216 plots** (measured 2026-09-11, `MapServer/2` `returnCountOnly`). Baking all of them the
current way is ~440 MB of JSON in one fetch. There is no version of that which loads.

What the user wants is what investmentmap.ai does: open the page on the whole city, see every
plot, zoom into one. Their page is a vector GL map (`mapbox-gl.js`, confirmed by fetching
`https://investmentmap.ai/?m=p` on 2026-09-11) — an SPA over tiles, not a downloaded model.

## 2. What it does (scope)

**Two views, one data chain.**

- **City** — MapLibre GL JS over a vector basemap, with every DDA plot in Dubai as our own
  vector-tile layer on top. Pan the emirate, colour by value / status / height / use, click a
  plot.
- **Plot** — the existing three.js study, unchanged, opened on that click. Setbacks inset from
  real edges, plate fitted to the site axis, RLV priced by `solum_massing`.

The city view is **display only**. It renders in Web Mercator because that is what tiles are;
every setback, envelope, plate and RLV calculation stays in EPSG:3997 inside `solum_massing`,
which is the rule `basemap.py` already enforces and the reason this does not become a rewrite.

## 3. Explicitly out of scope

- **Transactions / DLD comps on the map.** investmentmap.ai is plotting sales. We are plotting
  entitlement. Overlaying DLD is `dld-comps-integration.md`, not this.
- **LOD2/LOD3, terrain, interiors.** LOD1 extrusion, flat ground, same as the district base.
- **Live DDA at map time.** The city layer is a dated snapshot, rebuilt on command. Only the
  single-plot study fetches live.
- **A self-hosted basemap build.** Planetiler over the planet is 2-3 hours and buys nothing here.

## 4. Design decisions to lock

- [ ] **MapLibre GL JS**, not Mapbox GL. Same API, BSD, no token. Mapbox GL went proprietary at v2.
- [ ] **Basemap: OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`, HTTP 200 verified
      2026-09-11, no key, no rate limit, OSM data, ODbL). Protomaps' dark themes are the fallback
      if the art direction needs a build we control.
- [ ] **Our plots ship as PMTiles**, one file, served statically beside `district.json`. Not a tile
      server — a single range-requested archive, which is the whole reason PMTiles exists.
- [ ] **The height chain survives into the tiles.** `authority -> derived -> assumption ->
      unavailable` is a tile attribute. A plot with no published height renders as an **outline**,
      never an extrusion. There is still no default height at the end of the chain.
- [ ] **Coverage is drawn, not hidden.** DDA governs 44.8% of Dubai's registered projects
      (measured 2026-08-29 against RERA). Trakhees 30.4%, Dubai Municipality 18.1%, Dubai South
      4.2%, DSO 2.4%. Areas we have no parcels for stay empty and the panel says why. An
      Al Mizan user asking "where is Downtown?" gets an answer, not a blank.
- [ ] **Plot id stays `PLOT_NUMBER`.** Gate E already proves it resolves in both the tile path and
      `GET /api/twin/appraise/{plot}`.

## 5. Architecture

```
DDA MapServer/2 ──paginate 2000/req──▶ solum_city/raw/dubai-all/<date>/page-NNN.json   [snapshot, dated]
                                              │
                                     reproject 3997 → 4326  (display only)
                                              │
                                        plots.geojsonl
                                              │
                                        tippecanoe -z16
                                              │
                                    out/dubai-all/plots.pmtiles
                                              │
   OpenFreeMap style ──┐                      │
                       ▼                      ▼
                  MapLibre GL JS  ◀── pmtiles protocol
                       │
                  click PLOT_NUMBER
                       ▼
          GET /api/twin/appraise/{plot}  ──▶ existing three.js study (3997, untouched)
```

`maxRecordCount` is 2000 and `supportsPagination` is true, so the pull is ~51 requests over
`resultOffset` / `resultRecordCount`. The snapshot lands in `solum_city/raw/<aoi>/<date>/` exactly the
way the DHCC build already does, so a city map is reproducible and carries the day it was taken.

## 6. Phases — each one renders before the next starts

| | phase | done when | status |
|---|---|---|---|
| **P0** | Paginated city-wide DDA extract → dated snapshot | count matches the layer | **done** — 100,215 over 101 pages, one off the baseline |
| **P1** | Reproject + tile → `plots.pmtiles` | one file, every plot in it | **done** — 24.9 MB, z8–z16, 0 dropped, 0 duplicated |
| **P2** | MapLibre city viewer: dark base, plots, hover, click | the emirate loads | **done** |
| **P3** | `fill-extrusion` by permitted height, provenance-gated | no-height plots stay flat | **done** — verified on a plot with none |
| **P5** | Click → the existing plot study, in place | one click from city to massing | **done** — plot 3150141 priced live at AED 186.4 m |
| **P4** | Offline RLV bake → value choropleth | every priced plot coloured, withheld ones say why | **done** |

### The value layer, and the flag it carries

`_value()` runs the same chain the study service runs — `parse_feature → buildable_envelope →
generate → appraise` — against the record already on disk. `parse_feature` is pure, which is the
only reason a city-wide value layer is possible: 100,000 live plot fetches is a scrape, not a
build. Measured on 1,000 real plots it costs **6 seconds for the whole city**.

Three verdicts travel into the tiles, and the distinction between the last two is the point:

| verdict | meaning | drawn as |
|---|---|---|
| `priced` | a residential plot answered on residential assumptions | the value ramp |
| `hypothetical` | DDA publishes a non-residential use; priced on the same residential mix — the arithmetic is sound, the premise is not | same hue, half opacity |
| `withheld` | no scheme survives the published envelope | flat grey, no number, with the reason |

The setback fields are what makes this honest. The first snapshot did not carry them, so
`buildable_envelope` fell back and half the plots came back `withheld`. `APPRAISAL_FIELDS` now
requests all 29 fields the engine reads, and the value layer is baked from a snapshot that has
them.

## 6b. The as-built city — added after seeing the reference

The reference (investmentmap.ai / DXB Interact) renders the **real city**: Burj Khalifa at its
own height, the Downtown skyline in white, and price data floated over it as coloured markers.
The first build of this map extruded *plots*, which at city scale reads as slabs — a plot is a
piece of land, not a building.

The fix cost one layer and no new data. OpenMapTiles' `building` source-layer is already inside
the basemap tiles the page downloads, carrying `render_height` and `render_min_height`. Extruding
it gives the whole emirate as-built, free, keyless, and with the Burj at 828 m. It is deliberately
unlit and uncoloured: the moment the as-built city takes a colour it competes with the layer
carrying the answer.

That leaves two readings of the same ground, and they cannot share a screen:

- **as-built** (default) — the city that is standing, grey, with entitlement as a flat wash on it
- **entitlement massing** (toggle) — the permitted envelope in colour, the real city dropped to
  25% behind it, so a scheme is seen against what it would replace

This is the axis the reference does not have. DXB Interact plots **transaction prices on what
exists**. This plots **what may be built and what the land is worth to it**. Same city, different
question — which is why the comparison is a toggle and not a blend.

## 6c. Clubbing the two versions — the scheme, not the block

Seeing the city map at z10 with massing on: *"it's just block type of differentiation but lacks
buildings we build."* Both halves of that are right, and they are different problems.

**The blocks.** `plots-3d` extruded the plot polygon to its permitted height. A plot is a piece of
land and no building is the shape of one, so the result is a coloured block — exactly the diagram
the district viewer stopped drawing when `solid.py` learned to fit rectilinear blocks to the site
axis, cap the tower for daylight, leave the podium full, and step between them.

So the massing stage now runs **that same code over all 100,215 plots** and bakes the result as a
second tile layer. Measured: 26.6 s per 200 plots single-threaded → ~222 min for the city, so it
runs across 12 workers in ~20. Per-storey levels collapse into base-to-top volumes per kind
(≈1.4 volumes per plot instead of ~6 levels), and basements are dropped — they are underground and
a map looks down.

**The missing buildings.** Nothing was broken at z10: OpenMapTiles carries no building geometry
below z14, and the massing layer is cut from z13.5. The toggle now says `zoom in` rather than
appearing to do nothing.

**And the district viewer's ground.** Satellite is back as a toggle, from the same Esri World
Imagery cache `basemap.py` has always used — keyless, CORS-open. Off by default, because a
satellite ground under an analytic choropleth is two competing images.

That is the club: the previous version's *scheme* and *ground*, at the current version's *scale*.

## 7. What would make this wrong

- **Reprojecting the maths.** If a setback is ever computed in 4326 or 3857, the numbers go
  quietly wrong and nothing fails loudly. The reprojection happens once, offline, on the way
  into the tiles, and never on the way back.
- **Filling the coverage gap with a guess.** A plot Trakhees governs is not a DDA plot with
  missing fields. It is absent, and absent is what it must render as.
- **Pricing 100k plots as if they were residential.** 40 of 51 priced DHCC parcels are published
  as non-residential and their RLV is already flagged hypothetical. At city scale that flag
  carries or the choropleth is fiction.
