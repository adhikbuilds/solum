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

from .dda import SQFT_PER_SQM, Provenance, RegulatoryEnvelope, Sourced, fetch_context
from .envelope import BuildableEnvelope
from .massing import Candidate
from .plate import fit_blocks
from .envelope import parcel_polygon
from .scheme import decompose

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


def _context_massing(parcel, cx: float, cy: float, floor_height_m: float) -> list[dict]:
    """Neighbouring parcels, extruded to their own published storey limit."""
    import re
    from shapely.affinity import translate
    out = []
    for f in fetch_context(parcel.bounds):
        rings = (f.get('geometry') or {}).get('rings') or []
        if not rings:
            continue
        attrs = f.get('attributes', {})
        raw = str(attrs.get('MAX_HEIGHT_FLOORS') or '')
        m = re.search(r'G\s*\+\s*(\d+)', raw.upper())
        floors = int(m.group(1)) + 1 if m else (1 if raw and raw != 'N/A' else 0)
        try:
            poly = parcel_polygon(rings)
        except Exception:
            continue
        if poly.is_empty or poly.equals(parcel):
            continue
        out.append({
            'plot_number': str(attrs.get('PLOT_NUMBER', '')),
            'landuse': attrs.get('MAIN_LANDUSE'),
            'floors': floors,
            'height_m': round(floors * floor_height_m, 1),
            'rings': _rings(translate(poly, xoff=-cx, yoff=-cy)),
        })
    return out


def build_scene(
    reg: RegulatoryEnvelope,
    env: BuildableEnvelope,
    candidates: list[Candidate],
    *,
    use_conservative: bool = True,
    floor_height_m: float = ASSUMED_FLOOR_HEIGHT_M,
    with_context: bool = True,
) -> dict:
    """
    Assemble everything a viewer needs: parcel, both envelopes, and a solid per candidate.

    Coordinates are recentred on the parcel centroid so the viewer works in small local numbers.
    Dubai's wkid 3997 easting is ~499,000; feeding that straight into a float32 vertex buffer
    costs visible precision, and the model shimmers as the camera moves.
    """
    parcel = parcel_polygon(reg.rings)
    cx, cy = parcel.centroid.x, parcel.centroid.y

    def recentre(geom: BaseGeometry) -> BaseGeometry:
        from shapely.affinity import translate
        return translate(geom, xoff=-cx, yoff=-cy)

    base = env.conservative if use_conservative else env.optimistic
    envelope_sqft = base.area * SQFT_PER_SQM
    solids = []

    # Shared across every candidate: fitting a plate is the expensive step, and most candidates
    # resolve to the same handful of footprints.
    cache: dict[tuple[int, str], list] = {}

    for c in candidates:
        scheme = decompose(
            gfa_sqft=c.gfa_sqft, floors=c.floors,
            tower_cap_sqft=c.footprint_sqft, envelope_sqft=envelope_sqft,
            bays_required=c.parking_bays,
        )
        levels = []
        for lv in scheme.levels:
            # Basements are underground and have no facade, so they follow the envelope rather
            # than being fitted as rectilinear blocks -- which is both what is actually built and
            # considerably cheaper than a plate search.
            key = (round(lv.footprint_sqft), 'env' if lv.kind == 'basement' else 'plate')
            if key not in cache:
                # Rectilinear blocks, not a shrunk parcel outline. A plate that traces the
                # cadastral boundary is the single thing that makes a massing model read as a
                # diagram rather than a scheme.
                if lv.kind == 'basement':
                    cache[key] = _rings(recentre(shrink_to_area(base, lv.footprint_sqft / SQFT_PER_SQM)))
                else:
                    blocks = fit_blocks(base, lv.footprint_sqft / SQFT_PER_SQM)
                    rings = []
                    for b in blocks:
                        rings.extend(_rings(recentre(b)))
                    cache[key] = rings
            levels.append({
                'kind': lv.kind, 'index': lv.index, 'use': lv.use,
                'footprint_sqft': round(lv.footprint_sqft),
                'base_m': round(lv.base_m, 2), 'height_m': round(lv.height_m, 2),
                'rings': cache[key],
            })

        solids.append({
            'floors': c.floors,
            'gfa_sqft': round(c.gfa_sqft),
            'footprint_sqft': round(c.footprint_sqft),
            'height_m': round(scheme.height_m, 1),
            'depth_m': round(scheme.depth_m, 1),
            'binding_constraint': c.binding_constraint,
            'parking_bays': c.parking_bays,
            'gfa_utilisation': round(c.gfa_utilisation, 4),
            'scheme': {
                'basement_levels': scheme.basement_levels,
                'podium_levels': scheme.podium_levels,
                'tower_levels': scheme.tower_levels,
                'podium_footprint_sqft': round(scheme.podium_footprint_sqft),
                'tower_footprint_sqft': round(scheme.tower_footprint_sqft),
                'parking_provided': scheme.parking_provided,
                'parking_required': scheme.parking_required,
                'parking_shortfall': max(0, scheme.parking_required - scheme.parking_provided),
                'basis': scheme.basis,
            },
            'levels': levels,
        })

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
        'context': _context_massing(parcel, cx, cy, floor_height_m) if with_context else [],
        'floor_height_m': floor_height_m,
        'solids': solids,
    }
