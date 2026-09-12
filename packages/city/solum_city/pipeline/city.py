"""
The city stage: acquire every DDA plot in Dubai, then cut it into vector tiles.

`pipeline/build.py` bakes a district into one JSON the browser downloads whole. That shape does
not survive the city. DHCC Phase 1 is 88 parcels in 388 KB -- 4.4 KB each -- and DDA publishes
100,216 plots. The same bake is ~440 MB in a single fetch, which is not a slow map, it is no map.

So the city takes the other road: the same dated, immutable snapshot, reprojected once and cut
into a PMTiles archive the browser range-requests. What changes is delivery. What does not change
is the chain -- geometry is acquired in EPSG:3997 and every attribute keeps the rung it came from.

    python -m solum_city.pipeline.city fetch     # ~101 pages from DDA into raw/dubai-all/<date>/
    python -m solum_city.pipeline.city geojson   # snapshot -> out/dubai-all/plots.geojsonl (4326)
    python -m solum_city.pipeline.city massing   # the derived scheme per plot, in parallel (~20 min)
    python -m solum_city.pipeline.city tiles     # geojsonl -> out/dubai-all/plots.pmtiles
    python -m solum_city.pipeline.city all

`tiles` is no longer how the running stack serves the map -- `twin/db` cuts MVT from Postgres on
request. It is kept because a PMTiles archive is the one artefact that works with no server at
all: a single file you can hand to someone, open in a desktop GIS, or host on static storage.

The reprojection lives here and only here. It is the one place in this repo where a coordinate
leaves metres, it happens offline, and nothing reads the result back into a calculation: a plot
clicked on the map is resolved by PLOT_NUMBER and re-fetched in 3997 for the study.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from pyproj import Transformer

from solum_massing.dda import parse_feature
from solum_massing.envelope import buildable_envelope
from solum_massing.feasibility import DEFAULT_COSTS, MIX_BASIS, appraise
from solum_massing.massing import generate
from solum_massing.solid import build_scene, parcel_polygon
from solum_city.sources import parcels

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config' / 'dubai-all.json'
OUT = ROOT / 'out'

_TO_WGS84 = Transformer.from_crs(3997, 4326, always_xy=True)

# The district snapshot asks for what a map needs. A city snapshot has to also carry what an
# APPRAISAL needs, because there is no second chance to ask: pricing 100,000 plots one live
# request at a time is not a build, it is a scrape. The setbacks and the parking rule are what
# `buildable_envelope` reads, so they come down with the geometry or the value layer cannot be
# baked at all.
APPRAISAL_FIELDS = [
    'MAX_PLOT_COVERAGE', 'MIN_PLOT_COVERAGE', 'PLOT_COVERAGE', 'GENERAL_NOTES',
    'BUILDING_SETBACK_SIDE1', 'BUILDING_SETBACK_SIDE2',
    'BUILDING_SETBACK_SIDE3', 'BUILDING_SETBACK_SIDE4',
    'PODIUM_SETBACK_SIDE1', 'PODIUM_SETBACK_SIDE2',
    'PODIUM_SETBACK_SIDE3', 'PODIUM_SETBACK_SIDE4',
]
OUT_FIELDS = ','.join(dict.fromkeys(parcels.OUT_FIELDS.split(',') + APPRAISAL_FIELDS))

# DDA writes 'N/A' and 'UNDEFINED' where it has nothing, and those are not values -- a panel that
# prints `Storeys N/A` is displaying a placeholder as though it were published data. The height
# chain already resolves them to `unavailable`; this stops the raw string reaching the screen.
PLACEHOLDERS = {'', 'N/A', 'NA', 'UNDEFINED', 'NULL', 'NONE', '-'}


def _clean(v):
    """A published value, or None if DDA wrote a placeholder where one would go."""
    if isinstance(v, str) and v.strip().upper() in PLACEHOLDERS:
        return None
    return v

# Six decimals is ~0.11 m at this latitude -- finer than the plot boundaries themselves, and it
# halves the file against the 15 digits Python prints by default.
PRECISION = 6


def _cfg() -> dict:
    return json.loads(CONFIG.read_text())


def _envelope(cfg: dict) -> tuple[float, float, float, float]:
    e = cfg['aoi']['envelope']
    return (e['xmin'], e['ymin'], e['xmax'], e['ymax'])


def fetch(*, refetch: bool = False) -> int:
    """Stage 1 -- the whole layer, paginated, into a dated snapshot."""
    cfg = _cfg()
    aoi = cfg['aoi']['id']
    print(f'· fetching {aoi} from DDA (expected ~{cfg["aoi"]["expected_feature_count"]:,} plots)')
    snap = parcels.fetch(aoi, _envelope(cfg), refetch=refetch, out_fields=OUT_FIELDS)

    expected = cfg['aoi']['expected_feature_count']
    print(f'· {snap.feature_count:,} plots over {len(snap.pages)} pages -> {snap.directory}')
    if snap.truncated:
        print('! TRUNCATED: the page loop hit MAX_PAGES with the server still flagging more')
        return 1
    # Reported, never silently accepted. The layer changes; a count that drifts is information.
    delta = snap.feature_count - expected
    if delta:
        pct = 100.0 * delta / expected
        print(f'· count differs from the 2026-09-11 baseline by {delta:+,} ({pct:+.2f}%)')
    return 0


def _height(props: dict, floor_h: float) -> tuple[float | None, str]:
    """
    The height chain, unchanged from the district: authority, derived, assumption, or nothing.

    Returns (metres, provenance). `None` metres is the point of the whole function -- a plot with
    no published height is UNAVAILABLE and must reach the renderer as an outline, not a box.
    """
    m = props.get('MAX_HEIGHT_METERS')
    if isinstance(m, (int, float)) and m > 0:
        return round(float(m), 1), 'authority'

    floors = props.get('MAX_HEIGHT_FLOORS')
    if isinstance(floors, str):
        # 'G+4', 'G+P+12', 'B+G+20' -- sum the numbered part, count the lettered ones as storeys.
        digits = ''.join(c if c.isdigit() else ' ' for c in floors).split()
        letters = sum(1 for part in floors.upper().split('+') if part.strip() in ('G', 'P', 'M'))
        n = sum(int(d) for d in digits) + letters
        if n > 0:
            return round(n * floor_h, 1), 'derived'
    elif isinstance(floors, (int, float)) and floors > 0:
        return round(float(floors) * floor_h, 1), 'derived'

    cat = props.get('HEIGHT_CATEGORY')
    if isinstance(cat, str) and cat.strip():
        band = _band_midpoint(cat)
        if band:
            return round(band * floor_h, 1), 'assumption'

    return None, 'unavailable'


def _band_midpoint(category: str) -> float | None:
    """Storey-band midpoint from a HEIGHT_CATEGORY label, or None if it carries no number."""
    digits = ''.join(c if c.isdigit() else ' ' for c in category).split()
    nums = [int(d) for d in digits]
    if len(nums) >= 2:
        return (nums[0] + nums[1]) / 2
    if len(nums) == 1:
        return float(nums[0])
    return None


def _value(feature: dict, props: dict) -> dict:
    """
    What the land is worth, solved from the snapshot rather than fetched.

    This is the same chain the study service runs -- `parse_feature -> buildable_envelope ->
    generate -> appraise` -- against a record already on disk. `parse_feature` is pure, which is
    the only reason a city-wide value layer is possible at all: 100,000 live plot fetches is not
    a build, it is a scrape.

    Three verdicts, and the distinction between the last two is the point. `priced` is a
    residential plot answered on residential assumptions. `hypothetical` is a plot DDA publishes
    as something else, priced on the same residential mix -- the arithmetic is sound and the
    premise is not, so it is flagged and coloured differently rather than compared. `withheld` is
    a plot where no scheme survives the published envelope, and it gets no number at all.
    """
    use = (props.get('MAIN_LANDUSE') or '').upper()
    try:
        reg = parse_feature(feature)
        env = buildable_envelope(reg)
        candidates = generate(reg, env, use_conservative=True)
        if not candidates:
            return {'rlv_verdict': 'withheld', 'rlv_why': 'no scheme survives the published envelope'}
        best = max(
            (appraise(c.gfa_sqft, reg.area_sqft.value or 0.0,
                      floors=c.floors, parking_bays=c.parking_bays) for c in candidates),
            key=lambda f: f.residual_land_value)
    except Exception as e:                       # a malformed record is withheld, never guessed
        return {'rlv_verdict': 'withheld', 'rlv_why': f'{type(e).__name__} while solving'}

    # How much of this scheme's cost is the part that does not scale.
    #
    # `appraise` carries AED 3.5 m of FIXED soft cost -- authorities 2.0 m, landscape 1.0 m,
    # misc 0.5 m. On a tower that is 4-5% of non-land cost and invisible. On a villa plot with
    # 2,326 sqft of GFA it is 70%, and the residual land value comes out at -1,387 per sqft.
    #
    # That is not a bug in the arithmetic; it is the cost model being asked a question it was
    # never calibrated for. It was built and checked against Dubai Healthcare City -- towers and
    # institutional plots -- and the city is 67,000 villa plots. So the share travels with every
    # row, and a reader can see which figures rest on a fixed cost that dwarfs the scheme rather
    # than discovering it from a choropleth that is uniformly dark.
    fixed = (DEFAULT_COSTS['authorities_fixed'] + DEFAULT_COSTS['landscape_fixed']
             + DEFAULT_COSTS['misc_fixed'])
    share = round(fixed / best.non_land_cost, 4) if best.non_land_cost else None

    return {
        'rlv': round(best.residual_land_value),
        'rlv_psf': round(best.rlv_psf_land, 1),
        'rlv_verdict': 'priced' if 'RESIDENTIAL' in use else 'hypothetical',
        'fixed_cost_share': share,
    }


def _rings(geometry: dict) -> list[list[list[float]]] | None:
    """ESRI rings in 3997 -> GeoJSON polygon rings in 4326, at fixed precision."""
    rings = geometry.get('rings') if geometry else None
    if not rings:
        return None
    out = []
    for ring in rings:
        pts = []
        for xy in ring:
            lon, lat = _TO_WGS84.transform(xy[0], xy[1])
            pts.append([round(lon, PRECISION), round(lat, PRECISION)])
        if len(pts) >= 4:
            out.append(pts)
    return out or None


def geojson() -> int:
    """Stage 2 -- snapshot to newline-delimited GeoJSON in 4326, one feature per line."""
    cfg = _cfg()
    aoi = cfg['aoi']['id']
    snap = parcels.latest(aoi)
    if snap is None:
        print(f'! no snapshot for {aoi}; run `python -m solum_city.pipeline.city fetch` first')
        return 1

    floor_h = cfg['height']['floor_height_m']
    out_dir = OUT / aoi
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / 'plots.geojsonl'

    seen: set[str] = set()
    bounds = [180.0, 90.0, -180.0, -90.0]   # w, s, e, n
    stats = {'written': 0, 'no_geometry': 0, 'duplicate': 0}
    prov = {'authority': 0, 'derived': 0, 'assumption': 0, 'unavailable': 0}
    verdict = {'priced': 0, 'hypothetical': 0, 'withheld': 0}

    with path.open('w') as fh:
        for feat in snap.features():
            props = feat.get('attributes') or {}
            plot = props.get('PLOT_NUMBER')
            key = str(plot) if plot not in (None, '') else f'oid-{props.get("OBJECTID")}'
            if key in seen:
                # Paged reads can repeat a row across a page boundary; they must not repeat a
                # clickable id, because the map resolves a click by PLOT_NUMBER.
                stats['duplicate'] += 1
                continue
            rings = _rings(feat.get('geometry') or {})
            if not rings:
                stats['no_geometry'] += 1
                continue
            seen.add(key)
            # Centroids are accumulated only to record the bounds the bake actually covers.
            # The per-plot index they used to build is gone: its one consumer was the static
            # viewer's search, and Postgres answers that with ST_PointOnSurface and a btree.
            outer = rings[0]
            cx = round(sum(c[0] for c in outer) / len(outer), PRECISION)
            cy = round(sum(c[1] for c in outer) / len(outer), PRECISION)
            bounds[0] = min(bounds[0], cx); bounds[1] = min(bounds[1], cy)
            bounds[2] = max(bounds[2], cx); bounds[3] = max(bounds[3], cy)

            h, p = _height(props, floor_h)
            prov[p] += 1
            value = _value(feat, props)
            verdict[value['rlv_verdict']] += 1
            attrs = {
                'id': key,
                'plot': plot,
                'land': _clean(props.get('LAND_NAME')),
                'project': _clean(props.get('PROJECT_NAME')),
                'area_sqft': props.get('AREA_SQFT'),
                'gfa_sqft': props.get('GFA_SQFT'),
                'floors': _clean(props.get('MAX_HEIGHT_FLOORS')),
                'height_src': p,
                'status': _clean(props.get('CONSTRUCTION_STATUS')),
                'use': _clean(props.get('MAIN_LANDUSE')),
                'use_detail': _clean(props.get('LANDUSE_DETAILS')),
            }
            if h is not None:
                attrs['height_m'] = h
            attrs.update(value)
            fh.write(json.dumps({
                'type': 'Feature',
                'geometry': {'type': 'Polygon', 'coordinates': rings},
                'properties': {k: v for k, v in attrs.items() if v not in (None, '')},
            }, separators=(',', ':')) + '\n')
            stats['written'] += 1

    print(f'· {stats["written"]:,} plots -> {path} ({path.stat().st_size / 1e6:.1f} MB)')
    print(f'  dropped: {stats["no_geometry"]:,} without geometry, {stats["duplicate"]:,} repeated')
    print('  height: ' + ', '.join(f'{k} {v:,}' for k, v in prov.items()))
    print('  value:  ' + ', '.join(f'{k} {v:,}' for k, v in verdict.items()))

    (out_dir / 'tiles-manifest.json').write_text(json.dumps({
        'aoi': aoi,
        'snapshot': snap.fetched_on,
        'source_crs': 3997,
        'tile_crs': 4326,
        'plots': stats['written'],
        'dropped': {'no_geometry': stats['no_geometry'], 'duplicate': stats['duplicate']},
        'height_provenance': prov,
        'value_verdict': verdict,
        'value_basis': {
            'unit_mix': MIX_BASIS,
            'statement': (
                'Residual land value is what the land is worth to the best scheme the '
                'published envelope allows, solved offline from this snapshot in EPSG:3997. '
                'The unit mix behind it is residential. A plot DDA publishes as a '
                'non-residential use is still priced, because the arithmetic is the same, '
                'but it is HYPOTHETICAL -- it answers what the land would be worth if it '
                'were built residential, which is not what is permitted there.'
            ),
        },
        'coverage': cfg['coverage'],
        'attribution': cfg['attribution'],
        'basis': cfg['basis'],
        'camera': cfg['camera'],
        'bounds': [round(b, 6) for b in bounds],
        'basemap': cfg['basemap'],
    }, indent=2))
    return 0


# Storeys are not what a map draws. `build_scene` returns one level per floor -- a 40-storey
# scheme is 40 rings at 40 heights -- and a tile does not need them: consecutive levels of the
# same kind share a footprint, so they collapse into one volume with a base and a top. That turns
# ~6 features per plot into 1 or 2, which is the difference between a tile that loads and one
# that does not.
#
# Basements are dropped outright. They are underground, a map looks down, and they would be 13,000
# invisible volumes.
VISIBLE_KINDS = ('podium', 'tower')


def _volumes(levels: list[dict]) -> list[dict]:
    """Consecutive levels of one kind, collapsed into a single base-to-top volume."""
    out: list[dict] = []
    for lv in levels:
        if lv['kind'] not in VISIBLE_KINDS:
            continue
        top = round(lv['base_m'] + lv['height_m'], 2)
        if out and out[-1]['kind'] == lv['kind'] and out[-1]['rings'] == lv['rings']:
            out[-1]['top_m'] = top
            continue
        out.append({'kind': lv['kind'], 'base_m': round(lv['base_m'], 2), 'top_m': top,
                    'rings': lv['rings']})
    return out


def _mass_one(feature: dict) -> list[dict] | None:
    """
    One plot solved into the massing it would actually be built as. Runs in a worker process.

    This is the whole point of the stage. Extruding a plot polygon to its permitted height draws
    a block the shape of a piece of land -- which is what a plot is, and what no building is. The
    district viewer never did that: it fits rectilinear blocks to the site axis, caps the tower
    for daylight, leaves the podium full, and the step between them is what makes a massing model
    read as a scheme rather than a diagram. This runs that same code, over the whole city.

    Rings come back recentred on the parcel centroid in metres, so they are translated home and
    reprojected -- the only place in this file, as ever, where a coordinate leaves 3997.
    """
    props = feature.get('attributes') or {}
    plot = props.get('PLOT_NUMBER')
    if not plot:
        return None
    try:
        reg = parse_feature(feature)
        env = buildable_envelope(reg)
        candidates = generate(reg, env, use_conservative=True)
        if not candidates:
            return None
        area = reg.area_sqft.value or 0.0
        best = max(candidates, key=lambda c: appraise(
            c.gfa_sqft, area, floors=c.floors, parking_bays=c.parking_bays).residual_land_value)
        scene = build_scene(reg, env, [best], with_context=False)
        solid = scene['solids'][0]
        # build_scene recentres on the parcel centroid but does not report it, so it is
        # recomputed here from the same polygon it used. Off by a metre and every scheme in the
        # city stands a metre from its own plot.
        centre = parcel_polygon(reg.rings).centroid
        cx, cy = centre.x, centre.y
    except Exception:
        return None

    out = []
    for vol in _volumes(solid['levels']):
        rings = []
        for ring in vol['rings']:
            pts = []
            for x, y in ring:
                lon, lat = _TO_WGS84.transform(x + cx, y + cy)
                pts.append([round(lon, PRECISION), round(lat, PRECISION)])
            if len(pts) >= 4:
                rings.append(pts)
        if not rings:
            continue
        out.append({
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': rings},
            'properties': {
                'plot': str(plot), 'kind': vol['kind'],
                'base_m': vol['base_m'], 'top_m': vol['top_m'],
                'floors': solid['floors'],
                'use': _clean(props.get('MAIN_LANDUSE')),
                'status': _clean(props.get('CONSTRUCTION_STATUS')),
            },
        })
    return out or None


def massing(workers: int | None = None) -> int:
    """Stage 2b -- the derived scheme for every plot, as its own tile layer."""
    cfg = _cfg()
    aoi = cfg['aoi']['id']
    snap = parcels.latest(aoi)
    if snap is None:
        print(f'! no snapshot for {aoi}; run `python -m solum_city.pipeline.city fetch` first')
        return 1

    feats = snap.features()
    workers = workers or max(1, (os.cpu_count() or 4) - 2)
    out_dir = OUT / aoi
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / 'massing.geojsonl'
    print(f'· massing {len(feats):,} plots across {workers} workers (~20 min)')

    massed = volumes = 0
    with path.open('w') as fh, ProcessPoolExecutor(max_workers=workers) as pool:
        for i, result in enumerate(pool.map(_mass_one, feats, chunksize=64)):
            if result:
                massed += 1
                for f in result:
                    fh.write(json.dumps(f, separators=(',', ':')) + '\n')
                    volumes += 1
            if (i + 1) % 10000 == 0:
                print(f'  {i + 1:,} / {len(feats):,} · {massed:,} massed')

    print(f'· {massed:,} plots -> {volumes:,} volumes -> {path} '
          f'({path.stat().st_size / 1e6:.1f} MB)')
    return 0


def tiles() -> int:
    """Stage 3 -- GeoJSONL to a single PMTiles archive."""
    cfg = _cfg()
    aoi = cfg['aoi']['id']
    t = cfg['tiles']
    src = OUT / aoi / 'plots.geojsonl'
    mass = OUT / aoi / 'massing.geojsonl'
    dst = OUT / aoi / 'plots.pmtiles'
    if not src.exists():
        print(f'! {src} missing; run `python -m solum_city.pipeline.city geojson` first')
        return 1

    # Two runs, joined -- not one run with two inputs.
    #
    # `-l` forces every input into a single layer, which is the opposite of what two layers means,
    # and tippecanoe has no way to give two inputs different zoom ranges in one pass. That matters:
    # plots are wanted from z8 so the emirate has something on it, and massing is never drawn
    # below z13.5, so carrying 140,000 tower plates down to z8 would be the heaviest thing in the
    # archive and nothing would ever ask for it. tile-join merges the two into one file.
    common = [
        # Every plot, at every zoom it is asked for. The density-dropping and coalescing flags
        # would both make the map lighter and both break it: one deletes plots, the other merges
        # two into one clickable feature.
        '--no-feature-limit', '--no-tile-size-limit',
        # Boundaries may simplify with zoom -- they are drawn, not measured. But the shape at the
        # deepest zoom is the shape that was acquired, because that is the one you can read.
        '--simplification=4', '--no-simplification-of-shared-nodes',
    ]
    parts: list[Path] = []
    runs = [(t['layer'], src, t['min_zoom'], t['max_zoom'])]
    if mass.exists():
        runs.append(('massing', mass, t.get('massing_min_zoom', 13), t['max_zoom']))
    else:
        print('  (no massing.geojsonl; run `python -m solum_city.pipeline.city massing` for schemes)')

    for layer, path_in, zmin, zmax in runs:
        part = OUT / aoi / f'.{layer}.pmtiles'
        cmd = ['tippecanoe', '-o', str(part), '--force', '-l', layer,
               '-Z', str(zmin), '-z', str(zmax), *common, str(path_in)]
        print('· ' + ' '.join(cmd))
        r = subprocess.run(cmd)
        if r.returncode != 0:
            return r.returncode
        parts.append(part)

    if len(parts) == 1:
        parts[0].replace(dst)
    else:
        # -pk keeps tile-join from re-imposing the size limit tippecanoe was told to ignore.
        # -pC is deliberately NOT passed: it leaves tiles uncompressed, which tripled the
        # archive from 32 MB to 95 MB for no gain -- the browser gunzips a vector tile either
        # way, and every byte here is a byte over a range request.
        join = ['tile-join', '-f', '-pk', '-o', str(dst), *(str(x) for x in parts)]
        print('· ' + ' '.join(join))
        r = subprocess.run(join)
        if r.returncode != 0:
            return r.returncode
        for part in parts:
            part.unlink(missing_ok=True)

    print(f'· {dst} ({dst.stat().st_size / 1e6:.1f} MB)')
    return 0


def main(argv: list[str]) -> int:
    stage = argv[1] if len(argv) > 1 else 'all'
    refetch = '--refetch' in argv
    if stage == 'fetch':
        return fetch(refetch=refetch)
    if stage == 'geojson':
        return geojson()
    if stage == 'massing':
        return massing()
    if stage == 'tiles':
        return tiles()
    if stage == 'all':
        return fetch(refetch=refetch) or geojson() or massing() or tiles()
    print(f'unknown stage {stage!r}; one of fetch, geojson, tiles, all')
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
