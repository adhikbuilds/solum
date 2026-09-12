"""
Vector tiles, cut from Postgres on request.

There were two ways to serve 100,215 plots and the choice was not a matter of taste, so it was
measured. Best of 5 on the **densest** tile at each zoom, arm64 PostGIS 3.5 / PG 16, GiST index
on the display geometry:

    z16    6.1 ms     73 KB
    z14   27.8 ms    295 KB
    z12   87.3 ms    908 KB
    z10  511.4 ms   4026 KB

Live `ST_AsMVT` is comfortably fast where the map spends its time and hopeless at the overview.
Generalising the geometry does not rescue z10 (511 -> 304 ms, 4.0 -> 3.4 MB) because the cost
there is 88,000 features in one tile, and dropping features is the one thing this map will not do.

So tiles are computed once and kept. The overview is a *fixed, tiny* set -- 51 tiles across
z8-12, against 2,122 across z13-16 -- which is why warming it costs seconds and why warming the
deep zooms would be pointless.

They are kept **gzipped**. A vector tile compresses to 28-36% of its size (the z10 overview:
4.4 MB -> 1.25 MB), and compressing it costs 124 ms -- far more than the 39 ms it takes to read
the uncompressed blob. Doing that per request would make the cache slower than no cache. Doing it
once, at fill time, and serving the stored bytes under `Content-Encoding: gzip` makes the
overview three and a half times smaller on the wire for nothing.

**This is also the answer to "should this be Redis".** Measured on the cache below: a cached z16
tile is a 1.8 ms primary-key lookup and a cached massing tile is 1.4 ms. Redis might make that
0.3 ms, which is less than the round-trip saved is worth, and it would not touch the only slow
row -- z10 at 39 ms -- because that row is slow from payload size, which Redis would serve just
as slowly. A second stateful service earns its place when it removes a bottleneck that exists.
"""

from __future__ import annotations

import gzip
import os
import time

import psycopg

# Above this zoom the full geometry is used; at or below it, the 30 m generalisation. 30 m is a
# third of a pixel at z10, so the swap cannot change what the overview looks like.
LO_MAX_ZOOM = 12

# The overview: every tile that holds a plot between these zooms. Small enough to build eagerly.
WARM_MIN_ZOOM, WARM_MAX_ZOOM = 8, 12

EXTENT = 4096

LAYERS = {
    # Buffer differs by layer and by intent. Plots want 64 units so a boundary crossing a tile
    # edge still joins up; massing wants the same so a tower straddling an edge is not sliced.
    'plots': {
        'table': 'plots',
        # Every numeric is cast to float8, and that is load-bearing rather than tidy.
        #
        # These columns are NUMERIC in Postgres, which ST_AsMVT encodes as a tile STRING -- it has
        # no arbitrary-precision type to use. The browser then hands `["interpolate", ...]` a
        # string, MapLibre rejects the whole paint expression, and the layer falls back to a flat
        # default: a value choropleth that renders one pale colour under a correct legend.
        'columns': ('id', 'plot_number AS plot', 'land_name AS land',
                    'area_sqft::float8 AS area_sqft', 'gfa_sqft::float8 AS gfa_sqft',
                    'floors', 'height_m::float8 AS height_m', 'height_src', 'status',
                    'land_use AS use', 'use_detail', 'rlv::float8 AS rlv',
                    'rlv_psf::float8 AS rlv_psf', 'rlv_verdict', 'rlv_why',
                    'fixed_cost_share::float8 AS fixed_cost_share'),
        # The overview colours by these and nothing else. Every extra attribute is a string
        # repeated in each of 88,000 features.
        'columns_lo': ('id', 'plot_number AS plot', 'height_m::float8 AS height_m', 'height_src',
                       'status', 'land_use AS use', 'rlv_psf::float8 AS rlv_psf', 'rlv_verdict',
                       'fixed_cost_share::float8 AS fixed_cost_share'),
        'min_zoom': 8,
        'buffer': 64,
    },
    'massing': {
        'table': 'massing',
        'columns': ('plot_number AS plot', 'kind', 'base_m::float8 AS base_m',
                    'top_m::float8 AS top_m', 'floors', 'land_use AS use', 'status'),
        'columns_lo': None,
        # Never drawn below z13.5, so never cut below z13. Carrying 72,000 tower plates down to
        # the whole-emirate zoom would be the heaviest thing in the database for a view that
        # never asks for it.
        'min_zoom': 13,
        'buffer': 64,
    },
}


def _sql(layer: str, z: int) -> tuple[str, str]:
    """(query, geometry column) for this layer at this zoom."""
    spec = LAYERS[layer]
    lo = spec['columns_lo'] is not None and z <= LO_MAX_ZOOM
    cols = spec['columns_lo'] if lo else spec['columns']
    geom = 'geom_lo' if lo else 'ST_Transform(geom_4326, 3857)'
    select = ', '.join(f't.{c}' if ' AS ' not in c and '(' not in c else c for c in cols)
    return (
        f"""
        WITH env AS (SELECT ST_TileEnvelope(%(z)s, %(x)s, %(y)s) AS e)
        SELECT ST_AsMVT(q, %(layer)s, {EXTENT}, 'geom') FROM (
          SELECT {select},
                 ST_AsMVTGeom({geom}, env.e, {EXTENT}, {spec['buffer']}, true) AS geom
          FROM {spec['table']} t, env
          WHERE t.snapshot_id = %(snap)s AND {geom} && env.e
        ) q
        """,
        geom,
    )


def snapshot_id(conn: psycopg.Connection, aoi: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id FROM snapshots WHERE aoi = %s ORDER BY fetched_on DESC LIMIT 1', (aoi,))
        row = cur.fetchone()
    return row[0] if row else None


def tile(conn: psycopg.Connection, layer: str, z: int, x: int, y: int, snap: int) -> bytes:
    """
    One tile, gzipped, from the cache if it is there and into the cache if it is not.

    The snapshot is part of the cache key rather than a column on the row. A tile that outlives
    the load it was cut from would serve yesterday's city under today's numbers, and nothing on
    screen would say so.
    """
    spec = LAYERS.get(layer)
    if spec is None:
        raise KeyError(layer)
    if z < spec['min_zoom']:
        return b''

    with conn.cursor() as cur:
        cur.execute(
            'SELECT body FROM tile_cache WHERE layer=%s AND z=%s AND x=%s AND y=%s AND snapshot_id=%s',
            (layer, z, x, y, snap))
        hit = cur.fetchone()
        if hit is not None:
            return bytes(hit[0])   # already gzipped; the caller sets the header

        query, _ = _sql(layer, z)
        t0 = time.perf_counter()
        cur.execute(query, {'z': z, 'x': x, 'y': y, 'layer': layer, 'snap': snap})
        raw = bytes(cur.fetchone()[0] or b'')
        built_ms = (time.perf_counter() - t0) * 1000
        # Emptiness is tested before compression, not after: gzip of nothing is still ~20 bytes
        # of header, so `if not body` was never true and every empty tile outside Dubai came back
        # as a 200 carrying an empty envelope instead of a 204.
        body = gzip.compress(raw, 6) if raw else b''

        # An empty tile is cached too -- as a zero-length body. Most of the Dubai bbox is desert
        # or another authority's jurisdiction, and recomputing "nothing here" on every pan is the
        # cost this avoids.
        cur.execute(
            """INSERT INTO tile_cache (layer, z, x, y, snapshot_id, body, built_ms)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (layer, z, x, y, snapshot_id) DO NOTHING""",
            (layer, z, x, y, snap, body, round(built_ms, 2)))
        conn.commit()
    return body


def warm(dsn: str, aoi: str = 'dubai-all') -> int:
    """
    Build every overview tile that holds a plot.

    Only z8-12, and only because that range is 51 tiles. The deep zooms are 2,122 tiles that each
    build in 6-50 ms on demand -- warming them would trade ten seconds of startup for two minutes
    and save nothing a user would feel.
    """
    with psycopg.connect(dsn) as conn:
        snap = snapshot_id(conn, aoi)
        if snap is None:
            print(f'! nothing loaded for {aoi}')
            return 1
        with conn.cursor() as cur:
            cur.execute(
                """SELECT z, x, y FROM (
                     SELECT gs AS z,
                            floor((ST_X(c) + 20037508.34) / (2*20037508.34) * (1 << gs))::int AS x,
                            floor((20037508.34 - ST_Y(c)) / (2*20037508.34) * (1 << gs))::int AS y
                     FROM generate_series(%s::int, %s::int) gs,
                          (SELECT ST_Centroid(ST_Transform(geom_4326, 3857)) c
                           FROM plots WHERE snapshot_id = %s) p
                   ) t GROUP BY z, x, y ORDER BY z, x, y""",
                (WARM_MIN_ZOOM, WARM_MAX_ZOOM, snap))
            targets = cur.fetchall()

        t0 = time.perf_counter()
        for z, x, y in targets:
            tile(conn, 'plots', z, x, y, snap)
        print(f'· warmed {len(targets)} overview tiles in {time.perf_counter() - t0:.1f}s')
    return 0


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get(
        'SOLUM_DSN', 'postgresql://solum:solum@localhost:5434/solum'))
    ap.add_argument('--aoi', default='dubai-all')
    raise SystemExit(warm(**vars(ap.parse_args())))
