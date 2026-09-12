"""
Real ground under the district.

Without imagery a district of extruded plots reads as a diagram: correct, and floating. With it,
the road the block faces, the creek, the parked cars and the half of the site that is still sand
are all visible below the massing, and the model reads as a place.

This is `solum_massing.basemap` widened from a plot to a district, and deliberately **not**
importing it. That module is a study-scale helper, capped at 36 tiles around one parcel (about
800 m at z18 -- half this AOI), and it is also the working file of another change in flight. The
tile maths is thirty lines; re-stating it here keeps the city base a self-contained subtree that
can be built, moved or published without dragging an unrelated module along.

The rule it does carry over is the one that matters: **reproject for display only.** The massing
never leaves EPSG:3997. Only tile corners cross over, and they cross the other way -- each tile's
Web Mercator bounds are converted back into 3997 metres and then into the local frame, so the
imagery is fitted to the model rather than the model to the imagery.

No image bytes are downloaded or stored. The manifest records the tile URLs; the browser fetches
them directly from Esri, which is what Esri's terms contemplate and the reason `raw/` stays
parcels-only.
"""

from __future__ import annotations

import math

from pyproj import Transformer

# Esri's World Imagery cache needs no key and sends `Access-Control-Allow-Origin: *`, so the
# browser loads tiles directly and nothing here ever proxies or stores an image.
TILE_URL = (
    'https://services.arcgisonline.com/ArcGIS/rest/services/'
    'World_Imagery/MapServer/tile/{z}/{y}/{x}'
)
# Esri's terms require the source named wherever the imagery is shown.
ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics'

_TO_WGS84 = Transformer.from_crs(3997, 4326, always_xy=True)
_FROM_WGS84 = Transformer.from_crs(4326, 3997, always_xy=True)


def _lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    lat_rad = math.radians(lat)
    return (int((lon + 180.0) / 360.0 * n),
            int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n))


def _tile_to_lonlat(x: int, y: int, z: int) -> tuple[float, float]:
    """North-west corner of tile (x, y)."""
    n = 2 ** z
    return (x / n * 360.0 - 180.0,
            math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))))

# A district's worth of tiles the browser fetches in parallel. The budget exists to pick a zoom,
# not to save bandwidth: dropping from z18 to z17 halves the ground resolution across the whole
# district to save a few megabytes on a local demo, which is the wrong trade. 420 keeps z18
# (0.54 m/px -- kerbs and parking bays legible) over the padded extent.
TILE_BUDGET = 420
MAX_ZOOM = 18
MIN_ZOOM = 13


def _tile_edge_m(lat: float, zoom: int) -> float:
    return 40075016.686 * math.cos(math.radians(lat)) / (2 ** zoom)


def choose_zoom(envelope: tuple[float, float, float, float], lat: float,
                budget: int = TILE_BUDGET) -> int:
    """The finest zoom whose tile count over this extent still fits the budget."""
    xmin, ymin, xmax, ymax = envelope
    for z in range(MAX_ZOOM, MIN_ZOOM - 1, -1):
        edge = _tile_edge_m(lat, z)
        if (math.ceil((xmax - xmin) / edge) + 1) * (math.ceil((ymax - ymin) / edge) + 1) <= budget:
            return z
    return MIN_ZOOM


def district_tiles(envelope: tuple[float, float, float, float], origin: tuple[float, float],
                   *, zoom: int | None = None, budget: int = TILE_BUDGET,
                   pad_m: float = 450.0) -> dict:
    """
    Tiles covering the AOI, each with its four corners in the local plan frame (east, north).

    Corners are given in the same frame as the baked geometry -- the renderer's single
    `rotateX(-PI/2)` then puts imagery and buildings on the same ground, with no projection maths
    in the browser and no assumption that a Web Mercator tile stays axis-aligned once it lands in
    3997. At this latitude it very nearly does; "very nearly" is not something to hard-code.
    """
    # Imagery runs past the AOI on every side. A district whose ground stops exactly where its
    # parcels stop reads as a model on a table -- the eye needs the city to continue past the
    # edge of what is modelled, even when nothing is modelled out there.
    xmin, ymin, xmax, ymax = (envelope[0] - pad_m, envelope[1] - pad_m,
                              envelope[2] + pad_m, envelope[3] + pad_m)
    lon_c, lat_c = _TO_WGS84.transform((xmin + xmax) / 2, (ymin + ymax) / 2)
    z = zoom or choose_zoom((xmin, ymin, xmax, ymax), lat_c, budget)

    # The AOI is a rectangle in 3997; its corners in tile space bound the range to fetch.
    lon_w, lat_s = _TO_WGS84.transform(xmin, ymin)
    lon_e, lat_n = _TO_WGS84.transform(xmax, ymax)
    x0, y0 = _lonlat_to_tile(lon_w, lat_n, z)      # north-west
    x1, y1 = _lonlat_to_tile(lon_e, lat_s, z)      # south-east

    tiles = []
    for ty in range(min(y0, y1), max(y0, y1) + 1):
        for tx in range(min(x0, x1), max(x0, x1) + 1):
            nw_lon, nw_lat = _tile_to_lonlat(tx, ty, z)
            se_lon, se_lat = _tile_to_lonlat(tx + 1, ty + 1, z)
            corners = []
            for lo, la in ((nw_lon, nw_lat), (se_lon, nw_lat), (se_lon, se_lat), (nw_lon, se_lat)):
                e, n = _FROM_WGS84.transform(lo, la)
                corners.append([round(e - origin[0], 2), round(n - origin[1], 2)])
            tiles.append({'url': TILE_URL.format(z=z, x=tx, y=ty), 'corners': corners})

    return {
        'zoom': z,
        'resolution_m_px': round(_tile_edge_m(lat_c, z) / 256, 2),
        'attribution': ATTRIBUTION,
        'frame': 'local plan metres (east, north) from origin — NW, NE, SE, SW',
        'fetched_by': 'browser',
        'tiles': tiles,
    }
