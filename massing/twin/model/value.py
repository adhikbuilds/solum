"""
Residual land value, for every parcel in the district at once.

A city viewer shows you where things are. This is the layer that makes the district a Solum
surface rather than a map: the same engine that appraises one plot, run across every parcel the
snapshot already contains, so the block can be read by what the land is worth rather than by what
is standing on it.

It costs one pass and no network. `acquire` has already stored the full DDA record for every
parcel, and `parse_feature -> buildable_envelope -> generate -> appraise` is pure -- the same
sequence `service/main.py` runs for a single plot, with the same engine, so a parcel's colour in
the district and its number in the study cannot disagree.

**The caveat that travels with every figure.** The engine prices a *residential* schedule -- the
RERA unit mix. Most of this district is published as `FACILITIES (UNIVERSITY)`, `FACILITIES
(CLINIC)` and similar. Appraising those plots is not a valuation of the university; it is the
answer to "what would this land be worth if a residential scheme of the permitted size were built
on it", which is a real question for a land buyer and a wrong one to read as anything else. So
every non-residential parcel is flagged `hypothetical` and the viewer says so on the legend. This
is the same discipline as the height chain: the number is allowed to exist as long as it cannot be
mistaken for something it is not.
"""

from __future__ import annotations

from dataclasses import dataclass

from solum_massing.dda import Provenance, parse_feature
from solum_massing.envelope import buildable_envelope
from solum_massing.feasibility import appraise
from solum_massing.massing import generate

# DDA land-use strings that describe housing. Anything else gets the hypothetical flag.
RESIDENTIAL_HINTS = ('RESIDENTIAL', 'APARTMENT', 'VILLA', 'HOTEL APARTMENT')


@dataclass(frozen=True)
class Value:
    plot_id: str
    rlv: float | None
    rlv_psf_land: float | None
    gdv: float | None
    floors: int | None
    units: int | None
    binding_constraint: str | None
    hypothetical: bool
    basis: str

    def to_json(self) -> dict:
        return {
            'rlv': None if self.rlv is None else round(self.rlv),
            'rlv_psf_land': None if self.rlv_psf_land is None else round(self.rlv_psf_land, 2),
            'gdv': None if self.gdv is None else round(self.gdv),
            'floors': self.floors,
            'units': self.units,
            'binding_constraint': self.binding_constraint,
            'hypothetical': self.hypothetical,
            'basis': self.basis,
        }


def _is_residential(landuse: str | None) -> bool:
    return bool(landuse) and any(h in landuse.upper() for h in RESIDENTIAL_HINTS)


def appraise_feature(feature: dict, *, conservative: bool = True) -> Value:
    """
    One raw DDA feature -> its best-RLV scheme, or a stated refusal.

    The engine can decline, and that is a feature of it: a plot with no published GFA or no
    storey limit has no candidate set, and the honest output is an absent number with the reason
    attached rather than a zero that sorts like a cheap plot.
    """
    reg = parse_feature(feature)
    pid = reg.plot_number
    landuse = reg.landuse or ''
    hypothetical = not _is_residential(landuse)

    if reg.permitted_gfa_sqft.provenance is Provenance.UNAVAILABLE:
        return Value(pid, None, None, None, None, None, None, hypothetical,
                     'DDA published no GFA for this plot, so there is no scheme to price')
    if reg.max_floors.provenance is Provenance.UNAVAILABLE:
        return Value(pid, None, None, None, None, None, None, hypothetical,
                     'DDA published no storey limit, so the candidate set is unbounded')

    try:
        env = buildable_envelope(reg)
        candidates = generate(reg, env, use_conservative=conservative)
    except Exception as e:                      # a parcel geometry the envelope cannot inset
        return Value(pid, None, None, None, None, None, None, hypothetical,
                     f'envelope could not be solved: {e}')
    if not candidates:
        return Value(pid, None, None, None, None, None, None, hypothetical,
                     'no massing candidate survives the published envelope')

    best, money = max(
        ((c, appraise(c.gfa_sqft, reg.area_sqft.value or 0.0,
                      floors=c.floors, parking_bays=c.parking_bays)) for c in candidates),
        key=lambda pair: pair[1].residual_land_value)

    return Value(
        plot_id=pid,
        rlv=money.residual_land_value,
        rlv_psf_land=money.rlv_psf_land,
        gdv=money.gdv,
        floors=best.floors,
        units=money.total_units,
        binding_constraint=best.binding_constraint,
        hypothetical=hypothetical,
        basis=(
            f'residential schedule (RERA mix), {"conservative" if conservative else "optimistic"} '
            f'setback bound'
            + (f'; published use is {landuse}, so this scheme is hypothetical' if hypothetical else '')
        ),
    )


def appraise_all(features: list[dict], *, conservative: bool = True) -> dict[str, Value]:
    """Every parcel in the snapshot, keyed by plot number."""
    out: dict[str, Value] = {}
    for f in features:
        pid = str((f.get('attributes') or {}).get('PLOT_NUMBER') or '')
        if not pid:
            continue
        try:
            out[pid] = appraise_feature(f, conservative=conservative)
        except Exception as e:                  # never let one bad parcel stop the district
            out[pid] = Value(pid, None, None, None, None, None, None, True,
                             f'appraisal raised {type(e).__name__}: {e}')
    return out
