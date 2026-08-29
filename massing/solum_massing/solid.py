"""
Massing candidates as actual geometry, ready to extrude in three.js.

A candidate carries a footprint *area*. A render needs a footprint *polygon*, and the two are
not the same problem: 68,120 sqft of plate on this parcel could be any shape. The shape that is
defensible is the one the site itself implies -- the buildable envelope, shrunk uniformly until
it reaches the target area. That keeps the tower's outline parallel to the plot boundary, which
is how a Dubai plate is actually laid out, instead of dropping an invented rectangle on the site.

Everything here is derived from published geometry except floor-to-floor height, which DDA does
not publish (MAX_HEIGHT_METERS is 0 on the reference plot). It is tagged as an assumption and
never silently folded into a number that looks surveyed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from .dda import SQFT_PER_SQM, Provenance, RegulatoryEnvelope, Sourced
from .envelope import BuildableEnvelope
from .massing import Candidate

# Floor-to-floor for Dubai residential. DDA publishes a storey count, not a height, so this is
# ours. 3.2 m is the common slab-to-slab for apartments; podium and retail levels run taller.
ASSUMED_FLOOR_HEIGHT_M = 3.2


def shrink_to_area(poly: BaseGeometry, target_sqm: float, tolerance: float = 1e-3) -> BaseGeometry:
    """
    Inset a polygon uniformly until its area equals `target_sqm`.

    Binary search on the buffer distance. Area shrinks monotonically as the inset grows, so the
    search is well-behaved; a closed form does not exist for an arbitrary concave polygon.
    """
    if target_sqm >= poly.area or poly.is_empty:
        return poly
    lo, hi = 0.0, max(poly.bounds[2] - poly.bounds[0], poly.bounds[3] - poly.bounds[1])
    best = poly
    for _ in range(60):
        mid = (lo + hi) / 2
        candidate = poly.buffer(-mid, join_style=2)
        if candidate.is_empty:
            hi = mid
            continue
        best = candidate
        if abs(candidate.area - target_sqm) <= tolerance * max(target_sqm, 1.0):
            return candidate
        if candidate.area > target_sqm:
            lo = mid
        else:
            hi = mid
    return best


def _rings(geom: BaseGeometry) -> list[list[list[float]]]:
    """Exterior rings as plain coordinate lists. MultiPolygon keeps every part."""
    if geom.is_empty:
        return []
    parts = geom.geoms if geom.geom_type == 'MultiPolygon' else [geom]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in parts]


@dataclass
class Solid:
    """One massing candidate as renderable geometry, in metres, origin at the parcel centroid."""

    floors: int
    gfa_sqft: float
    footprint_sqft: float
    height_m: float
    binding_constraint: str
    parking_bays: int | None
    gfa_utilisation: float
    footprint_rings: list[list[list[float]]] = field(default_factory=list)


def build_scene(
    reg: RegulatoryEnvelope,
    env: BuildableEnvelope,
    candidates: list[Candidate],
    *,
    use_conservative: bool = True,
    floor_height_m: float = ASSUMED_FLOOR_HEIGHT_M,
) -> dict:
    """
    Assemble everything a viewer needs: parcel, both envelopes, and a solid per candidate.

    Coordinates are recentred on the parcel centroid so the viewer works in small local numbers.
    Dubai's wkid 3997 easting is ~499,000; feeding that straight into a float32 vertex buffer
    costs visible precision, and the model shimmers as the camera moves.
    """
    from .envelope import parcel_polygon

    parcel = parcel_polygon(reg.rings)
    cx, cy = parcel.centroid.x, parcel.centroid.y

    def recentre(geom: BaseGeometry) -> BaseGeometry:
        from shapely.affinity import translate
        return translate(geom, xoff=-cx, yoff=-cy)

    base = env.conservative if use_conservative else env.optimistic
    solids = []
    for c in candidates:
        target_sqm = c.footprint_sqft / SQFT_PER_SQM
        shape = shrink_to_area(base, target_sqm)
        solids.append(Solid(
            floors=c.floors,
            gfa_sqft=round(c.gfa_sqft),
            footprint_sqft=round(c.footprint_sqft),
            height_m=round(c.floors * floor_height_m, 2),
            binding_constraint=c.binding_constraint,
            parking_bays=c.parking_bays,
            gfa_utilisation=round(c.gfa_utilisation, 4),
            footprint_rings=_rings(recentre(shape)),
        ))

    return {
        'plot': {
            'number': reg.plot_number,
            'landuse': reg.landuse,
            'area_sqft': reg.area_sqft.value,
            'permitted_gfa_sqft': reg.permitted_gfa_sqft.value,
            'max_floors': reg.max_floors.value,
            'implied_far': reg.implied_far.value,
            'setbacks_m': reg.setbacks_m.value,
            'setbacks_complete': reg.setbacks_complete,
            'parking_rule_sqm_per_bay': reg.parking_rule.value,
        },
        'provenance': {
            'area_sqft': reg.area_sqft.basis,
            'permitted_gfa_sqft': reg.permitted_gfa_sqft.basis,
            'max_floors': reg.max_floors.basis,
            'setbacks_m': reg.setbacks_m.basis,
            'implied_far': reg.implied_far.basis,
            'parking': reg.parking_rule.basis,
            'floor_height_m': f'assumption: {floor_height_m} m floor-to-floor; DDA publishes storeys, not metres',
            'envelope': env.basis,
        },
        'geometry': {
            'parcel_rings': _rings(recentre(parcel)),
            'envelope_conservative_rings': _rings(recentre(env.conservative)),
            'envelope_optimistic_rings': _rings(recentre(env.optimistic)),
            'bounded': env.bounded,
        },
        'floor_height_m': floor_height_m,
        'solids': [s.__dict__ for s in solids],
    }
