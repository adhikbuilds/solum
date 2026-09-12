"""
Massing candidate -> money.

The massing engine answers "what can be built". This answers "is it worth building", and it is
the half that makes the geometry a feasibility tool rather than a drawing.

The arithmetic is ported from `evalMix()` in solum.html, deliberately unchanged, so a number
produced here reconciles with the number the prototype has been showing Al Mizan. The residual
is the same identity:

    RLV = (GDV / (1 + hurdle) - nonLandCost) / (1 + dldRate)

Land price does not appear in it. That is the property that makes RLV the right key to rank
massing options on: every candidate is scored on what the land is worth to it, independent of
what the land actually costs.

The unit mix default is not invented. It is the observed Dubai mix from the RERA project
register -- 348 projects, 118,221 units -- so the schedule a candidate is priced on reflects
what developers in this market actually build.
"""

from __future__ import annotations

import math

from .dda import SQFT_PER_SQM

from dataclasses import dataclass, field

from .dda import Provenance, Sourced
from .scheme import PODIUM_THRESHOLD_FLOORS

# --- defaults, carried over from the prototype's defaultState() -------------------------------

DEFAULT_COSTS = {
    'construction_psf_bua': 345.0,   # AED per sqft of BUA
    'bua_factor': 1.45,              # BUA = GFA x this
    'arch_design_rate': 0.025,
    'arch_super_rate': 0.025,
    'contingency_rate': 0.10,
    'authorities_fixed': 2_000_000.0,
    'landscape_fixed': 1_000_000.0,
    'misc_fixed': 500_000.0,
    'marketing_rate': 0.04,
    'parking_bay_cost': 55_000.0,
    'visitor_bay_rate': 0.15,
    'dld_transfer_rate': 0.04,
    'target_profit_on_cost': 0.20,
    'base_efficiency': 0.82,
    # Not from a bill of quantities, and not attributed to any specific cost report -- this is our
    # own modelling judgement, tagged `assumption`, not `authority`. Once a scheme needs a podium
    # (same PODIUM_THRESHOLD_FLOORS as scheme.py: above 6 storeys, per that module's own line, "a
    # podium would be invented detail" below it), it also needs a transfer structure over the
    # podium levels, a second core/lift bank and heavier wind bracing than a simple slab -- real
    # extra scope, unpriced anywhere else in this model. Without a BOQ for this plot we cannot
    # size it precisely, so 12% is deliberately a conservative placeholder for that scope, not a
    # verified figure -- it exists so a podium scheme is not silently priced as if it were a slab,
    # not to manufacture a case for building taller.
    'podium_transfer_premium': 0.12,
}


@dataclass
class UnitType:
    code: str
    label: str
    size_sqft: float
    price_psf: float
    bays: int
    share: float        # of saleable area


# Observed Dubai mix, RERA project register (348 projects / 118,221 units, read 2026-08-29).
# Commercial (4.9%) is excluded and the residential shares renormalised, because this prices a
# residential schedule. Sizes and prices remain the prototype's own defaults.
RERA_MIX = [
    UnitType('S',   'Studio', 430,  1550, 1, 0.136),
    UnitType('1BR', '1BR',    750,  1460, 1, 0.364),
    UnitType('2BR', '2BR',    1150, 1350, 2, 0.227),
    UnitType('3BR', '3BR',    1600, 1280, 2, 0.137),
    UnitType('4BR', '4BR',    2200, 1250, 2, 0.106),
]

MIX_BASIS = (
    'RERA project register, 348 projects / 118,221 units: 1BR 34.6%, 2BR 21.6%, 3BR 13.0%, '
    'studio 12.9%, 4BR 10.0% (commercial excluded, residential renormalised)'
)


@dataclass
class UnitLine:
    code: str
    label: str
    count: int
    size_sqft: float
    price_psf: float
    area_sqft: float
    revenue: float


@dataclass
class Feasibility:
    """The money for one massing candidate. All figures AED."""

    saleable_sqft: float
    efficiency: float
    units: list[UnitLine] = field(default_factory=list)
    total_units: int = 0
    bays: int = 0
    gdv: float = 0.0
    construction: float = 0.0
    soft_costs: float = 0.0
    parking_cost: float = 0.0
    marketing: float = 0.0
    non_land_cost: float = 0.0
    residual_land_value: float = 0.0
    rlv_psf_land: float = 0.0
    blended_psf: float = 0.0
    breakeven_psf: float = 0.0
    # Fraction of hard cost added because this candidate needs a podium. 0.0 means no premium
    # applied -- surfaced so a flat number is never mistaken for "identical to build regardless
    # of height", which was the actual bug: every storey option priced the same either way.
    construction_premium_pct: float = 0.0

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        d['units'] = [u.__dict__ for u in self.units]
        return d


# ---------------------------------------------------------------------------------------------
# Daylight depth: the constraint that makes a floor plate building-shaped rather than merely
# area-correct.
#
# A residential floor is a double-loaded corridor -- units either side of a central circulation
# spine -- and every unit needs a window. That caps how deep the plate can be, whatever the plot
# would otherwise allow. Without the cap a plate that satisfies the area target is a fat
# rectangle, which is why the massing read as boxes stacked on boxes.
#
# The depth comes from the unit mix, which is the one place market data legitimately reaches the
# geometry: DLD transactions carry no floor plates, but they do carry unit sizes per area, and
# unit size is what sets unit depth. Today the mix is `RERA_MIX`; when the DLD comps are wired,
# a per-area mix substitutes here and nothing else changes.
#
# Both figures below are ours, not the authority's, and are tagged `assumption` accordingly.
UNIT_DEPTH_RATIO = 1.5     # unit depth : frontage. Apartments run deeper than they are wide.
CORRIDOR_WIDTH_M = 2.4     # central circulation spine between the two rows of units.

# Sanity band for a double-loaded residential slab, used to refuse a nonsense derivation rather
# than let one reshape a building silently.
MIN_PLATE_DEPTH_M = 16.0
MAX_PLATE_DEPTH_M = 34.0


def daylight_plate_depth_m(mix: list[UnitType] | None = None) -> float:
    """
    Maximum sensible plate depth for a residential floor, derived from the unit mix.

    Share-weighted mean unit area -> unit depth at `UNIT_DEPTH_RATIO` -> two rows plus a corridor.
    On `RERA_MIX` this yields a 1,045 sqft mean unit, 12.1 m deep, and a 26.5 m plate, which sits
    inside the 22-28 m band a double-loaded slab actually occupies.
    """
    m = mix or RERA_MIX
    total_share = sum(u.share for u in m) or 1.0
    mean_sqft = sum(u.size_sqft * u.share for u in m) / total_share
    mean_sqm = mean_sqft / SQFT_PER_SQM
    unit_depth = math.sqrt(mean_sqm * UNIT_DEPTH_RATIO)
    return max(MIN_PLATE_DEPTH_M, min(2 * unit_depth + CORRIDOR_WIDTH_M, MAX_PLATE_DEPTH_M))


def appraise(
    gfa_sqft: float,
    plot_area_sqft: float,
    *,
    floors: int = 1,
    parking_bays: int | None = None,
    mix: list[UnitType] | None = None,
    costs: dict | None = None,
) -> Feasibility:
    """
    Price one massing candidate.

    `parking_bays` overrides the derived bay count when the authority published a GFA-based
    parking rule -- the authority's own rule outranks our per-unit convention.

    `floors` drives the podium construction premium (see `podium_transfer_premium`). It is the
    only place height enters the money at all: previously it didn't, so every storey option for
    a plot priced identically and "best" collapsed to whichever used the fewest floors.
    """
    c = {**DEFAULT_COSTS, **(costs or {})}
    mix = mix or RERA_MIX

    efficiency = c['base_efficiency']
    saleable = gfa_sqft * efficiency

    # A schedule of whole apartments, not fractions of one. Floor each type, then hand the
    # leftover area to the largest remainders while it still fits -- the prototype's rule, kept
    # so the unit counts agree.
    raw = [saleable * u.share / u.size_sqft for u in mix]
    counts = [int(r) for r in raw]
    used = sum(n * u.size_sqft for n, u in zip(counts, mix))
    for _, i in sorted(((raw[i] - counts[i], i) for i in range(len(mix))), reverse=True):
        if raw[i] > 0 and used + mix[i].size_sqft <= saleable + 1e-6:
            counts[i] += 1
            used += mix[i].size_sqft

    lines = [
        UnitLine(u.code, u.label, n, u.size_sqft, u.price_psf, n * u.size_sqft,
                 n * u.size_sqft * u.price_psf)
        for n, u in zip(counts, mix) if n > 0
    ]
    gdv = sum(l.revenue for l in lines)
    sal = sum(l.area_sqft for l in lines)
    total_units = sum(counts)

    if parking_bays is not None:
        bays = parking_bays
    else:
        resident = sum(n * u.bays for n, u in zip(counts, mix))
        bays = int(round(resident * (1 + c['visitor_bay_rate'])))

    premium = c['podium_transfer_premium'] if floors > PODIUM_THRESHOLD_FLOORS else 0.0
    bua = gfa_sqft * c['bua_factor']
    hard = bua * c['construction_psf_bua'] * (1 + premium)
    soft = (hard * (c['arch_design_rate'] + c['arch_super_rate'] + c['contingency_rate'])
            + c['authorities_fixed'] + c['landscape_fixed'] + c['misc_fixed'])
    park = bays * c['parking_bay_cost']
    mkt = gdv * c['marketing_rate']
    non_land = hard + soft + park + mkt

    hurdle, dld = c['target_profit_on_cost'], c['dld_transfer_rate']
    rlv = (gdv / (1 + hurdle) - non_land) / (1 + dld)

    return Feasibility(
        saleable_sqft=round(sal),
        efficiency=efficiency,
        units=lines,
        total_units=total_units,
        bays=bays,
        gdv=round(gdv),
        construction=round(hard),
        soft_costs=round(soft),
        parking_cost=round(park),
        marketing=round(mkt),
        non_land_cost=round(non_land),
        residual_land_value=round(rlv),
        rlv_psf_land=round(rlv / plot_area_sqft, 2) if plot_area_sqft else 0.0,
        blended_psf=round(gdv / sal, 2) if sal else 0.0,
        breakeven_psf=round((1 + hurdle) * non_land / sal, 2) if sal else 0.0,
        construction_premium_pct=premium,
    )


def mix_provenance() -> Sourced:
    return Sourced(None, Provenance.DERIVED, MIX_BASIS)
