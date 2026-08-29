"""
Fitting a floor plate that looks like a building, because it is shaped like one.

The naive approach -- shrink the parcel polygon until its area matches the target -- produces a
plate that follows every kink of the cadastral boundary. A 37-vertex parcel yields a 37-vertex
"tower". No one builds that, and it is the single thing that makes a massing model read as a
diagram rather than a scheme.

Real plates are rectilinear and oriented to the site. So:

  1. Find the plot's dominant axis via the minimum-area rotated rectangle of the buildable
     envelope (rotating calipers, which shapely exposes directly). Dubai plots are overwhelmingly
     orthogonal to their access road, and this recovers that axis without being told it.
  2. Fit a rectangle on that axis, scaled to the target plate area.
  3. Intersect with the envelope so the plate can never breach a setback, and keep the
     rectilinear result when the intersection is close enough to the target.

The tower and the podium share an axis, which is what makes a stepped scheme read as one building
instead of two unrelated extrusions.
"""

from __future__ import annotations

import math

from shapely import affinity
from shapely.geometry import Point as ShapelyPoint, Polygon
from shapely.geometry.base import BaseGeometry


def dominant_axis(envelope: BaseGeometry) -> tuple[float, tuple[float, float]]:
    """
    Return (angle_degrees, centre) of the site's dominant axis.

    The minimum-area rotated rectangle is the standard estimator: for a roughly rectangular plot
    it lands on the boundary the building should face.
    """
    if envelope.is_empty:
        return 0.0, (0.0, 0.0)
    mrr = envelope.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)[:4]
    # Longest edge of the bounding rectangle defines the axis.
    best_len, best_angle = -1.0, 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:] + coords[:1]):
        length = math.hypot(x2 - x1, y2 - y1)
        if length > best_len:
            best_len = length
            best_angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
    c = envelope.centroid
    return best_angle, (c.x, c.y)


def _rect(cx: float, cy: float, area: float, aspect: float) -> Polygon:
    """An axis-aligned rectangle of `area` and `aspect`, centred on (cx, cy)."""
    depth = math.sqrt(area / aspect)
    length = depth * aspect
    return Polygon([
        (cx - length / 2, cy - depth / 2), (cx + length / 2, cy - depth / 2),
        (cx + length / 2, cy + depth / 2), (cx - length / 2, cy + depth / 2),
    ])


def _largest_fitting(flat: BaseGeometry, cx: float, cy: float, aspect: float, ceiling: float) -> float:
    """Largest area, at this aspect and centre, whose rectangle lies wholly inside `flat`."""
    lo, hi = 0.0, ceiling
    for _ in range(38):
        mid = (lo + hi) / 2
        if _rect(cx, cy, mid, aspect).within(flat):
            lo = mid
        else:
            hi = mid
    return lo


def fit_plate(envelope: BaseGeometry, target_sqm: float, *, aspect: float = 1.6) -> BaseGeometry:
    """
    A clean four-cornered plate of `target_sqm`, oriented to the site and wholly inside the envelope.

    The plate is never clipped -- clipping re-introduces the parcel's kinks and is what makes a
    tower render as an amoeba. Instead this searches for the largest rectangle that *fits*.

    Placement matters more than it looks. On an irregular parcel the centroid can sit in a notch,
    and a rectangle centred there is far smaller than the best one available: on the reference
    plot, three hand-picked centres found 37,907 sqft where the real answer is much larger. So the
    search is two-phase -- a coarse grid over centres and aspect ratios, then a refinement around
    the winner -- which is the same coarse-then-refine shape used for the mix optimiser, for the
    same reason: the objective is not smooth, so a single guess lands in the wrong basin.
    """
    if envelope.is_empty or target_sqm <= 0:
        return envelope

    angle, (cx0, cy0) = dominant_axis(envelope)
    flat = affinity.rotate(envelope, -angle, origin=(cx0, cy0))
    minx, miny, maxx, maxy = flat.bounds
    ceiling = flat.area * 1.05
    prepared = flat

    ASPECTS = (1.0, 1.3, 1.6, 2.0, 2.6, 3.4)

    def search(centres, aspects, steps: int):
        best = (-1.0, None)
        for asp in aspects:
            for (cx, cy) in centres:
                lo, hi = 0.0, ceiling
                for _ in range(steps):
                    mid = (lo + hi) / 2
                    if _rect(cx, cy, mid, asp).within(prepared):
                        lo = mid
                    else:
                        hi = mid
                if lo > best[0]:
                    best = (lo, (cx, cy, asp))
        return best

    # Phase 1 -- coarse grid over the envelope's bounding box, cheap bisection.
    nx = ny = 9
    coarse = [
        (minx + (maxx - minx) * (i + 0.5) / nx, miny + (maxy - miny) * (j + 0.5) / ny)
        for i in range(nx) for j in range(ny)
    ]
    coarse = [c for c in coarse if prepared.contains(ShapelyPoint(c))]
    if not coarse:
        coarse = [(flat.centroid.x, flat.centroid.y)]
    best_area, best = search(coarse, ASPECTS, 14)

    # Phase 2 -- refine around the winner at full precision.
    if best is not None:
        bx, by, basp = best
        stepx = (maxx - minx) / nx / 2
        stepy = (maxy - miny) / ny / 2
        fine = [
            (bx + dx * stepx, by + dy * stepy)
            for dx in (-1, -0.5, 0, 0.5, 1) for dy in (-1, -0.5, 0, 0.5, 1)
        ]
        fine = [c for c in fine if prepared.contains(ShapelyPoint(c))] or [(bx, by)]
        near = tuple(a for a in ASPECTS if abs(a - basp) <= 0.75) or (basp,)
        area2, best2 = search(fine, near, 34)
        if area2 > best_area:
            best_area, best = area2, best2

    if best is None or best_area <= 0:
        from .solid import shrink_to_area
        return shrink_to_area(envelope, target_sqm)

    cx, cy, asp = best
    rect = _rect(cx, cy, min(target_sqm, best_area), asp)
    return affinity.rotate(rect, angle, origin=(cx0, cy0))


# Blocks are held apart by a fire-separation gap. Dubai practice is 6 m between residential
# blocks; below that they are one building and should be modelled as one.
BLOCK_SEPARATION_M = 6.0


def fit_blocks(
    envelope: BaseGeometry, target_sqm: float, *, max_blocks: int = 3, aspect: float = 1.6
) -> list[BaseGeometry]:
    """
    Fit the plate as one or more rectangular blocks, which is how awkward plots are actually built.

    On the reference parcel -- a star-shaped plot with a notch -- the largest inscribed rectangle
    covers only 47% of the buildable envelope. Forcing the whole plate into that one rectangle
    understates the plot badly; clipping a rectangle to the envelope instead produces a shape
    nobody would build. Real schemes resolve this with multiple towers on a shared podium, and the
    RERA project register confirms it: descriptions read "2 residential towers", "Three Building:
    Total 545 units".

    So: fit the largest rectangle, take what is needed from it, remove it plus a fire-separation
    gap, and repeat. Greedy rather than optimal, and that is the right trade -- the alternative is
    a packing search whose extra precision is well inside the error of the assumptions feeding it.
    """
    if envelope.is_empty or target_sqm <= 0:
        return []

    blocks: list[BaseGeometry] = []
    remaining: BaseGeometry = envelope
    outstanding = target_sqm

    for _ in range(max_blocks):
        if outstanding <= target_sqm * 0.02 or remaining.is_empty:
            break

        # difference() can fragment the envelope; fit into the largest surviving piece.
        piece = remaining
        if piece.geom_type == 'MultiPolygon':
            piece = max(piece.geoms, key=lambda g: g.area)
        if piece.area <= 0:
            break

        rect = fit_plate(piece, outstanding, aspect=aspect)
        if rect.is_empty or rect.area <= 0:
            break

        blocks.append(rect)
        outstanding -= rect.area
        remaining = remaining.difference(rect.buffer(BLOCK_SEPARATION_M, join_style=2))

    return blocks
