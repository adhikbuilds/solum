"""
Parcel boundary minus setbacks -- the buildable envelope.

This is where the honest hazard of the whole exercise lives, and it is not the one the
roadmap predicted.

DDA publishes four setbacks per plot, named SIDE1..SIDE4. It does not publish which polygon
edge each one applies to, and a real Dubai parcel is not a rectangle -- the reference plot in
`fixtures/` has 37 vertices. So "20m from side 1" cannot be resolved to a geometric operation
without an assignment rule that DDA never states.

Guessing the assignment produces a number that looks authoritative and is not. The whole point
of reading regulation from the authority is lost the moment we invent the half it omitted.

So this module refuses to guess. It computes the envelope twice:

  - conservative: every edge inset by the LARGEST published setback
  - optimistic:   every edge inset by the SMALLEST published setback

The true envelope is bounded by those two, whatever the real side assignment turns out to be.
A feasibility run reports the range; a range that is too wide to support a decision is a signal
to go and get the site plan, not a licence to pick the middle.

That is the same discipline the appraisal engine already applies to comparables, applied to
geometry.
"""

from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from .dda import SQFT_PER_SQM, Provenance, RegulatoryEnvelope, Sourced


@dataclass
class BuildableEnvelope:
    """The footprint available to build on, as a bounded range rather than a false point value."""

    conservative: BaseGeometry
    optimistic: BaseGeometry
    setbacks_m: list[float]
    parcel_area_sqm: float
    ambiguous: bool
    basis: str
    bounded: bool = True   # False when a side was deferred: the range is NOT a true bound

    @property
    def conservative_sqft(self) -> float:
        return self.conservative.area * SQFT_PER_SQM

    @property
    def optimistic_sqft(self) -> float:
        return self.optimistic.area * SQFT_PER_SQM

    @property
    def parcel_sqft(self) -> float:
        return self.parcel_area_sqm * SQFT_PER_SQM

    @property
    def coverage_range(self) -> tuple[float, float]:
        """Footprint as a share of plot area, low and high."""
        if self.parcel_area_sqm <= 0:
            return (0.0, 0.0)
        return (
            self.conservative.area / self.parcel_area_sqm,
            self.optimistic.area / self.parcel_area_sqm,
        )

    def as_sourced(self) -> Sourced:
        if not self.bounded:
            prov = Provenance.DEFERRED
        elif self.ambiguous:
            prov = Provenance.ASSUMPTION
        else:
            prov = Provenance.DERIVED
        return Sourced((self.conservative_sqft, self.optimistic_sqft), prov, self.basis)


def parcel_polygon(rings: list[list[list[float]]]) -> Polygon:
    """
    Build a shapely polygon from ArcGIS rings.

    ArcGIS gives the exterior ring clockwise and holes counter-clockwise; shapely does not care
    about winding for correctness, but it does care about validity. `buffer(0)` is the standard
    repair for the self-touching rings that appear in real cadastral data.
    """
    if not rings:
        raise ValueError('no rings: the feature was fetched without geometry')
    exterior, *holes = rings
    poly = Polygon(exterior, holes)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def buildable_envelope(reg: RegulatoryEnvelope) -> BuildableEnvelope:
    """
    Inset the parcel by its published setbacks, returning the bounded range.

    A negative buffer is the correct primitive here: it insets every edge simultaneously and
    handles concave corners, which is precisely where a naive edge-by-edge offset breaks.
    `join_style=2` (mitre) keeps corners square, matching how a setback is actually drawn on a
    site plan -- the default round join would quietly shave area off every corner.
    """
    poly = parcel_polygon(reg.rings)
    setbacks = list(reg.setbacks_m.value or [])

    complete = reg.setbacks_complete

    if not setbacks:
        return BuildableEnvelope(
            conservative=poly, optimistic=poly, setbacks_m=[],
            parcel_area_sqm=poly.area, ambiguous=True, bounded=False,
            basis=reg.setbacks_m.basis + ' -- envelope shown is the raw parcel and is NOT buildable area',
        )

    lo, hi = min(setbacks), max(setbacks)
    conservative = poly.buffer(-hi, join_style=2)
    optimistic = poly.buffer(-lo, join_style=2)

    # A buffer that eats the whole polygon returns empty rather than raising. On a small plot
    # with a large setback that is the correct answer -- there is nothing to build on -- but it
    # must surface as a fact, not as a zero that looks like arithmetic.
    # A partial setback set cannot bound anything. If DDA published 5 m on two sides and pointed
    # at a drawing for the other two, the widest published value is not the worst case -- the
    # unread sides could be larger. Saying "conservative" here would be the exact failure this
    # module exists to prevent, so the range is returned but marked as not a bound.
    ambiguous = lo != hi or not complete
    if not complete:
        basis = (
            f'{reg.setbacks_m.basis} Range computed from the {len(setbacks)} published '
            f'side(s) only and does NOT bound the true envelope.'
        )
    elif ambiguous:
        basis = (
            f'setbacks {setbacks} m published per side, but DDA does not state which polygon '
            f'edge is SIDE1..SIDE{len(setbacks)}. Envelope bounded by uniform {hi} m '
            f'(conservative) and uniform {lo} m (optimistic).'
        )
    else:
        basis = f'uniform {hi} m setback on all sides, unambiguous'

    return BuildableEnvelope(
        conservative=conservative, optimistic=optimistic, setbacks_m=setbacks,
        parcel_area_sqm=poly.area, ambiguous=ambiguous, bounded=complete, basis=basis,
    )
