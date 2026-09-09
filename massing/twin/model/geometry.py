"""
ArcGIS rings -> shapely geometry, without guessing what ring two is.

`solum_massing.envelope.parcel_polygon` reads rings as `exterior, *holes`. For a study of one
parcel that is right almost always and cheap to reason about. At district scale it is a silent
data loss: a parcel delivered as two disjoint pieces -- a plot split by a road reservation, or a
concave parcel that shrinking to a floor plate has broken in two -- becomes one piece with the
other subtracted from it as a "hole", and `buffer(0)` then quietly discards the fragment. It is
not an error anyone sees; it is a building with a void punched through it, or a missing wing.

So the grouping here is by **containment**, not by ring order and not by winding:

  a ring contained by an earlier ring is a hole in that ring;
  any other ring starts a new part.

Winding is the documented ArcGIS convention (exteriors clockwise, holes counter-clockwise) and
would be cheaper, but real cadastral exports do not honour it reliably, and containment is
checkable against the geometry itself rather than against a convention the file may not follow.
"""

from __future__ import annotations

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry


def _repair(poly: Polygon) -> BaseGeometry:
    """`buffer(0)` is the standard fix for the self-touching rings real cadastral data contains."""
    return poly if poly.is_valid else poly.buffer(0)


def parcel_geometry(rings: list[list[list[float]]]) -> BaseGeometry:
    """
    Build a Polygon or MultiPolygon from ArcGIS rings, keeping every part.

    Returns a repaired geometry; raises if there are no rings at all, because a feature with no
    geometry is a fetch problem rather than a shape problem and should be reported as one.
    """
    if not rings:
        raise ValueError('no rings: the feature was fetched without geometry')

    shells: list[Polygon] = []
    holes: list[list[list[float]]] = [[] for _ in rings]

    for ring in rings:
        if len(ring) < 4:
            continue                      # not a closed ring; nothing to build
        candidate = Polygon(ring)
        if not candidate.is_valid:
            candidate = candidate.buffer(0)
            if candidate.is_empty:
                continue
            candidate = max(getattr(candidate, 'geoms', [candidate]), key=lambda g: g.area)
        parent = next((i for i, s in enumerate(shells) if s.contains(candidate.representative_point())), None)
        if parent is None:
            shells.append(Polygon(candidate.exterior))
        else:
            holes[parent].append(list(candidate.exterior.coords))

    if not shells:
        raise ValueError('no usable ring in the feature geometry')

    parts = [_repair(Polygon(s.exterior, holes[i])) for i, s in enumerate(shells)]
    parts = [p for p in parts if not p.is_empty]
    if len(parts) == 1:
        return parts[0]
    flat: list[Polygon] = []
    for p in parts:
        flat.extend(getattr(p, 'geoms', [p]))
    return MultiPolygon(flat)
