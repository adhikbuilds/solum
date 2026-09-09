"""
What is actually standing, as opposed to what may be built.

Everything else in this base comes from DDA, and DDA publishes *entitlement*: a plot's permitted
GFA, its storey ceiling, its setbacks. That is the right source for a feasibility tool and the
wrong source for a picture of a city -- massed from it, every plot becomes a box sized by the
regulation rather than a building shaped like itself, and a completed district looks like a
zoning diagram because that is exactly what it is.

OpenStreetMap supplies the missing half: real footprints, surveyed. 493 of them inside this AOI.
So the two are used for what each is good for --

    OSM      the shape of what is built            [relayed: community survey]
    DDA      the height that may be built          [authority]
    OSM      a height where a mapper recorded one  [relayed]

-- and the pairing is what makes the district answer a question neither source can alone: how
much of the permitted envelope is standing, and how much is still air.

Heights are sparse in OSM, as the guide warns: 27 of 493 carry `building:levels` and 8 carry
`height`. So the chain falls back to the permitted height of the parcel a building sits in, and
says so per building. A footprint drawn at its parcel's ceiling is honest only while it is
labelled that way; unlabelled it is the same invented number this repo keeps refusing to make.

Attribution is not optional here. OSM is ODbL, which requires attribution and carries share-alike
obligations on derived databases -- recorded in the city config and asserted by Gate G.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

from solum_massing.dda import Provenance

OVERPASS = 'https://overpass-api.de/api/interpreter'
USER_AGENT = 'Solum city base (OSM buildings for one Dubai district)'
ATTRIBUTION = 'Building footprints: © OpenStreetMap contributors, ODbL'
LICENSE = 'ODbL 1.0 — attribution and share-alike on derived databases'

# OSM tags to metres. `height` is in metres by convention; `building:levels` is a storey count,
# multiplied by the same floor-to-floor the DDA heights use so the two are comparable.
_TO_LOCAL = Transformer.from_crs(4326, 3997, always_xy=True)


@dataclass(frozen=True)
class Building:
    """One surveyed footprint, with a height whose origin is stated."""

    id: str                       # 'way/199833153' -- OSM's own stable identifier
    plot_id: str | None           # the DDA parcel it stands on, where it stands on one
    name: str | None
    kind: str | None              # OSM building=* value
    height_m: float | None
    height_source: str
    height_provenance: Provenance
    height_basis: str
    footprint: list               # parts, each [exterior, *holes], in local plan metres
    area_sqm: float

    def to_json(self) -> dict:
        return {
            'id': self.id,
            'plot_id': self.plot_id,
            'name': self.name,
            'kind': self.kind,
            'height_m': self.height_m,
            'height_source': self.height_source,
            'height_provenance': self.height_provenance.value,
            'height_basis': self.height_basis,
            'footprint': self.footprint,
            'area_sqm': self.area_sqm,
        }


def query(envelope: tuple[float, float, float, float]) -> str:
    """The Overpass query for one AOI, in WGS84 because Overpass speaks nothing else."""
    to_wgs = Transformer.from_crs(3997, 4326, always_xy=True)
    lon_w, lat_s = to_wgs.transform(envelope[0], envelope[1])
    lon_e, lat_n = to_wgs.transform(envelope[2], envelope[3])
    bbox = f'{lat_s},{lon_w},{lat_n},{lon_e}'
    return (f'[out:json][timeout:90];'
            f'(way["building"]({bbox});relation["building"]({bbox}););out geom;')


def fetch(envelope: tuple[float, float, float, float], *, timeout: int = 120) -> dict:
    """
    One Overpass call for the AOI.

    Public Overpass instances rate-limit, and a district pipeline that re-queried them on every
    build would deserve it. This is called once per acquisition and the response is written into
    the same immutable snapshot as the parcels, so a rebuild reads the file.
    """
    req = urllib.request.Request(
        OVERPASS,
        data=urllib.parse.urlencode({'data': query(envelope)}).encode(),
        headers={'User-Agent': USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _rings_of(element: dict) -> list[list[list[float]]]:
    """
    OSM element -> rings of (lon, lat).

    A way is one ring. A relation is a multipolygon whose members carry roles: `outer` rings are
    shells, `inner` rings are courtyards. Ignoring the roles -- treating every member as a shell,
    or as a hole -- is how a building with a light well ends up solid, or inside out.
    """
    if element.get('type') == 'way':
        geom = element.get('geometry') or []
        return [[[p['lon'], p['lat']] for p in geom]] if len(geom) >= 4 else []

    rings = []
    for m in element.get('members', []):
        if m.get('type') != 'way' or m.get('role') not in ('outer', 'inner'):
            continue
        geom = m.get('geometry') or []
        if len(geom) >= 4:
            rings.append([[p['lon'], p['lat']] for p in geom])
    return rings


def _to_local(rings: list[list[list[float]]], origin: tuple[float, float]) -> list[list]:
    """
    (lon, lat) -> local plan metres.

    This is the one reprojection in the whole base, and it exists because OSM is delivered in
    WGS84 and nothing else. It runs once, offline, into EPSG:3997 -- the frame every other
    measurement already lives in -- so no downstream geometry ever mixes degrees with metres.
    """
    shells, holes = [], []
    for ring in rings:
        pts = [_TO_LOCAL.transform(lon, lat) for lon, lat in ring]
        local = [[round(x - origin[0], 3), round(y - origin[1], 3)] for x, y in pts]
        if len(local) < 4:
            continue
        poly = Polygon(local)
        if not poly.is_valid:
            poly = poly.buffer(0)
            if poly.is_empty:
                continue
            poly = max(getattr(poly, 'geoms', [poly]), key=lambda g: g.area)
            local = [[round(x, 3), round(y, 3)] for x, y in poly.exterior.coords]
        (holes if _contained(local, shells) else shells).append(local)

    parts = []
    for shell in shells:
        mine = [h for h in holes if _contained(h, [shell])]
        parts.append([shell] + mine)
    return parts


def _contained(ring: list[list[float]], shells: list[list[list[float]]]) -> bool:
    if not shells:
        return False
    p = Polygon(ring).representative_point()
    return any(Polygon(s).contains(p) for s in shells)


def _height(tags: dict, floor_height_m: float, permitted_m: float | None,
            plot_id: str | None, dominant: bool) -> tuple[float | None, str, Provenance, str]:
    """
    A height for a surveyed footprint, best source first, never invented.

      1. OSM `height`           metres a mapper recorded          relayed
      2. OSM `building:levels`  storeys x floor-to-floor          relayed, derived
      3. the parcel's DDA ceiling, and only for the dominant structure on that parcel  deferred
      4. nothing -- the shape is known, the height is not                              unavailable

    Rung 3 is the delicate one, and it is narrow on purpose. A plot's permitted height belongs to
    the plot, not to each thing standing on it: applied to every footprint it would draw a
    substation, a guard hut and a covered walkway as nine-storey towers, which is the exact
    failure the height chain exists to prevent -- an invented number that looks authoritative.
    So it is offered only to the largest structure on a parcel, and only when that structure
    covers enough of the parcel to plausibly *be* the scheme. Everything else keeps its real
    shape and no height, and is drawn flat.
    """
    raw = (tags.get('height') or '').strip()
    if raw:
        try:
            m = float(raw.replace('m', '').strip())
            if m > 0:
                return m, 'osm:height', Provenance.ASSUMPTION, f'OSM height={raw!r} (community survey)'
        except ValueError:
            pass

    levels = (tags.get('building:levels') or '').strip()
    if levels:
        try:
            n = float(levels)
            if n > 0:
                return (round(n * floor_height_m, 1), 'osm:building:levels', Provenance.ASSUMPTION,
                        f'OSM building:levels={levels} x {floor_height_m} m floor-to-floor')
        except ValueError:
            pass

    if permitted_m and dominant:
        return (permitted_m, 'dda:permitted', Provenance.DEFERRED,
                f'no surveyed height; this is the dominant structure on plot {plot_id}, so it is '
                f'drawn at the height DDA permits there — a ceiling, not a measurement')

    return (None, 'none', Provenance.UNAVAILABLE,
            'shape surveyed, height not: no OSM height or levels, and the plot ceiling belongs to '
            'the dominant structure rather than to this one')


def parse(raw: dict, origin: tuple[float, float], floor_height_m: float,
          parcels: list[tuple[str, BaseGeometry, float | None]],
          *, min_area_sqm: float = 12.0) -> tuple[list[Building], list[str]]:
    """
    Overpass response -> buildings, each tied to the parcel it stands on.

    `parcels` is (plot id, polygon in local metres, permitted height). The join is by containment
    of the building's own representative point, which survives the common case of a footprint
    overlapping a boundary by a metre; a building on no parcel keeps `plot_id: None` rather than
    being snapped to the nearest one.
    """
    index = STRtree([p for _, p, _ in parcels])
    out: list[Building] = []
    rejected: list[str] = []
    staged: list[tuple] = []

    for el in raw.get('elements', []):
        rings = _rings_of(el)
        if not rings:
            continue
        parts = _to_local(rings, origin)
        if not parts:
            continue
        area = sum(Polygon(p[0], p[1:]).area for p in parts)
        oid = f'{el.get("type")}/{el.get("id")}'
        if area < min_area_sqm:
            rejected.append(f'{oid}: {area:.1f} sqm below the {min_area_sqm:g} sqm floor')
            continue

        point = Polygon(parts[0][0]).representative_point()
        plot_id, permitted, plot_area = None, None, None
        for i in index.query(point):
            if parcels[i][1].contains(point):
                plot_id, permitted = parcels[i][0], parcels[i][2]
                plot_area = parcels[i][1].area
                break

        staged.append((el, oid, parts, area, plot_id, permitted, plot_area))

    # Which structure on each parcel may borrow the parcel's permitted ceiling: the largest, and
    # only if it covers at least a quarter of the plot. A 40 sqm outbuilding on a 5,000 sqm plot
    # is not the scheme, whatever else is standing there.
    largest: dict[str, tuple[str, float]] = {}
    for _, oid, _, area, plot_id, _, _ in staged:
        if plot_id and area > largest.get(plot_id, ('', 0.0))[1]:
            largest[plot_id] = (oid, area)

    for el, oid, parts, area, plot_id, permitted, plot_area in staged:
        dominant = bool(plot_id) and largest.get(plot_id, ('', 0))[0] == oid \
            and plot_area is not None and area >= 0.25 * plot_area

        tags = el.get('tags') or {}
        h, source, prov, basis = _height(tags, floor_height_m, permitted, plot_id, dominant)
        out.append(Building(
            id=oid,
            plot_id=plot_id,
            name=tags.get('name'),
            kind=tags.get('building') if tags.get('building') != 'yes' else None,
            height_m=h,
            height_source=source,
            height_provenance=prov,
            height_basis=basis,
            footprint=parts,
            area_sqm=round(area, 1),
        ))
    return out, rejected
