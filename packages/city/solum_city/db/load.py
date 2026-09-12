"""
The dated snapshot, into Postgres.

    python -m solum_city.db.load                 # newest snapshot for the configured AOI
    python -m solum_city.db.load --aoi dubai-all --warm

Three things this does that the file pipeline could not.

**It keeps both geometries.** The 4326 ring is what tiles are cut from; the 3997 ring is what the
engine computes in. `geojson()` threw the metric geometry away the moment it reprojected, which
meant the appraisal could only ever be re-run from the raw JSON. Here both land in columns, and
the rule -- reproject for display only -- becomes something a schema enforces rather than a
comment asks for.

**It reads the snapshot, not the derived files.** `plots.geojsonl` is already reprojected and
already lossy. Loading from `raw/<aoi>/<date>/` means the database holds what DDA actually sent.

**It is idempotent per snapshot.** A snapshot is dated and immutable, so loading the same one
twice replaces its rows rather than doubling them, and the tile cache keyed on that snapshot is
dropped in the same transaction. A cache that outlives its load serves yesterday's city.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]

from solum_city.pipeline.city import (
    _clean, _height, _mass_one, _rings, _value, PRECISION,
)
from solum_city.sources import parcels

SCHEMA = Path(__file__).resolve().parent / 'schema.sql'
# The container sets SOLUM_DSN; a developer on the host gets the published port. Reading the
# environment first is what makes `docker compose run --rm loader` work without arguments --
# it was passing SOLUM_DSN and this file was ignoring it in favour of localhost.
DEFAULT_DSN = os.environ.get('SOLUM_DSN', 'postgresql://solum:solum@localhost:5434/solum')

_TO_WGS84 = Transformer.from_crs(3997, 4326, always_xy=True)

# 30 m is a third of a pixel at z10 and still under one at z12, so generalising to it cannot
# change what the overview looks like. Above z12 the full geometry is used.
LO_TOLERANCE_M = 30

def _wkt(rings: list[list[list[float]]]) -> str:
    """GeoJSON-style rings to WKT. Postgres parses this far faster than GeoJSON text."""
    parts = []
    for ring in rings:
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        parts.append('(' + ','.join(f'{x} {y}' for x, y in ring) + ')')
    return 'POLYGON(' + ','.join(parts) + ')'

def _esri_rings(geometry: dict) -> list[list[list[float]]] | None:
    rings = (geometry or {}).get('rings')
    return [r for r in rings if len(r) >= 4] if rings else None

def load(dsn: str, aoi: str, *, warm: bool = False, snapshot=None,
         massing_features=None) -> int:
    """
    Load one acquisition into Postgres.

    `snapshot` overrides the on-disk lookup. It only has to answer `.fetched_on`,
    `.feature_count`, `.source` and `.features()` -- which is how `solum_city.db.seed` feeds a committed
    JSON file through exactly this path instead of maintaining a second, divergent loader.
    """
    snap = snapshot or parcels.latest(aoi)
    if snap is None:
        print(f'! no snapshot on disk for {aoi}; run `python -m solum_city.pipeline.city fetch`')
        return 1

    print(f'· {aoi} snapshot {snap.fetched_on}: {snap.feature_count:,} features')
    features = snap.features()

    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA.read_text())

            cur.execute(
                """INSERT INTO snapshots (aoi, fetched_on, feature_count, source)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (aoi, fetched_on) DO UPDATE
                     SET feature_count = EXCLUDED.feature_count,
                         source = EXCLUDED.source,
                         loaded_at = now()
                   RETURNING id""",
                (aoi, snap.fetched_on, snap.feature_count, Jsonb(snap.source)),
            )
            snapshot_id = cur.fetchone()[0]

            # Reloading a snapshot replaces it. Dated and immutable on disk means dated and
            # replaceable here -- and the cache cut from it goes with it, in the same transaction.
            cur.execute('DELETE FROM tile_cache WHERE snapshot_id = %s', (snapshot_id,))
            cur.execute('DELETE FROM massing   WHERE snapshot_id = %s', (snapshot_id,))
            cur.execute('DELETE FROM plots     WHERE snapshot_id = %s', (snapshot_id,))

            seen: set[str] = set()
            rows = []
            for feat in features:
                props = feat.get('attributes') or {}
                plot = props.get('PLOT_NUMBER')
                key = str(plot) if plot not in (None, '') else f'oid-{props.get("OBJECTID")}'
                if key in seen:
                    continue
                metric = _esri_rings(feat.get('geometry') or {})
                display = _rings(feat.get('geometry') or {})
                if not metric or not display:
                    continue
                seen.add(key)

                h, src = _height(props, 3.2)
                v = _value(feat, props)
                rows.append((
                    key, snapshot_id, str(plot or key),
                    _clean(props.get('LAND_NAME')), _clean(props.get('PROJECT_NAME')),
                    props.get('AREA_SQFT'), props.get('GFA_SQFT'),
                    _clean(props.get('MAX_HEIGHT_FLOORS')),
                    h, src,
                    _clean(props.get('CONSTRUCTION_STATUS')),
                    _clean(props.get('MAIN_LANDUSE')), _clean(props.get('LANDUSE_DETAILS')),
                    v.get('rlv'), v.get('rlv_psf'), v['rlv_verdict'], v.get('rlv_why'),
                    v.get('fixed_cost_share'),
                    _wkt(display), _wkt([[[round(x, 3), round(y, 3)] for x, y in r] for r in metric]),
                ))

            print(f'· inserting {len(rows):,} plots')
            with cur.copy(
                """COPY plots (id, snapshot_id, plot_number, land_name, project,
                               area_sqft, gfa_sqft, floors, height_m, height_src,
                               status, land_use, use_detail,
                               rlv, rlv_psf, rlv_verdict, rlv_why, fixed_cost_share,
                               geom_4326, geom_3997)
                   FROM STDIN"""
            ) as copy:
                for r in rows:
                    copy.write_row(r)

            # The WKT arrived as text in a geometry column; Postgres took it as 4326/3997 only
            # because the column says so. Stated explicitly rather than relied upon.
            cur.execute('UPDATE plots SET geom_4326 = ST_SetSRID(geom_4326, 4326), '
                        'geom_3997 = ST_SetSRID(geom_3997, 3997) WHERE snapshot_id = %s',
                        (snapshot_id,))
            cur.execute(
                'UPDATE plots SET geom_lo = ST_SimplifyPreserveTopology('
                '  ST_Transform(geom_4326, 3857), %s) WHERE snapshot_id = %s',
                (LO_TOLERANCE_M, snapshot_id))

            _load_massing(cur, snapshot_id, aoi, features=massing_features)
            cur.execute('ANALYZE plots'); cur.execute('ANALYZE massing')

        conn.commit()

    print('· committed')
    if warm:
        from solum_city.db.tiles import warm as warm_tiles
        warm_tiles(dsn, aoi)
    return 0

def _load_massing(cur, snapshot_id: int, aoi: str, features=None) -> None:
    """
    The derived scheme -- from `features` when the caller has them (the seed bakes its own,
    1,078 plots being seconds of work), otherwise from the file the massing stage wrote.

    Deliberately not recomputed here: `python -m solum_city.pipeline.city massing` is a twenty-minute
    parallel bake, and making a database load depend on it would mean every load pays for it. If
    the file is absent the tables simply carry no schemes and the map falls back to flat plots.
    """
    if features is None:
        path = ROOT / 'out' / aoi / 'massing.geojsonl'
        if not path.exists():
            print(f'· no massing.geojsonl for {aoi}; skipping schemes '
                  f'(run `python -m solum_city.pipeline.city massing`)')
            return
        features = (json.loads(line) for line in path.open())

    n = 0
    with cur.copy(
        """COPY massing (snapshot_id, plot_number, kind, base_m, top_m, floors,
                         land_use, status, geom_4326) FROM STDIN"""
    ) as copy:
        for f in features:
            p = f['properties']
            copy.write_row((
                snapshot_id, p['plot'], p['kind'], p['base_m'], p['top_m'],
                p.get('floors'), p.get('use'), p.get('status'),
                _wkt(f['geometry']['coordinates']),
            ))
            n += 1
    cur.execute('UPDATE massing SET geom_4326 = ST_SetSRID(geom_4326, 4326) '
                'WHERE snapshot_id = %s', (snapshot_id,))
    print(f'· {n:,} massing volumes')

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dsn', default=DEFAULT_DSN)
    ap.add_argument('--aoi', default='dubai-all')
    ap.add_argument('--warm', action='store_true',
                    help='build the z8-12 overview tiles after loading (~51 tiles, ~10 s)')
    a = ap.parse_args(argv)
    return load(a.dsn, a.aoi, warm=a.warm)

if __name__ == '__main__':
    raise SystemExit(main())
