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

from dataclasses import dataclass, field

from .dda import Provenance, Sourced

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

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        d['units'] = [u.__dict__ for u in self.units]
        return d


def appraise(
    gfa_sqft: float,
    plot_area_sqft: float,
    *,
    parking_bays: int | None = None,
    mix: list[UnitType] | None = None,
    costs: dict | None = None,
) -> Feasibility:
    """
    Price one massing candidate.

    `parking_bays` overrides the derived bay count when the authority published a GFA-based
    parking rule -- the authority's own rule outranks our per-unit convention.
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

    bua = gfa_sqft * c['bua_factor']
    hard = bua * c['construction_psf_bua']
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
    )


def mix_provenance() -> Sourced:
    return Sourced(None, Provenance.DERIVED, MIX_BASIS)
