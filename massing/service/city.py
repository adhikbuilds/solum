"""
The city surface: tiles, search and the manifest, all from Postgres.

This is what `twin/web/serve.py` used to be, moved into the one backend and rewritten against a
database instead of three generated files. Two of those files simply stop existing:

  `plots.pmtiles`      -> tiles cut on request by `twin.db.tiles`, cached in Postgres
  `plots-index.json`   -> `WHERE plot_number = %s`, which is 3.2 MB of process memory reclaimed
                          and, unlike the file, can also answer "which plots in this area".

The appraisal endpoint is unchanged and still fetches the plot live from DDA. That is deliberate:
the map's numbers are a fast offline derivation over a dated snapshot, and the study is the
answer. Serving the study from the same snapshot would make them agree by construction and hide
exactly the disagreement a user needs to see.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from psycopg_pool import ConnectionPool

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from twin.db import tiles as tilesvc                                    # noqa: E402
from twin.web.study import appraise_plot                                # noqa: E402

DSN = os.environ.get('SOLUM_DSN', 'postgresql://solum:solum@localhost:5434/solum')
AOI = os.environ.get('SOLUM_AOI', 'dubai-all')

router = APIRouter()

# One pool for the process. Tiles are short reads and the study path does no database work at all,
# so a small pool is the right size -- the blocking call in this service is still DDA, not PG.
_pool = ConnectionPool(DSN, min_size=1, max_size=8, open=False, kwargs={'autocommit': False})


SCHEMA = Path(__file__).resolve().parents[1] / 'twin' / 'db' / 'schema.sql'


def startup() -> None:
    """
    Open the pool, and make sure the tables exist before anything asks for them.

    The schema used to be applied only by the loader, which meant a freshly-started stack with an
    empty database answered every city route with a 500 from `UndefinedTable` -- not the "run the
    loader" message the UI was written to show. A backend that cannot come up against an empty
    database is a deployment trap: the first thing a new environment does is start empty.

    `schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS` throughout), so this is safe on every
    boot and costs milliseconds.
    """
    _pool.open()
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(SCHEMA.read_text())
            conn.commit()
    except Exception as e:
        # Not fatal. The study path needs no database at all, and a backend that refuses to serve
        # it because Postgres is slow to accept connections is worse than one that says so here.
        print(f'! schema not applied at startup: {e}')


def shutdown() -> None:
    _pool.close()


NOT_LOADED = ('no snapshot loaded for {aoi}. Run `docker compose run --rm loader` '
              '(about 35 seconds for 100,215 plots).')


def _snapshot() -> int:
    """
    The newest loaded snapshot, or a 503 that says what to do about it.

    503 and not 500: an empty database is a state this service is expected to be in, not a fault
    in it. The distinction is what lets the UI show an instruction instead of a stack trace.
    """
    try:
        with _pool.connection() as conn:
            snap = tilesvc.snapshot_id(conn, AOI)
    except Exception as e:
        raise HTTPException(503, f'database not ready: {e}') from e
    if snap is None:
        raise HTTPException(503, NOT_LOADED.format(aoi=AOI))
    return snap


@router.get('/api/city/manifest')
def manifest() -> dict:
    """
    What the map needs to describe itself: counts, provenance, coverage, attribution.

    Every figure is a query rather than a number baked into a file, so the panel cannot drift
    from the data it is describing -- which is what happened when `tiles-manifest.json` was
    written by one stage and the massing by another, and the panel could not say how many plots
    had a scheme.
    """
    snap = _snapshot()
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute('SELECT fetched_on FROM snapshots WHERE id = %s', (snap,))
        fetched_on = cur.fetchone()[0]

        cur.execute('SELECT height_src, count(*) FROM plots WHERE snapshot_id=%s GROUP BY 1', (snap,))
        height = {k: v for k, v in cur.fetchall()}
        cur.execute('SELECT rlv_verdict, count(*) FROM plots WHERE snapshot_id=%s GROUP BY 1', (snap,))
        verdict = {k: v for k, v in cur.fetchall()}
        cur.execute('SELECT count(*), count(DISTINCT plot_number) FROM massing WHERE snapshot_id=%s', (snap,))
        volumes, massed = cur.fetchone()
        cur.execute('SELECT count(*) FROM plots WHERE snapshot_id=%s', (snap,))
        plots = cur.fetchone()[0]
        cur.execute(
            'SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e) FROM '
            '(SELECT ST_Extent(geom_4326) e FROM plots WHERE snapshot_id=%s) q', (snap,))
        bounds = list(cur.fetchone())
        cur.execute(
            'SELECT round(min(rlv_psf)), '
            '       round(percentile_cont(0.10) WITHIN GROUP (ORDER BY rlv_psf)), '
            '       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY rlv_psf)), '
            '       round(percentile_cont(0.90) WITHIN GROUP (ORDER BY rlv_psf)), '
            '       round(max(rlv_psf)), '
            '       count(*) FILTER (WHERE rlv_psf < 0), '
            '       count(*) FILTER (WHERE fixed_cost_share > 0.5) '
            'FROM plots WHERE snapshot_id=%s AND rlv_psf IS NOT NULL', (snap,))
        lo, p10, mid, p90, hi, negative, fixed_dominated = cur.fetchone()

    return {
        'aoi': AOI,
        'snapshot': str(fetched_on),
        'plots': plots,
        'height_provenance': {k: height.get(k, 0) for k in
                              ('authority', 'derived', 'assumption', 'unavailable')},
        'value_verdict': {k: verdict.get(k, 0) for k in ('priced', 'hypothetical', 'withheld')},
        # The number the panel could not report before: how many plots actually got a scheme.
        'massing': {'plots': massed, 'volumes': volumes},
        # The percentiles, not just the extremes. A colour ramp built on min/max alone put 92%
        # of this city below its own first stop and rendered as one flat colour -- the legend
        # said "a scale" and the map showed "everything is at the bottom".
        'rlv_psf': {'min': float(lo or 0), 'p10': float(p10 or 0), 'median': float(mid or 0),
                    'p90': float(p90 or 0), 'max': float(hi or 0),
                    'negative': negative, 'fixed_dominated': fixed_dominated},
        'bounds': [float(b) for b in bounds],
        **STATIC_BASIS,
    }


@router.get('/api/city/tiles/{layer}/{z}/{x}/{y}.mvt')
def tile(layer: str, z: int, x: int, y: int) -> Response:
    """
    One vector tile, gzipped in the cache and passed straight through.

    The body is stored compressed, so this sets `Content-Encoding` and does no work per request.
    An empty tile is a 204: most of the Dubai bbox is desert or another authority's jurisdiction,
    and a zero-length 200 makes MapLibre log a parse warning for every one of them.
    """
    if layer not in tilesvc.LAYERS:
        raise HTTPException(404, f'no layer {layer!r}')
    if not (0 <= z <= 22) or not (0 <= x < (1 << z)) or not (0 <= y < (1 << z)):
        raise HTTPException(400, 'tile out of range')

    snap = _snapshot()
    with _pool.connection() as conn:
        body = tilesvc.tile(conn, layer, z, x, y, snap)
    if not body:
        return Response(status_code=204)
    return Response(
        content=body,
        media_type='application/vnd.mapbox-vector-tile',
        headers={
            'Content-Encoding': 'gzip',
            # The snapshot is immutable, so the tile for a given snapshot is too. It is the
            # snapshot id in the ETag that makes a reload after a re-ingest fetch fresh tiles.
            'ETag': f'"{snap}-{layer}-{z}-{x}-{y}"',
            'Cache-Control': 'public, max-age=86400',
        },
    )


@router.get('/api/city/locate/{plot_number}')
def locate(plot_number: str) -> dict:
    """Where a plot is, so the map can fly to it. Display only; the study re-fetches in 3997."""
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT plot_number, ST_X(ST_PointOnSurface(geom_4326)), '
            '       ST_Y(ST_PointOnSurface(geom_4326)), land_name '
            'FROM plots WHERE plot_number = %s AND snapshot_id = %s LIMIT 1',
            (plot_number.strip(), _snapshot()))
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, f'plot {plot_number} is not in the {AOI} snapshot')
    return {'plot_number': row[0], 'lon': row[1], 'lat': row[2], 'land_name': row[3]}


@router.get('/api/city/search')
def search(q: str = '', limit: int = 12) -> dict:
    """
    Prefix search over plot numbers and land names.

    The file-backed index could only answer "where is exactly this plot number". A user who knows
    the area but not the number -- which is most of them -- had nothing to type.
    """
    q = q.strip()
    if len(q) < 2:
        return {'results': []}
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT plot_number, land_name, land_use, rlv_psf, rlv_verdict,
                      ST_X(ST_PointOnSurface(geom_4326)), ST_Y(ST_PointOnSurface(geom_4326))
               FROM plots
               WHERE snapshot_id = %s AND (plot_number LIKE %s OR land_name ILIKE %s)
               ORDER BY (plot_number = %s) DESC, plot_number
               LIMIT %s""",
            (_snapshot(), f'{q}%', f'%{q}%', q, min(limit, 50)))
        rows = cur.fetchall()
    return {'results': [
        {'plot_number': r[0], 'land_name': r[1], 'use': r[2], 'rlv_psf': float(r[3]) if r[3] else None,
         'rlv_verdict': r[4], 'lon': r[5], 'lat': r[6]} for r in rows]}


@router.get('/api/city/plot/{plot_number}')
def plot_record(plot_number: str) -> dict:
    """The stored record for one plot -- what the tile carries, without needing the tile."""
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT plot_number, land_name, project, area_sqft, gfa_sqft, floors,
                      height_m, height_src, status, land_use, use_detail,
                      rlv, rlv_psf, rlv_verdict, rlv_why
               FROM plots WHERE plot_number = %s AND snapshot_id = %s""",
            (plot_number.strip(), _snapshot()))
        row = cur.fetchone()
        if row is None:
            raise HTTPException(404, f'plot {plot_number} is not in the {AOI} snapshot')
        cols = ('plot_number', 'land_name', 'project', 'area_sqft', 'gfa_sqft', 'floors',
                'height_m', 'height_src', 'status', 'land_use', 'use_detail',
                'rlv', 'rlv_psf', 'rlv_verdict', 'rlv_why')
        rec = {c: (float(v) if isinstance(v, (int, float)) and c not in ('floors',) else v)
               for c, v in zip(cols, row)}
        cur.execute(
            'SELECT kind, base_m, top_m FROM massing WHERE plot_number = %s AND snapshot_id = %s '
            'ORDER BY base_m', (plot_number.strip(), _snapshot()))
        rec['massing'] = [{'kind': k, 'base_m': float(b), 'top_m': float(t)}
                          for k, b, t in cur.fetchall()]
    return rec


@router.get('/api/city/appraise/{plot_number}')
def appraise(plot_number: str, optimistic: bool = False) -> dict:
    """
    The full study, solved live from DDA -- not from the snapshot.

    The map's RLV is a fast derivation over a dated acquisition. This re-fetches the plot, insets
    the setbacks from the real edges and fits the plate to the site axis, all in EPSG:3997. Where
    the two disagree, this one is the answer, and serving it from the snapshot instead would make
    them agree by construction and hide the disagreement.
    """
    try:
        return appraise_plot(plot_number, conservative=not optimistic)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f'DDA lookup failed: {e}') from e


# Coverage and the basis statements are properties of the source, not of a load, so they are not
# in the database. They change when the jurisdiction split is re-measured, which is a research
# act with a date on it -- and that date is in the text.
STATIC_BASIS = {
    'basis': {
        'value': 'permitted',
        'statement': (
            'Every height on this map is what DDA PERMITS, not what is standing. '
            'CONSTRUCTION_STATUS travels with each plot so the two can be told apart, but it '
            'never changes the height.'
        ),
    },
    'value_basis': {
        # Written after the whole city went through the engine for the first time. The DHCC
        # district it was validated on is towers and institutional plots; Dubai is mostly villas.
        'calibration_warning': (
            'The cost model carries AED 3.5 m of FIXED soft cost (authorities 2.0 m, landscape '
            '1.0 m, misc 0.5 m). That is 4-5% of a tower scheme and 70-77% of a villa scheme, so '
            'small plots price deeply negative: the median G+2 villa returns -1,298 per sqft of '
            'land, while G+4 and above return +224 to +1,007. This engine was calibrated on '
            'Dubai Healthcare City. Treat any figure whose fixed_cost_share exceeds ~0.5 as a '
            'statement about the cost model, not about the land.'
        ),
        'statement': (
            'Residual land value is what the land is worth to the best scheme the published '
            'envelope allows, solved in EPSG:3997. The unit mix behind it is residential, so a '
            'plot DDA publishes as a non-residential use is priced on the same arithmetic and '
            'flagged HYPOTHETICAL -- it answers what the land would be worth if it were built '
            'residential, which is not what is permitted there.'
        ),
    },
    'coverage': {
        'measured': '2026-08-29',
        'shares': {'dda': 44.8, 'trakhees': 30.4, 'dubai_municipality': 18.1,
                   'dubai_south': 4.2, 'dso': 2.4},
        'statement': (
            "Share of Dubai's 3,039 RERA-registered projects by governing authority. Areas "
            'governed by another authority carry no plots and are drawn as nothing -- never '
            'filled, interpolated or inferred.'
        ),
    },
    'attribution': [
        'Plot data: Dubai Development Authority',
        'Basemap © OpenStreetMap contributors, ODbL',
        'Imagery: Esri, Maxar, Earthstar Geographics',
    ],
}
