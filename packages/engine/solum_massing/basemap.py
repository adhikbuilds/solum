"""
Real Dubai imagery under the massing model.

Until now the scheme stood on an abstract grid, which is the difference between a model and a
site: you cannot see the road it faces, the plot next door, or that half the block is still sand.

The one thing to get right is the projection, and the rule is narrow: **reproject for display
only.** DDA publishes in wkid 3997 (Dubai Local Transverse Mercator), plain metres, and every
setback, envelope and plate calculation depends on that -- a 10 m offset means 10 m everywhere.
Satellite tiles are served in Web Mercator, whose units are degrees-derived and stretch with
latitude. Redo the geometry in that and the numbers quietly go wrong.

So the massing maths never leaves 3997. Only the tile corners cross over, and they cross the other
way: each tile's Web Mercator bounds are converted back into 3997 metres and then into the scene's
local frame, so the imagery is fitted to the model rather than the model being fitted to the
imagery.

Tiles come from Esri's World Imagery cache, which needs no key and sends
`Access-Control-Allow-Origin: *`, so the browser loads them directly and this service never
proxies an image.
"""

from __future__ import annotations

import math

from pyproj import Transformer
from shapely.geometry.base import BaseGeometry

TILE_URL = (
    'https://services.arcgisonline.com/ArcGIS/rest/services/'
    'World_Imagery/MapServer/tile/{z}/{y}/{x}'
)

# Esri's terms require the source to be named wherever the imagery is shown.
ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics'

# z=18 is ~0.6 m/px at this latitude -- enough to read kerbs and parking bays without pulling a
# large number of tiles. z=19 doubles the count for detail the massing does not need.
DEFAULT_ZOOM = 18

# Beyond this many tiles the fetch stops being worth it; the ring is trimmed rather than refused.
MAX_TILES = 36

_TO_WGS84 = Transformer.from_crs(3997, 4326, always_xy=True)
_FROM_WGS84 = Transformer.from_crs(4326, 3997, always_xy=True)


def _lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return x, y


def _tile_to_lonlat(x: int, y: int, z: int) -> tuple[float, float]:
    """North-west corner of tile (x, y)."""
    n = 2 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def basemap_tiles(
    parcel: BaseGeometry, cx: float, cy: float, radius_m: float, zoom: int = DEFAULT_ZOOM,
) -> dict | None:
    """
    Tiles covering `radius_m` around the parcel, each with its footprint in scene-local metres.

    Every tile is returned as its four corners already in the scene's frame, so the viewer draws a
    quad and applies a texture -- no projection maths in the browser, and no assumption that a tile
    is axis-aligned once it lands in 3997 (it very nearly is at this scale, but "very nearly" is
    not something to hard-code).
    """
    if parcel.is_empty or radius_m <= 0:
        return None

    lon, lat = _TO_WGS84.transform(parcel.centroid.x, parcel.centroid.y)
    x0, y0 = _lonlat_to_tile(lon, lat, zoom)

    # Tile edge in metres at this latitude, used only to decide how many tiles to reach for.
    edge_m = 40075016.686 * math.cos(math.radians(lat)) / (2 ** zoom)
    reach = max(1, math.ceil(radius_m / edge_m))
    while (2 * reach + 1) ** 2 > MAX_TILES and reach > 1:
        reach -= 1

    tiles = []
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            tx, ty = x0 + dx, y0 + dy
            nw_lon, nw_lat = _tile_to_lonlat(tx, ty, zoom)
            se_lon, se_lat = _tile_to_lonlat(tx + 1, ty + 1, zoom)
            # Corners in scene-local metres: local x is easting, local z is NEGATED northing, the
            # same mapping the extruded geometry uses (shape-plane y -> world -z).
            corners = []
            for lo, la in ((nw_lon, nw_lat), (se_lon, nw_lat), (se_lon, se_lat), (nw_lon, se_lat)):
                e, n = _FROM_WGS84.transform(lo, la)
                corners.append([e - cx, -(n - cy)])
            tiles.append({
                'url': TILE_URL.format(z=zoom, x=tx, y=ty),
                'corners': corners,   # NW, NE, SE, SW in local metres
            })

    return {'zoom': zoom, 'attribution': ATTRIBUTION, 'tiles': tiles}
