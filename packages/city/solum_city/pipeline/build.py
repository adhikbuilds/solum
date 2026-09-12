"""
The pipeline: a raw snapshot in, a renderer-ready district and a manifest out.

Run it:

    python -m twin.build                      # live DDA over the AOI in config/dubai.json
    python -m twin.build --fixture            # offline, from the checked-in parcel response
    python -m twin.build --refetch            # new dated snapshot beside the existing one

Stages, in order, each pure except the first:

    acquire -> validate geometry -> resolve heights -> derive footprints -> to scene frame -> bake

Nothing is written outside `out/<aoi>/`, and nothing in `raw/` is ever modified.

The one rule that shapes the output: a parcel becomes a *building* only when the pipeline can
both resolve a height and derive a floor plate. Everything else is baked as a ground outline.
That is why the report leads with the outline count -- it is the honest measure of how much of
this district the source data actually describes.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry.base import BaseGeometry
from shapely.geometry import Polygon, box

from solum_massing.paths import fixture
from solum_massing.dda import SQFT_PER_SQM, Provenance
from solum_massing.solid import shrink_to_area

from solum_city.model import config as cityconfig, value
from solum_city.sources import osm as buildings, parcels as acquire
from solum_city.model.geometry import parcel_geometry
from solum_city.model.heights import Height, resolve
from solum_city.sources.imagery import _TO_WGS84, district_tiles
from solum_city.model.sun import default_moment, scene_direction, solar_position
from solum_city.model.schema import Manifest, Parcel, Rejected, Stats

OUT_DIR = Path(__file__).resolve().parents[1] / 'out'

# Below this a "parcel" is a cadastral sliver -- a boundary artefact, not a site. Drawing them
# adds triangles and reads as noise on the ground plane.
MIN_PARCEL_SQM = 25.0

def _num(attrs: dict, key: str) -> float | None:
    try:
        v = float(attrs.get(key) or 0)
    except (TypeError, ValueError):
        return None
    return v or None

def _rings_to_local(geom: BaseGeometry, cfg: cityconfig.CityConfig) -> list[list[list[list[float]]]]:
    """
    Polygon(s) in EPSG:3997 metres -> parts in the local plan frame (east, north from origin).

    The return is a list of *parts*, each `[exterior, *holes]`. The nesting is not ceremony: a
    flat list of rings cannot say whether ring two is a courtyard inside ring one or a second
    piece of the same parcel, and a renderer that guesses "hole" punches a void through a
    building. Both cases are reachable here -- `parcel_polygon`'s buffer(0) repair can return a
    MultiPolygon, and shrinking a concave parcel to a plate can split it in two.

    The transform itself is a translation plus a rounding, not a reprojection: the source CRS is
    already metric. Millimetres, because a district of float64 rings is megabytes of precision no
    renderer can show.
    """
    parts = []
    for p in getattr(geom, 'geoms', [geom]):
        if p.is_empty:
            continue
        parts.append([
            [[round(v, 3) for v in cfg.to_local(x, y)] for x, y in ring.coords]
            for ring in [p.exterior, *p.interiors]
        ])
    return parts

def _footprint(poly: BaseGeometry, gfa_sqm: float | None, height: Height) -> tuple[str, BaseGeometry]:
    """
    Plate, or plot.

    The derived plate is permitted GFA over permitted storeys -- the same `derived` move
    `solum_massing.solid` makes for a study's neighbours, and for the same reason: extruding a
    whole cadastral parcel to its height limit produces a wall, and a district of walls is not a
    city. Only ever shrink; a plate larger than its parcel means the plot builds to its boundary,
    which the parcel polygon already is.

    No height or no GFA means no derivable building, and the parcel is returned for outlining.
    """
    if not height.known or not height.floors or not gfa_sqm:
        return 'outline', poly
    plate_sqm = gfa_sqm / height.floors
    if plate_sqm <= 0 or plate_sqm >= poly.area:
        return 'solid', poly
    try:
        return 'solid', shrink_to_area(poly, plate_sqm)
    except Exception:
        return 'solid', poly

def bake(features: list[dict], cfg: cityconfig.CityConfig) -> tuple[list[Parcel], Stats, list[Rejected]]:
    """Raw ArcGIS features -> baked parcels. Pure: no I/O, no clock, no network."""
    aoi = box(*cfg.envelope.as_tuple())
    stats = Stats(fetched=len(features))
    rejected: list[Rejected] = []
    seen: dict[str, Parcel] = {}
    prov = Counter()
    status = Counter()
    landuse = Counter()

    for f in features:
        attrs = f.get('attributes') or {}
        pid = str(attrs.get('PLOT_NUMBER') or attrs.get('OBJECTID') or '')
        rings = (f.get('geometry') or {}).get('rings') or []
        if not rings:
            rejected.append(Rejected(pid, 'no geometry on the source feature'))
            continue
        try:
            poly = parcel_geometry(rings)    # groups parts by containment, repairs, keeps holes
        except Exception as exc:
            rejected.append(Rejected(pid, f'geometry could not be repaired: {exc}'))
            continue
        if poly.is_empty:
            rejected.append(Rejected(pid, 'geometry repaired to an empty polygon'))
            continue
        if poly.area < MIN_PARCEL_SQM:
            rejected.append(Rejected(pid, f'sliver: {poly.area:.1f} sqm < {MIN_PARCEL_SQM:g} sqm'))
            continue
        if not poly.intersects(aoi):
            rejected.append(Rejected(pid, 'outside the AOI envelope'))
            continue

        height = resolve(attrs, cfg.floor_height_m)
        gfa_sqm = _num(attrs, 'GFA_SQM') or (
            (_num(attrs, 'GFA_SQFT') or 0) / SQFT_PER_SQM or None
        )
        render, foot = _footprint(poly, gfa_sqm, height)

        parcel = Parcel(
            id=pid,
            object_id=attrs.get('OBJECTID'),
            name=attrs.get('LAND_NAME'),
            project=attrs.get('PROJECT_NAME'),
            landuse=attrs.get('LANDUSE_DETAILS') or attrs.get('MAIN_LANDUSE'),
            status=attrs.get('CONSTRUCTION_STATUS'),
            area_sqm=round(_num(attrs, 'AREA_SQM') or poly.area, 1),
            gfa_sqm=round(gfa_sqm, 1) if gfa_sqm else None,
            height=height,
            render=render,
            footprint=_rings_to_local(foot, cfg),
            plot=_rings_to_local(poly, cfg),
            beyond_aoi=not aoi.contains(poly),
        )

        # The layer returns a parcel once per page boundary crossing in rare cases, and a plot
        # number can repeat across historic records. Keep the larger geometry, report the other.
        if pid in seen:
            if (parcel.area_sqm or 0) <= (seen[pid].area_sqm or 0):
                rejected.append(Rejected(pid, 'duplicate plot number; kept the larger parcel'))
                continue
            rejected.append(Rejected(pid, 'duplicate plot number; superseded by a larger parcel'))
        seen[pid] = parcel

    parcels = list(seen.values())
    for p in parcels:
        prov[p.height.provenance.value] += 1
        status[p.status or 'unstated'] += 1
        landuse[p.landuse or 'unstated'] += 1
        if p.render == 'solid':
            stats.solid += 1
        else:
            stats.outlined += 1
        if p.beyond_aoi:
            stats.beyond_aoi += 1
        if p.height.metres:
            stats.tallest_m = max(stats.tallest_m or 0, p.height.metres)
        stats.total_gfa_sqm += p.gfa_sqm or 0

    stats.kept = len(parcels)
    stats.rejected = len(rejected)
    stats.by_height_provenance = dict(prov.most_common())
    stats.by_status = dict(status.most_common())
    stats.by_landuse = dict(landuse.most_common(12))
    stats.total_gfa_sqm = round(stats.total_gfa_sqm, 1)
    return parcels, stats, rejected

def report(m: Manifest) -> str:
    """The pipeline report: what was built, from what, and how much of it is inference."""
    s = m.stats
    pct = lambda n: f'{100 * n / s.kept:.1f}%' if s.kept else '--'
    lines = [
        f'# {m.aoi_name} — city base',
        '',
        f'Built {m.built_at} from snapshot `{m.snapshot.get("fetched_on")}` '
        f'({m.snapshot.get("pages", 0)} page(s), {m.snapshot.get("feature_count", 0)} features fetched).',
        '',
        f'**Basis: {m.basis}.** {m.basis_statement}',
        '',
        '## Frame',
        '',
        f'- CRS: EPSG:{m.source_crs} in, EPSG:{m.target_crs} out (no reprojection of geometry)',
        f'- Origin: {m.origin[0]:.0f} E, {m.origin[1]:.0f} N',
        f'- Units: {m.units} · LOD: {m.lod}',
        f'- Vertical: {m.vertical.get("model")} at {m.vertical.get("ground_elevation_m")} m '
        f'[{m.vertical.get("provenance")}]',
        '',
        '## Parcels',
        '',
        f'| | |',
        f'|---|---|',
        f'| kept | {s.kept} |',
        f'| drawn as buildings | {s.solid} ({pct(s.solid)}) |',
        f'| drawn as ground outlines | {s.outlined} ({pct(s.outlined)}) |',
        f'| extending past the AOI edge | {s.beyond_aoi} |',
        f'| rejected | {s.rejected} |',
        f'| tallest | {s.tallest_m or 0:.1f} m |',
        f'| total permitted GFA | {s.total_gfa_sqm:,.0f} sqm |',
        '',
        '## Where the heights came from',
        '',
        '| provenance | parcels | share |',
        '|---|---|---|',
    ]
    for k, v in s.by_height_provenance.items():
        lines.append(f'| {k} | {v} | {pct(v)} |')
    lines += ['', '## Construction status (source: DDA)', '', '| status | parcels |', '|---|---|']
    for k, v in s.by_status.items():
        lines.append(f'| {k} | {v} |')

    if s.built_count:
        lines += [
            '', '## What is standing (OpenStreetMap)', '',
            f'| | |', '|---|---|',
            f'| surveyed footprints | {s.built_count} |',
            f'| with a surveyed height (OSM) | {s.built_with_surveyed_height} |',
            f'| dominant structures drawn at their plot ceiling | {s.built_at_permitted_ceiling} |',
            f'| shape known, height not — drawn flat | {s.built_shape_only} |',
            f'| total built footprint | {s.built_footprint_sqm:,.0f} sqm |',
            f'| parcels carrying at least one building | {s.parcels_with_a_building} of {s.kept} |',
            '',
            'DDA says what may be built; OSM says what is standing. Heights are sparse in OSM, so a '
            'footprint without one is drawn at its parcel’s permitted ceiling and labelled '
            '`deferred` — a real shape at a height that is a ceiling, never a measurement.',
        ]

    if s.priced:
        r = s.rlv_psf_land
        lines += [
            '', '## What the land is worth', '',
            f'| | |', '|---|---|',
            f'| parcels priced | {s.priced} |',
            f'| withheld, with a reason | {s.withheld} |',
            f'| hypothetical (published use is not residential) | {s.hypothetical} of {s.priced} |',
            f'| RLV per sqft of land | {r.get("min")} / {r.get("median")} / {r.get("max")} '
            f'(min / median / max) |',
            '',
            'The engine prices a residential schedule. Most of this district is published as '
            'FACILITIES, so those figures answer “what would this land be worth under a residential '
            'scheme of the permitted size”, and are flagged hypothetical rather than presented as a '
            'valuation of what is there.',
        ]

    if s.outlined:
        lines += [
            '',
            '## The outlines',
            '',
            f'{s.outlined} parcels are drawn flat. Each is a real plot with no derivable building: '
            'either DDA published no height for it, or no GFA to divide into a floor plate. '
            'They are the shape of what this source does not describe, and the honest alternative '
            'to inventing a box.',
        ]
    if m.rejected:
        lines += ['', '## Rejected features', '', '| plot | reason |', '|---|---|']
        for r in m.rejected[:40]:
            lines.append(f'| {r.id or "—"} | {r.reason} |')
        if len(m.rejected) > 40:
            lines.append(f'| … | {len(m.rejected) - 40} more |')

    lines += ['', '## Attribution', ''] + [f'- {a}' for a in m.attribution] + ['']
    return '\n'.join(lines)

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description='Bake a district city base from DDA parcels.')
    ap.add_argument('--city', default='dubai')
    ap.add_argument('--fixture', action='store_true',
                    help='build offline from packages/engine/fixtures/parcel-3156315.json')
    ap.add_argument('--refetch', action='store_true',
                    help='force a new dated snapshot instead of reusing today\'s')
    args = ap.parse_args(argv)

    cfg = cityconfig.load(args.city)
    print(f'· {cfg.aoi_name} — EPSG:{cfg.target_crs}, origin {cfg.origin[0]:.0f} E {cfg.origin[1]:.0f} N')

    if args.fixture:
        fixture = fixture()
        features = acquire.from_fixture(fixture)
        snapshot_dir = None
        snapshot_meta = {'fetched_on': 'fixture', 'pages': 1, 'feature_count': len(features),
                         'source': str(fixture.relative_to(fixture.parents[2])), 'truncated': False}
        print(f'· fixture: {len(features)} feature(s)')
    else:
        snap = acquire.fetch(cfg.aoi_id, cfg.envelope.as_tuple(), crs=cfg.target_crs,
                             refetch=args.refetch)
        features = snap.features()
        snapshot_dir = snap.directory
        snapshot_meta = {'fetched_on': snap.fetched_on, 'pages': len(snap.pages),
                         'feature_count': snap.feature_count, 'truncated': snap.truncated,
                         'directory': snap.directory.name}
        print(f'· snapshot {snap.fetched_on}: {snap.feature_count} features in {len(snap.pages)} page(s)'
              + ('  ⚠ TRUNCATED' if snap.truncated else ''))

    parcels, stats, rejected = bake(features, cfg)

    # Attribution is stated for the sources this bake actually consumed, not for every source the
    # city config knows about. The imagery source is real and licensed, but nothing here reads a
    # tile yet, and an attribution line for data that is not on screen is noise at best.
    # As-built footprints. The DDA layer says what may be built; OSM says what is standing.
    # Fetched once into the same immutable snapshot as the parcels, so a rebuild reads the file
    # rather than re-querying a public Overpass instance.
    built, built_rejected = [], []
    if snapshot_dir is not None:
        osm_path = snapshot_dir / 'osm-buildings.json'
        if not osm_path.exists():
            try:
                osm_path.write_text(json.dumps(buildings.fetch(cfg.envelope.as_tuple()),
                                               separators=(',', ':')))
            except Exception as e:
                print(f'· OSM buildings unavailable ({e}); the district falls back to permitted massing only')
        if osm_path.exists():
            index = [(p.id, Polygon(p.plot[0][0], p.plot[0][1:]), p.height.metres) for p in parcels]
            built, built_rejected = buildings.parse(
                json.loads(osm_path.read_text()), cfg.origin, cfg.floor_height_m, index)
            surveyed = sum(1 for x in built if x.height_source.startswith('osm'))
            ceiling = sum(1 for x in built if x.height_source == 'dda:permitted')
            print(f'· as-built: {len(built)} OSM footprints — {surveyed} surveyed height, '
                  f'{ceiling} dominant structures at the permitted ceiling, '
                  f'{len(built) - surveyed - ceiling} shape only')

    # Residual land value for every parcel, from the snapshot already on disk. Same engine as the
    # study path, so a parcel's colour here and its number there cannot disagree.
    values = value.appraise_all(features)
    priced = [v for v in values.values() if v.rlv_psf_land is not None]
    print(f'· value: {len(priced)} of {len(values)} parcels priced, '
          f'{len(values) - len(priced)} withheld with a reason')

    stats.built_count = len(built)
    stats.built_with_surveyed_height = sum(1 for x in built if x.height_source.startswith('osm'))
    stats.built_at_permitted_ceiling = sum(1 for x in built if x.height_source == 'dda:permitted')
    stats.built_shape_only = sum(1 for x in built if x.height_m is None)
    stats.built_footprint_sqm = round(sum(x.area_sqm for x in built), 1)
    stats.parcels_with_a_building = len({x.plot_id for x in built if x.plot_id})
    stats.priced = len(priced)
    stats.withheld = len(values) - len(priced)
    stats.hypothetical = sum(1 for v in priced if v.hypothetical)
    if priced:
        psf = sorted(v.rlv_psf_land for v in priced)
        stats.rlv_psf_land = {
            'min': round(psf[0], 1),
            'median': round(psf[len(psf) // 2], 1),
            'max': round(psf[-1], 1),
        }

    # Imagery: tile references only, computed from the AOI. No image bytes are downloaded or
    # stored -- the browser fetches them from Esri, which is what Esri's terms contemplate.
    imagery = district_tiles(cfg.envelope.as_tuple(), cfg.origin)
    print(f'· imagery: {len(imagery["tiles"])} tiles at z{imagery["zoom"]} '
          f'({imagery["resolution_m_px"]} m/px), fetched by the browser')

    # Sun: computed for the AOI's own latitude and longitude at a fixed stated moment, so the
    # shadows fall where Dubai's do and a rebuild does not silently re-light the district.
    lon, lat = _TO_WGS84.transform(*cfg.origin)
    sun = solar_position(lat, lon, default_moment())
    sun['direction_enu'] = scene_direction(sun['azimuth_deg'], sun['elevation_deg'])
    # The AOI's own coordinates travel with the sun record so the viewer can recompute the
    # position for any hour of the same day, with the same algorithm, instead of tweening
    # between two baked directions and calling it a sun.
    sun['lat'], sun['lon'] = round(lat, 6), round(lon, 6)
    sun['utc_offset_hours'] = 4
    sun['date'] = default_moment().date().isoformat()
    print(f'· sun: {sun["azimuth_deg"]}° azimuth, {sun["elevation_deg"]}° elevation at {sun["when"]}')

    used_ids = ['dda-parcels', 'esri-world-imagery'] + (['osm-buildings'] if built else [])
    used = [s for s in cfg.sources if s['id'] in used_ids]
    attribution = [s['attribution'] for s in used if s.get('attribution')]

    manifest = Manifest(
        city=cfg.city,
        aoi_id=cfg.aoi_id,
        aoi_name=cfg.aoi_name,
        built_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
        basis=cfg.basis.get('value', 'permitted'),
        basis_statement=cfg.basis.get('statement', ''),
        source_crs=cfg.target_crs,
        target_crs=cfg.target_crs,
        origin=list(cfg.origin),
        axis_convention=cfg.axis_convention,
        units=cfg.units,
        vertical=cfg.vertical,
        lod=cfg.lod.get('level', 'LOD1'),
        floor_height_m=cfg.floor_height_m,
        height_chain=cfg.raw['height']['chain'],
        sources=cfg.sources,
        attribution=attribution,
        snapshot=snapshot_meta,
        stats=stats,
        rejected=rejected,
    )

    out = OUT_DIR / cfg.aoi_id
    out.mkdir(parents=True, exist_ok=True)
    district = {
        'aoi': {'id': cfg.aoi_id, 'name': cfg.aoi_name,
                'extent_m': [cfg.envelope.xmax - cfg.envelope.xmin,
                             cfg.envelope.ymax - cfg.envelope.ymin]},
        'crs': cfg.target_crs,
        'origin': list(cfg.origin),
        'axis_convention': cfg.axis_convention,
        'units': cfg.units,
        'basis': manifest.basis,
        'ground_elevation_m': cfg.vertical.get('ground_elevation_m', 0.0),
        'attribution': attribution,
        'sun': sun,
        'imagery': imagery,
        'parcels': [dict(p.to_json(), value=values[p.id].to_json() if p.id in values else None)
                    for p in parcels],
        'buildings': [b.to_json() for b in built],
    }
    (out / 'district.json').write_text(json.dumps(district, separators=(',', ':')))
    (out / 'manifest.json').write_text(json.dumps(manifest.to_json(), indent=2))
    (out / 'report.md').write_text(report(manifest))

    size = (out / 'district.json').stat().st_size / 1e6
    print(f'· baked {stats.kept} parcels — {stats.solid} buildings, {stats.outlined} outlines, '
          f'{stats.rejected} rejected')
    print(f'· heights: ' + ', '.join(f'{k} {v}' for k, v in stats.by_height_provenance.items()))
    print(f'· out/{cfg.aoi_id}/district.json ({size:.2f} MB), manifest.json, report.md')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
