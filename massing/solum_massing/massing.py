"""
Deterministic massing candidates. No genetic algorithm, no solver, no ML.

The roadmap reached for OR-Tools and DEAP for this layer. Neither is needed yet, and the reason
is worth writing down because it saves the effort rather than deferring it.

On a DDA plot the permitted GFA is PUBLISHED. It is not something we maximise towards and
discover -- it is a hard ceiling stated by the authority. That collapses the search: a candidate
is a (footprint, floors) pair, both bounded, and the interesting ones are the handful that reach
the GFA ceiling without breaching the height or envelope limits. Enumerating a few hundred of
those is microseconds of arithmetic.

Genetic search earns its place when the objective is expensive and the space is huge. Here the
space is two-dimensional and the ceiling is given. Reaching for a solver would be building
machinery to search a space we can simply enumerate.
"""

from __future__ import annotations

from dataclasses import dataclass

from .dda import SQFT_PER_SQM, RegulatoryEnvelope
from .envelope import BuildableEnvelope


@dataclass
class Candidate:
    """One massing option: a footprint, stacked."""

    footprint_sqft: float
    floors: int
    gfa_sqft: float
    coverage: float             # footprint / plot area
    gfa_utilisation: float      # achieved GFA / permitted GFA
    parking_bays: int | None
    binding_constraint: str     # which limit stopped it going further

    @property
    def is_efficient(self) -> bool:
        """Within 2% of the permitted GFA -- i.e. it uses what the plot is entitled to."""
        return self.gfa_utilisation >= 0.98


def _bays(gfa_sqft: float, reg: RegulatoryEnvelope) -> int | None:
    """
    Parking from the authority's own rule, or None.

    None is a real answer: it means DDA did not state a rule for this plot and we decline to
    invent one. A bay count guessed at 1-per-unit would move construction cost by millions.
    """
    rule = reg.parking_rule.value
    if not rule:
        return None
    gfa_sqm = gfa_sqft / SQFT_PER_SQM
    return int(-(-gfa_sqm // rule))  # ceiling division: a part-bay is a bay


def generate(
    reg: RegulatoryEnvelope,
    env: BuildableEnvelope,
    *,
    use_conservative: bool = True,
) -> list[Candidate]:
    """
    Enumerate one optimal candidate per floor count.

    Floors -- not footprint -- is the natural parameter, because for any given floor count the
    best footprint is determined rather than searched: exactly `permitted GFA / floors`, capped
    by the envelope. Sweeping footprint on a grid instead (the obvious first instinct) misses
    the ceiling by whatever the grid resolution happens to be; on the reference plot it topped
    out at 95.8% of permitted GFA purely as a gridding artefact, which would read to a developer
    as "this plot cannot be fully used" when in fact it can.

    So the candidate set is at most `max_floors` entries, each exactly optimal for its height.

    `use_conservative=True` sizes against the larger setback, so the result understates
    buildable area while the side assignment is unresolved. That is the correct default: a
    feasibility number that is too low loses a deal, one that is too high loses money.
    """
    footprint_cap = env.conservative_sqft if use_conservative else env.optimistic_sqft
    max_floors = reg.max_floors.value
    permitted_gfa = reg.permitted_gfa_sqft.value
    plot_area = reg.area_sqft.value or env.parcel_sqft

    if not footprint_cap or not max_floors or not permitted_gfa:
        return []

    out: list[Candidate] = []
    for floors in range(1, int(max_floors) + 1):
        wanted = permitted_gfa / floors        # footprint that would exactly use the entitlement
        footprint = min(wanted, footprint_cap)
        gfa = footprint * floors

        # Which limit stopped this candidate going further.
        if footprint >= footprint_cap and wanted > footprint_cap:
            binding = 'envelope'               # the plate is as wide as the setbacks allow
        elif floors == int(max_floors) and gfa < permitted_gfa:
            binding = 'height'                 # out of storeys before out of entitlement
        else:
            binding = 'permitted GFA'          # fully uses what DDA permits

        out.append(Candidate(
            footprint_sqft=footprint,
            floors=floors,
            gfa_sqft=gfa,
            coverage=footprint / plot_area if plot_area else 0.0,
            gfa_utilisation=gfa / permitted_gfa,
            parking_bays=_bays(gfa, reg),
            binding_constraint=binding,
        ))

    return sorted(out, key=lambda c: (-c.gfa_sqft, c.floors))
