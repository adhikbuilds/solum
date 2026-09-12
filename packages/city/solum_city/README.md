# City base

The layer underneath the massing model: a district of Dubai, acquired once, baked offline, and
rendered with every height carrying the rung of the chain it came from.

`solum_massing` answers *what may be built on this plot* — it fetches the subject parcel live,
derives its neighbours in the request, and throws all of it away when the response ends. That is
right for a study and wrong for a city: the district cannot be rebuilt from it, the same parcel
answers differently on a different day, and nothing records which day.

This is additive. It imports from `solum_massing` and changes nothing there.

## Run it

```bash
cd massing
python -m solum_city.pipeline.build             # live DDA + OSM over the AOI in config/dubai.json
python -m solum_city.pipeline.build --fixture   # offline, from the checked-in parcel response
python -m solum_city.pipeline.gates             # the acceptance gates -> out/<aoi>/gates.md
python -m pytest tests/test_twin.py

python -m solum_city.pipeline.city all          # the whole emirate -> out/dubai-all/plots.pmtiles
python -m solum_city.web.serve                  # /city.html (Dubai) and /viewer.html (one district)
```

`?imagery=off` or `?imagery=40` caps the ground tiles for a slow link or an automated capture.

## What is actually in it

Measured 2026-09-09 over Dubai Healthcare City Phase 1 (1.6 × 1.6 km). Three layers, from three
sources, each answering what only it can:

| layer | source | count |
|---|---|---|
| **entitlement** — what may be built | DDA parcel layer | 88 parcels, 51 massed, 37 outlined |
| **as-built** — what is standing | OpenStreetMap | 471 footprints: 28 surveyed height, 25 at their plot ceiling, 418 shape-only |
| **value** — what the land is worth | this repo's engine | 51 priced, 37 withheld with a reason |

Permitted heights: 4 authority, 53 derived, 1 assumption, 30 unavailable. Status: 39 completed,
33 empty, 8 under construction, 4 suspended, 4 pre-construction. RLV per sqft of land runs
−40 / 676 / 1,344 (min / median / max); 40 of the 51 priced parcels are published as a
non-residential use, so their figures are flagged hypothetical. Everything regenerates into
`out/<aoi>/report.md` and `out/<aoi>/gates.md` on every build.

## The view

Five modes over one district. **Site** is the city: real OSM footprints, satellite ground at
0.54 m/px, and entitlement kept as a faint ghost only where nothing is standing. **Value** colours
every parcel by residual land value per sqft. **Status**, **Height** and **Use** drop the art
direction entirely, because when the question is where a number came from, a flat legible colour
is the honest answer and a beautiful render is not.

The sun is not a dragged light: `sun.py` runs the NOAA solar position algorithm on the AOI's own
latitude and longitude for a fixed stated moment (15:00, equinox — 242° azimuth, 45° elevation),
so shadows fall where Dubai's do and the render carries a timestamp.

Click any parcel and **Re-run the full study** solves it properly — setbacks inset from the real
edges, plate fitted to the site's axis — and draws that scheme in place, in the accent colour,
standing inside the district. The district's own massing is a fast derivation; the study is the
answer, and the response says so.

## The three decisions worth knowing

**Every height here is *permitted*, not as-built.** `MAX_HEIGHT_FLOORS` is a ceiling, not a
measurement. 33 of these 88 plots are `Empty` and still carry a permitted height — the base draws
what the authority allows on the land, and `CONSTRUCTION_STATUS` rides along per parcel so the two
can be told apart. Anyone reading this as a picture of what is standing in DHCC today will be
wrong, which is why the manifest, the report and the viewer all say `basis: permitted` on their
face. Changing that needs an as-built source — municipal LOD1/LOD2, Overture/OSM heights, or
LiDAR. None is wired in.

**A parcel becomes a building only when a height *and* a floor plate can both be derived.**
Plate = permitted GFA ÷ permitted storeys, the same `derived` move `solum_massing.solid` makes for
a study's neighbours. Where either is missing the parcel is baked as a flat ground outline. There
is no conservative default at the end of the height chain on purpose: the 37 outlines are the
shape of what this source does not describe, and a default would replace them with 37 buildings
that do not exist.

**No terrain is sampled.** The vertical model is a flat plane at 0 m on an undeclared datum,
tagged `assumption` in the manifest. This AOI spans 1.6 km of coastal plain where relief is a
fraction of one storey, and the global fallback DEM (Copernicus GLO-30) is a *surface* model — it
contains the buildings, so seating buildings on it would count them twice. Revisit only with a
bare-earth DTM, and only if something needs it.

## Layout

Four packages, split by what each one is allowed to do — which is the only structural rule here
that earns its keep. `model/` cannot reach the network, so it can be tested without one;
`sources/` is the only place a fetch happens, so an immutable snapshot is enforceable in one
place; `pipeline/` orchestrates and never draws; `web/` draws and never computes.

```
config/dubai.json     the city as configuration: AOI, CRS, origin, sources, height rules, attribution

sources/              the only code that talks to the outside world
  parcels.py          DDA: paged fetch into an immutable dated snapshot under raw/
  osm.py              OpenStreetMap footprints via Overpass, into the same snapshot
  imagery.py          Esri tile references for the AOI — corners, never image bytes

model/                pure: no network, no clock, no randomness
  config.py           loads and validates the city — one that cannot place its geometry is refused
  schema.py           the contract: Parcel, Building, Manifest, Stats — one Provenance, imported
  geometry.py         ArcGIS rings → parts, grouped by containment rather than by guessing
  heights.py          the height chain: metres → storeys → band → nothing
  sun.py              NOAA solar position for the AOI's own latitude and longitude
  value.py            residual land value for every parcel, from the snapshot already on disk

pipeline/             the stages you run
  build.py            acquire → validate → resolve → derive → bake to out/
  gates.py            the acceptance gates → out/<aoi>/gates.md

web/                  the served surface
  serve.py            static viewer + the one API the viewer needs
  study.py            the semantic join: a plot id → its solved scheme and its money
  static/viewer.html  markup only
  static/viewer.css   the instrument theme
  static/scene.js     geometry, materials, light, camera — knows nothing about panels
  static/ui.js        palettes, panels, legend, search, bootstrap — knows nothing about meshes

raw/                  immutable downloads, dated, never overwritten          (gitignored)
out/<aoi>/            district.json, manifest.json, report.md, gates.md      (committed)
```

`out/` is generated and normally would not be committed. It is here because it is the demo
payload: the viewer is a static page that reads those files, so committing them is what makes a
hosted copy work without a server. Rebuild replaces them; the reports are worth reading in diffs.

## Frame

EPSG:3997 in, EPSG:3997 out. The bake **translates and never reprojects** — DDA publishes in Dubai
Local Transverse Mercator, whose unit is the metre, so subtracting the origin is the entire
transform. Baked rings are a local plan frame (`x = easting − origin.x`, `y = northing − origin.y`);
the renderer supplies the Y-up step with one `rotateX(-π/2)`, exactly as
`solum_massing.solid` → `web/src/components/Scene.tsx` already does, so a district and a plot study
sit in one coordinate system rather than mirrored against each other.

Pinned by `test_the_frame_round_trips_to_the_source_crs`: a baked vertex plus the origin is the
DDA easting and northing it came from, to the millimetre.

## Validation gates

`twin.gates` runs the guide's acceptance gates as code, into `out/<aoi>/gates.md`:

| | gate | result |
|---|---|---|
| A | CRS and positioning | **pass** — 88 parcels round-trip to EPSG:3997, worst vertex error 0.5 mm; scale median 0.006% against DDA's own published areas |
| B | Building statistics | **pass** — 0 zero heights, 0 duplicates, 0 overlapping footprints, 0 footprints exceeding their plot |
| C | Terrain alignment | n/a — no terrain is sampled, and the reason is in the config |
| D | LOD transitions | n/a — one tier, no tiling, nothing to pop |
| E | Semantic selection | **pass** — every rendered id resolves to its source record with attributes still agreeing |
| F | Performance | n/a — the numbers are measured, but no hardware target is set, so there is no limit to enforce |
| G | Licensing | **pass** — all three sources used are attributed on screen |

## Known gaps

- **Jurisdiction.** DDA governs 44.8% of Dubai's registered projects. An AOI over a Trakhees or
  Dubai Municipality area returns fewer parcels, and the base reports the shortfall rather than
  filling it. Another source is needed for the rest of the city.
- **Heights, not shapes, are the weak half of the as-built layer.** 418 of 471 surveyed footprints
  have no recorded height and are drawn flat. Overture, municipal LOD1/LOD2 or LiDAR would fix it;
  guessing would not.
- **No roads, water or land-use polygons.** Streets exist only as pixels in the imagery — there is
  no network graph and nothing selectable. That is a vertical slice of its own.
- **One AOI.** No tiling, no LOD switching, no streaming. 88 parcels need none of it; a city-wide
  bake needs all three.
- **Landmarks are ordinary parcels.** No LOD2/LOD3 assets, no hero zone (`hero_zone: null`).

Parcel data: Dubai Development Authority. Imagery: Esri, Maxar, Earthstar Geographics.
Building footprints: © OpenStreetMap contributors, ODbL.


## Two scales, and why they are built differently

The district above is one bake the browser downloads whole. `python -m solum_city.pipeline.city` does
not, and cannot: DHCC Phase 1 is 88 parcels in 388 KB — 4.4 KB each — and DDA publishes **100,216
plots**. The same bake is ~440 MB in a single fetch. So the city is delivered as vector tiles.

| | district (`viewer.html`) | city (`city.html`) |
|---|---|---|
| extent | 1.6 × 1.6 km, one AOI | the DDA layer's own published extent |
| plots | 88 | ~100,000 |
| delivery | one `district.json`, fetched whole | one `plots.pmtiles`, range-requested |
| renderer | three.js, hand-built scene | MapLibre GL JS over OpenFreeMap |
| as-built | 471 OSM footprints, fetched | the whole emirate, already in the basemap tiles |
| frame | local plan metres about an origin | Web Mercator, because tiles are |
| what it answers | what a block looks like | where a plot is, and what it may become |
| value | 51 priced, 37 withheld, live | baked offline for every plot, in 6 seconds |

What does **not** differ is the chain. Geometry is acquired in EPSG:3997 and the reprojection to
4326 happens once, offline, in `pipeline/city.py`, on the way into the tiles. Nothing reads it
back: a plot clicked on the map is resolved by `PLOT_NUMBER` and re-fetched in 3997 by
`/api/twin/appraise/{plot}`, which is the same pure appraisal the district uses. The height chain
survives into the tile attributes — `authority → derived → assumption → unavailable` — and a plot
with no published height carries no `height_m` and is drawn as an outline. At 88 parcels an
invented height is a wrong building. At 100,000 it is a convincing city that does not exist.

**The city map is not all of Dubai.** DDA governs 44.8% of the emirate's 3,039 RERA-registered
projects (measured 2026-08-29): Trakhees 30.4%, Dubai Municipality 18.1%, Dubai South 4.2%,
DSO 2.4%. Areas another authority governs carry no plots and are drawn as nothing. The coverage
bar in the left panel says so, so an empty Downtown reads as a jurisdiction boundary rather than
a bug.


## The city view has two readings, and they are a switch

**As-built** (default) is the city that is standing: OpenMapTiles' `building` source-layer — already
inside the basemap tiles the page downloads — extruded to `render_height`, so the Burj stands at
828 m. It costs no new source, no key and no extra request. It is grey on purpose; the moment the
as-built city takes a colour it competes with the layer carrying the answer.

**Entitlement massing** (toggle) puts the permitted envelope up in colour and drops the real city
to 25% behind it, so a scheme is read against what it would replace.

They cannot share a screen. Two 3D layers on the same ground make neither legible, which is why
this is a toggle and not a blend — and why the plot extrusion, which used to be the default
reading of the map, is now opt-in.


## The scheme layer

`python -m solum_city.pipeline.city massing` runs `parse_feature -> buildable_envelope -> generate ->
build_scene` over every plot and bakes the winning scheme as its own tile layer. This is the same
massing the district viewer draws — rectilinear blocks fitted to the site axis, tower capped for
daylight, podium left full — not a plot polygon pushed up to its permitted height. A plot is a
piece of land; no building is the shape of one, and extruding it is what made the city read as
coloured blocks.

It is the expensive stage: 26.6 s per 200 plots, ~222 min for the city single-threaded, so it
runs across `cpu_count() - 2` workers in roughly twenty minutes. Per-storey levels collapse into
one volume per kind with a real base and top, so a podium reads as a podium and the tower stands
on it. Basements are dropped — underground, and a map looks down.

Three things are zoom-level facts rather than settings, and the UI says so instead of appearing
broken: OpenMapTiles carries no buildings below z14, the massing layer is cut from z13.5, and
below either the toggle reads `zoom in`.
