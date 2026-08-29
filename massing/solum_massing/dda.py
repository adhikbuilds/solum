"""
The regulatory envelope, read from the authority rather than encoded by us.

The received wisdom on Dubai feasibility tooling is that zoning rules are the hard part --
that you need a domain expert to sit with the municipal regulations and hand-encode setback,
FAR and parking tables per zone, and that getting one wrong silently produces confidently
wrong numbers.

For DDA-governed plots that is simply not true, and it is worth stating plainly because it
removes the largest risk item from the roadmap. The DDA parcel layer publishes, per plot:
permitted GFA, maximum height, plot coverage, all four building setbacks, and the parking
rule in prose. We do not encode those. We read them, and we record where each one came from.

Measured 2026-08-29 against the RERA project register: DDA governs 44.8% of Dubai's 3,039
registered projects. Trakhees 30.4%, Dubai Municipality 18.1%, Dubai South 4.2%, DSO 2.4%.
So this covers a little under half the market directly, and the rest needs another source.
That is a known gap, not a silent one -- see `Provenance.UNAVAILABLE`.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from enum import Enum

LAYER = (
    'https://gis.dda.gov.ae/server/rest/services/DDA/'
    'BASIC_LAND_BASE/MapServer/2/query'
)

# The DDA layer serves wkid 3997 -- Dubai Local Transverse Mercator, a PROJECTED system whose
# unit is the metre. This is the reason the geometry in envelope.py needs no reprojection: a
# setback of 10 is 10 metres, and shapely's buffer operates directly in those units. Had this
# been a geographic CRS (degrees) every offset would need projecting first, which is where
# geospatial code usually goes wrong.
SPATIAL_REFERENCE = 3997

SQFT_PER_SQM = 10.763910416709722


class Provenance(str, Enum):
    """
    Where a number came from. The repo's existing convention, applied to regulation.

    AUTHORITY is the only tier permitted to drive a buildable-area figure without a warning,
    because it is the only tier the authority itself published.
    """

    AUTHORITY = 'authority'      # published by DDA for this specific plot
    DERIVED = 'derived'          # computed from AUTHORITY values by us, losslessly
    ASSUMPTION = 'assumption'    # our guess. Must never reach a headline number unflagged
    DEFERRED = 'deferred'        # authority pointed at another document ('SEE NOTES')
    UNAVAILABLE = 'unavailable'  # the authority did not state it. Absence, not zero


@dataclass(frozen=True)
class Sourced:
    """A value with its provenance welded on, so the two cannot be separated downstream."""

    value: object
    provenance: Provenance
    basis: str

    def __repr__(self) -> str:
        return f'{self.value!r} [{self.provenance.value}: {self.basis}]'


@dataclass
class RegulatoryEnvelope:
    """What the authority permits on one plot. Every field carries its own provenance."""

    plot_number: str
    land_name: str | None
    landuse: str | None
    area_sqft: Sourced
    permitted_gfa_sqft: Sourced
    max_floors: Sourced
    setbacks_m: Sourced             # list[float], one per published side
    max_plot_coverage: Sourced
    parking_rule: Sourced
    rings: list[list[list[float]]] = field(default_factory=list)
    notes: str = ''
    setbacks_complete: bool = False

    @property
    def implied_far(self) -> Sourced:
        """
        FAR is not published; it is the ratio of two figures that are.

        Deriving it rather than assuming it matters: every competing tool asks the user to
        type a FAR, which makes the single most load-bearing input an `assumption`.
        """
        gfa, area = self.permitted_gfa_sqft.value, self.area_sqft.value
        if not area:
            return Sourced(None, Provenance.UNAVAILABLE, 'plot area is zero or absent')
        return Sourced(
            round(gfa / area, 4),
            Provenance.DERIVED,
            f'permitted GFA {gfa:,.0f} sqft / plot area {area:,.0f} sqft, both DDA-published',
        )


def _num(attrs: dict, key: str) -> float | None:
    v = attrs.get(key)
    if v in (None, '', 'N/A'):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None



# Values DDA uses to say "the number exists, but not in this field". Measured across 1,000
# residential plots on 2026-08-29: SEE NOTES 1,890, SEE GUIDELINES 48, SEE DRAWING 3. Just under
# half of residential plots (49.7%) defer at least one side this way, and 474 of 1,000 defer all
# four. Treating these as absent would silently shrink the setback list -- a plot published as
# ['SEE NOTES', '5', 'SEE NOTES', '3'] would look like a uniform 3-5 m site when two of its sides
# are genuinely unknown, and the "conservative" bound would not be conservative at all.
_DEFERRAL = re.compile(r'^\s*SEE\s+(NOTES?|DRAWINGS?|GUIDELINES?|SITE\s*PLAN)', re.I)

# 'SETBACK: 1.5M FROM NEIGHBORING PLOTS.' -- the simple, uniform phrasing, which is the only one
# we accept. '0 SETBACK FROM ALL SIDES; IN CASE OF BUILT STRUCTURES - 3M' is a conditional rule
# and is deliberately refused: it needs a judgement about what is being built.
_NOTE_SETBACK = re.compile(r'SETBACK\s*:?\s*([\d.]+)\s*M\b(?![^.]*\bIN CASE\b)', re.I)


def _parse_setbacks(attrs: dict, notes: str) -> tuple[Sourced, bool]:
    """
    Read the four published setbacks.

    Returns the values and whether the set is COMPLETE -- i.e. whether every side the authority
    named resolved to a number. Incompleteness is the important half: a bounded envelope is only
    a bound if we know all four sides.
    """
    raw = [attrs.get(f'BUILDING_SETBACK_SIDE{i}') for i in (1, 2, 3, 4)]
    named = [v for v in raw if v not in (None, '', 'N/A')]

    numeric: list[float] = []
    deferred = 0
    for v in named:
        try:
            numeric.append(float(v))
        except (TypeError, ValueError):
            if _DEFERRAL.match(str(v)):
                deferred += 1

    if deferred and not numeric:
        # Every side deferred. The prose sometimes carries a single uniform figure.
        m = _NOTE_SETBACK.search(notes or '')
        if m:
            val = float(m.group(1))
            return Sourced(
                [val] * 4, Provenance.AUTHORITY,
                f'DDA GENERAL_NOTES: uniform {val:g} m setback (all {deferred} sides said "see notes")',
            ), True
        return Sourced(
            [], Provenance.DEFERRED,
            f'DDA deferred all {deferred} setbacks to another document, and GENERAL_NOTES '
            f'states no simple uniform figure',
        ), False

    if deferred:
        return Sourced(
            numeric, Provenance.DEFERRED,
            f'DDA published {numeric} m for {len(numeric)} side(s) but deferred {deferred} to '
            f'another document. These values do NOT bound the envelope.',
        ), False

    if numeric:
        return Sourced(
            numeric, Provenance.AUTHORITY,
            f'DDA BUILDING_SETBACK_SIDE1..{len(numeric)} = {numeric} metres',
        ), True

    return Sourced([], Provenance.UNAVAILABLE, 'DDA published no building setbacks for this plot'), False


def _parse_floors(raw: object) -> Sourced:
    """
    'G+8' means ground plus eight, i.e. nine storeys. 'B+G+4P+50' carries basements and podiums.

    Returning the count without the notation would silently drop the ground floor, which is a
    whole storey of saleable area on every plot in Dubai.
    """
    if raw in (None, '', 'N/A', 0, '0'):
        return Sourced(None, Provenance.UNAVAILABLE, 'DDA published no floor limit')
    text = str(raw).strip().upper()
    m = re.search(r'G\s*\+\s*(\d+)', text)
    if m:
        above = int(m.group(1)) + 1  # +1 for ground itself
        return Sourced(above, Provenance.AUTHORITY, f'DDA MAX_HEIGHT_FLOORS {text!r} = G + {m.group(1)}')
    m = re.fullmatch(r'(\d+)', text)
    if m:
        return Sourced(int(m.group(1)), Provenance.AUTHORITY, f'DDA MAX_HEIGHT_FLOORS {text!r}')
    return Sourced(None, Provenance.UNAVAILABLE, f'DDA MAX_HEIGHT_FLOORS {text!r} not parseable')


def _parse_parking(notes: str) -> Sourced:
    """
    The parking ratio arrives as prose in GENERAL_NOTES, e.g.
    'PARKING: ONE BAY PER EVERY 50 SQ.M OF THE GFA'.

    We extract it when the phrasing is recognised and refuse when it is not. A parking ratio
    guessed from an unrecognised sentence is exactly the confidently-wrong number this module
    exists to prevent -- it would move every cost figure downstream without ever throwing.
    """
    if not notes:
        return Sourced(None, Provenance.UNAVAILABLE, 'no GENERAL_NOTES on this plot')
    m = re.search(r'ONE\s+BAY\s+PER\s+EVERY\s+([\d.]+)\s*SQ\.?\s*M', notes, re.I)
    if m:
        per_sqm = float(m.group(1))
        return Sourced(
            per_sqm,
            Provenance.AUTHORITY,
            f'DDA GENERAL_NOTES: one bay per {per_sqm:g} sqm of GFA',
        )
    if re.search(r'PARKING', notes, re.I):
        return Sourced(None, Provenance.UNAVAILABLE, 'GENERAL_NOTES mentions parking in unrecognised wording')
    return Sourced(None, Provenance.UNAVAILABLE, 'GENERAL_NOTES states no parking rule')


def parse_feature(feature: dict, spatial_reference: int = SPATIAL_REFERENCE) -> RegulatoryEnvelope:
    """Turn one raw ArcGIS feature into a provenance-tagged envelope. Pure -- no I/O."""
    attrs = feature.get('attributes', {})
    notes = attrs.get('GENERAL_NOTES') or ''

    area = _num(attrs, 'AREA_SQFT')
    gfa = _num(attrs, 'GFA_SQFT')

    sb, setbacks_complete = _parse_setbacks(attrs, notes)

    cov = _num(attrs, 'MAX_PLOT_COVERAGE')
    coverage = (
        Sourced(cov, Provenance.AUTHORITY, f'DDA MAX_PLOT_COVERAGE {cov}')
        if cov else Sourced(None, Provenance.UNAVAILABLE, 'DDA MAX_PLOT_COVERAGE absent or zero')
    )

    return RegulatoryEnvelope(
        plot_number=str(attrs.get('PLOT_NUMBER', '')),
        land_name=attrs.get('LAND_NAME'),
        landuse=attrs.get('LANDUSE_DETAILS') or attrs.get('MAIN_LANDUSE'),
        area_sqft=(
            Sourced(area, Provenance.AUTHORITY, 'DDA AREA_SQFT')
            if area else Sourced(None, Provenance.UNAVAILABLE, 'DDA AREA_SQFT absent')
        ),
        permitted_gfa_sqft=(
            Sourced(gfa, Provenance.AUTHORITY, 'DDA GFA_SQFT')
            if gfa else Sourced(None, Provenance.UNAVAILABLE, 'DDA GFA_SQFT absent')
        ),
        max_floors=_parse_floors(attrs.get('MAX_HEIGHT_FLOORS')),
        setbacks_m=sb,
        max_plot_coverage=coverage,
        parking_rule=_parse_parking(notes),
        rings=(feature.get('geometry') or {}).get('rings', []),
        notes=notes,
        setbacks_complete=setbacks_complete,
    )


def fetch_plot(plot_number: str, timeout: int = 30) -> RegulatoryEnvelope:
    """Fetch one plot from the live DDA layer. The only function here that does I/O."""
    if not re.fullmatch(r'\d{4,10}', str(plot_number)):
        raise ValueError(f'plot number must be 4-10 digits, got {plot_number!r}')
    params = urllib.parse.urlencode({
        'where': f"PLOT_NUMBER='{plot_number}'",
        'outFields': '*',
        'returnGeometry': 'true',   # the prototype set this false and discarded the parcel
        'f': 'json',
    })
    req = urllib.request.Request(
        f'{LAYER}?{params}',
        headers={'User-Agent': 'Mozilla/5.0 (Solum plot lookup)'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    if data.get('error'):
        raise RuntimeError(f'DDA rejected the request: {data["error"]}')
    feats = data.get('features') or []
    if not feats:
        raise LookupError(f'no plot {plot_number} in the DDA register')
    return parse_feature(feats[0], data.get('spatialReference', {}).get('wkid', SPATIAL_REFERENCE))
