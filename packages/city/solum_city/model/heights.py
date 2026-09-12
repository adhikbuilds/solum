"""
One height per parcel, resolved by a chain that is allowed to fail.

Stage 4 of any city-twin pipeline is where twins quietly go wrong: a missing height gets a
"reasonable" default, the default is invisible in the render, and from then on the model looks
authoritative everywhere including where it is invented. The defence is not a better guess. It
is an ordered chain, a recorded source per feature, and a terminal rung that returns nothing.

The chain, best first:

  1. MAX_HEIGHT_METERS  -- metres published by DDA for this plot            AUTHORITY
  2. MAX_HEIGHT_FLOORS  -- 'G+8' storeys x an assumed floor-to-floor        DERIVED
  3. HEIGHT_CATEGORY    -- a storey band like '9 - 10', midpoint x the same ASSUMPTION
  4. nothing            -- absence, carried forward as absence              UNAVAILABLE

Rung 4 has no default under it on purpose. A parcel with no published height renders as a ground
outline; inventing a height there would draw a building that does not exist.

Every rung above metres is a *permitted* height, not an as-built one -- see `basis` in the city
config. This module resolves what the authority allows. It cannot see what is standing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from solum_massing.dda import Provenance, _parse_floors


@dataclass(frozen=True)
class Height:
    """A resolved height with the rung it came from welded on."""

    metres: float | None
    floors: int | None
    source_field: str | None
    provenance: Provenance
    basis: str

    @property
    def known(self) -> bool:
        return self.metres is not None and self.metres > 0


def _category_midpoint(raw: object) -> float | None:
    """
    'HEIGHT_CATEGORY' arrives as a storey band: '9 - 10', '1 - 4', '50+'.

    The midpoint of a band is a genuine estimate and is tagged ASSUMPTION accordingly. A '50+'
    open band has no midpoint, so it takes its lower bound -- understating a supertall is the
    safe direction; overstating it puts a tower in the skyline on the strength of a plus sign.
    """
    if raw in (None, '', 'N/A'):
        return None
    text = str(raw).strip()
    m = re.fullmatch(r'(\d+)\s*[-–]\s*(\d+)', text)
    if m:
        return (int(m.group(1)) + int(m.group(2))) / 2
    m = re.fullmatch(r'(\d+)\s*\+', text)
    if m:
        return float(m.group(1))
    m = re.fullmatch(r'(\d+)', text)
    if m:
        return float(m.group(1))
    return None


def resolve(attrs: dict, floor_height_m: float) -> Height:
    """Run the chain over one raw DDA attribute record. Pure."""
    # 1. Metres, straight from the authority.
    try:
        metres = float(attrs.get('MAX_HEIGHT_METERS') or 0)
    except (TypeError, ValueError):
        metres = 0.0
    if metres > 0:
        return Height(
            metres=round(metres, 1),
            floors=None,
            source_field='MAX_HEIGHT_METERS',
            provenance=Provenance.AUTHORITY,
            basis=f'DDA MAX_HEIGHT_METERS = {metres:g} m',
        )

    # 2. Storeys. `_parse_floors` is imported rather than re-implemented: 'G+8' means nine
    #    storeys, and a second parser that forgot the ground floor would drop a storey of
    #    saleable area on every plot in Dubai without ever throwing.
    floors = _parse_floors(attrs.get('MAX_HEIGHT_FLOORS'))
    if floors.provenance is Provenance.AUTHORITY and floors.value:
        n = int(floors.value)
        return Height(
            metres=round(n * floor_height_m, 1),
            floors=n,
            source_field='MAX_HEIGHT_FLOORS',
            provenance=Provenance.DERIVED,
            basis=f'{floors.basis}; x {floor_height_m} m floor-to-floor (assumption)',
        )

    # 3. A storey band.
    mid = _category_midpoint(attrs.get('HEIGHT_CATEGORY'))
    if mid:
        n = int(round(mid))
        return Height(
            metres=round(mid * floor_height_m, 1),
            floors=n,
            source_field='HEIGHT_CATEGORY',
            provenance=Provenance.ASSUMPTION,
            basis=(
                f'DDA HEIGHT_CATEGORY {str(attrs.get("HEIGHT_CATEGORY"))!r} -> {mid:g} storeys '
                f'(band midpoint); x {floor_height_m} m floor-to-floor'
            ),
        )

    # 4. Absence.
    return Height(
        metres=None,
        floors=None,
        source_field=None,
        provenance=Provenance.UNAVAILABLE,
        basis='DDA published no height, storey limit or height category for this parcel',
    )
