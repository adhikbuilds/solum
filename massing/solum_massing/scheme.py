"""
A candidate, decomposed into the levels a Dubai scheme is actually built from:
basements, a podium, and a tower.

Why this is not read from the authority, and must be labelled as ours:

DDA publishes PODIUM_SETBACK_SIDE1..4, but measured across 600 residential plots on 2026-08-29
only 5% state one at all and 3% state a number. MAX_HEIGHT_FLOORS is plain 'G+N' throughout --
'G+8' x194, 'G+1' x160 -- and never carries the 'B+G+4P+50' notation that appears in RERA project
descriptions. So the authority tells us how tall and how far back, and says nothing about the
base.

That leaves one honest anchor, and it is a good one: **parking**. DDA does publish the parking
rule per plot, so bay demand is authority-derived, and bay demand is what actually sizes the base
of a Dubai scheme. Everything else here -- how many levels go below grade, how tall a podium is,
where the tower steps back -- is a model, tagged `assumption`, and the UI says so.

The one constraint that is never relaxed: total above-grade area still equals the candidate's
GFA. A wider podium buys a slimmer tower, it does not buy extra entitlement.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Gross area per parking bay, including aisles, ramps and cores. 350 sqft is the common
# rule-of-thumb for structured parking; efficient basements reach ~320, tight sites exceed 400.
SQFT_PER_BAY = 350.0

# A basement can generally be built closer to the plot line than the tower, but we do not know
# how much closer, so it is held at the buildable envelope. Conservative in the right direction:
# it understates parking capacity per level, which pushes levels DOWN rather than up.
MAX_BASEMENT_LEVELS = 5

# Above this many storeys a scheme reads as tower-on-podium rather than a single block. Below it,
# Dubai builds a simple slab and a podium would be invented detail.
PODIUM_THRESHOLD_FLOORS = 6
TYPICAL_PODIUM_FLOORS = 3

BASEMENT_HEIGHT_M = 3.0
PODIUM_HEIGHT_M = 4.5      # podium levels carry parking and retail, so they run taller
TOWER_HEIGHT_M = 3.2


@dataclass
class Level:
    """One horizontal band of the scheme."""

    kind: str            # 'basement' | 'podium' | 'tower'
    index: int           # 0-based within its kind
    footprint_sqft: float
    base_m: float        # elevation of the slab underside; negative below grade
    height_m: float
    use: str


@dataclass
class Scheme:
    levels: list[Level] = field(default_factory=list)
    basement_levels: int = 0
    podium_levels: int = 0
    tower_levels: int = 0
    podium_footprint_sqft: float = 0.0
    tower_footprint_sqft: float = 0.0
    parking_provided: int = 0
    parking_required: int = 0
    basis: str = ''

    @property
    def height_m(self) -> float:
        above = [l for l in self.levels if l.base_m >= 0]
        return max((l.base_m + l.height_m for l in above), default=0.0)

    @property
    def depth_m(self) -> float:
        return abs(min((l.base_m for l in self.levels), default=0.0))


def decompose(
    *,
    gfa_sqft: float,
    floors: int,
    tower_cap_sqft: float,
    envelope_sqft: float,
    bays_required: int | None,
) -> Scheme:
    """
    Split a candidate into basements, podium and tower.

    `tower_cap_sqft` is the plate the candidate was priced on; `envelope_sqft` is the widest
    footprint the setbacks allow, which is what the podium and basements may use.
    """
    s = Scheme(parking_required=bays_required or 0)

    # --- below grade: driven by the authority's own parking rule ---------------------------
    if bays_required:
        per_level = max(envelope_sqft / SQFT_PER_BAY, 1.0)
        needed = int(-(-bays_required // per_level))          # ceiling division
        s.basement_levels = min(needed, MAX_BASEMENT_LEVELS)
        s.parking_provided = int(s.basement_levels * per_level)

    for i in range(s.basement_levels):
        s.levels.append(Level(
            kind='basement', index=i, footprint_sqft=envelope_sqft,
            base_m=-(i + 1) * BASEMENT_HEIGHT_M, height_m=BASEMENT_HEIGHT_M,
            use='parking',
        ))

    # --- above grade: podium + tower, preserving total GFA ----------------------------------
    if floors >= PODIUM_THRESHOLD_FLOORS and envelope_sqft > tower_cap_sqft * 1.05:
        p = min(TYPICAL_PODIUM_FLOORS, floors - 1)
        podium_fp = envelope_sqft
        remaining_gfa = gfa_sqft - p * podium_fp
        tower_floors = floors - p
        tower_fp = remaining_gfa / tower_floors if tower_floors else 0.0

        # If the podium would eat the whole entitlement, it is not a podium scheme.
        if tower_fp <= podium_fp * 0.15:
            p, tower_floors = 0, floors
            podium_fp, tower_fp = 0.0, tower_cap_sqft
    else:
        p, tower_floors = 0, floors
        podium_fp, tower_fp = 0.0, tower_cap_sqft

    s.podium_levels, s.tower_levels = p, tower_floors
    s.podium_footprint_sqft, s.tower_footprint_sqft = podium_fp, tower_fp

    y = 0.0
    for i in range(p):
        s.levels.append(Level('podium', i, podium_fp, y, PODIUM_HEIGHT_M,
                              'parking + retail' if i == 0 else 'parking'))
        y += PODIUM_HEIGHT_M
    for i in range(tower_floors):
        s.levels.append(Level('tower', i, tower_fp, y, TOWER_HEIGHT_M, 'residential'))
        y += TOWER_HEIGHT_M

    if p:
        s.basis = (
            f'assumption: {p}-level podium at the full setback envelope with a {tower_floors}-storey '
            f'tower above; total above-grade area still equals the permitted GFA. '
            f'{s.basement_levels} basement level(s) sized from the authority parking rule '
            f'({s.parking_required} bays at {SQFT_PER_BAY:g} sqft gross per bay). '
            f'DDA publishes a podium setback on only 3% of residential plots, so the base is '
            f'modelled, not read.'
        )
    else:
        s.basis = (
            f'assumption: single-form scheme, no podium modelled below {PODIUM_THRESHOLD_FLOORS} '
            f'storeys. {s.basement_levels} basement level(s) sized from the authority parking rule '
            f'({s.parking_required} bays at {SQFT_PER_BAY:g} sqft gross per bay).'
        )
    return s
