"""
The contract between the pipeline and anything that reads it.

One dataclass per baked thing, one `Provenance` -- imported from `solum_massing.dda`, never
redefined. The repo already has exactly one vocabulary for where a number came from
(`authority` / `derived` / `assumption` / `deferred` / `unavailable`) and a twin that invented a
second one would let a value cross between them and lose its tag on the way.

Two fields on `Parcel` carry the weight:

`height` records which rung of the chain produced the height, so a renderer can shade an
assumption differently from an authority figure, and a reader can ask what a wrong-looking
tower was made from.

Geometry is carried as a list of parts, each `[exterior, *holes]`, so a two-piece parcel and a
parcel with a courtyard stay distinguishable. A flat ring list cannot tell them apart, and a
renderer resolving that ambiguity by guessing punches a void through a building.

`render` is the honest-absence switch. `solid` means there is both a resolved height and a
derivable floor plate. `outline` means the parcel is real but the building on it is not known,
and it is drawn flat on the ground. There is no third state where a plausible box gets drawn
anyway.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from solum_massing.dda import Provenance

from .heights import Height

Ring = list[list[float]]        # one closed ring of [x, y] in local plan metres
Part = list[Ring]               # one polygon: [exterior, *holes]


@dataclass(frozen=True)
class Parcel:
    """One baked parcel, in scene metres, ready to render."""

    id: str                       # DDA PLOT_NUMBER -- stable, and the join key back to source
    object_id: int | None
    name: str | None
    project: str | None
    landuse: str | None
    status: str | None            # DDA CONSTRUCTION_STATUS: is anything standing there
    area_sqm: float | None
    gfa_sqm: float | None
    height: Height
    render: str                   # 'solid' | 'outline'
    footprint: list[Part]         # the massing plate, or the plot itself when outlined
    plot: list[Part]              # the cadastral boundary, always
    beyond_aoi: bool = False      # parcel intersects the AOI but extends past its edge

    def to_json(self) -> dict:
        return {
            'id': self.id,
            'object_id': self.object_id,
            'name': self.name,
            'project': self.project,
            'landuse': self.landuse,
            'status': self.status,
            'area_sqm': self.area_sqm,
            'gfa_sqm': self.gfa_sqm,
            'height_m': self.height.metres,
            'floors': self.height.floors,
            'height_source': self.height.source_field,
            'height_provenance': self.height.provenance.value,
            'height_basis': self.height.basis,
            'render': self.render,
            'footprint': self.footprint,
            'plot': self.plot,
            'beyond_aoi': self.beyond_aoi,
        }


@dataclass
class Rejected:
    """A source feature the pipeline refused, and why. Reported, never silently dropped."""

    id: str
    reason: str


@dataclass
class Stats:
    fetched: int = 0
    kept: int = 0
    rejected: int = 0
    solid: int = 0
    outlined: int = 0
    beyond_aoi: int = 0
    by_height_provenance: dict[str, int] = field(default_factory=dict)
    by_status: dict[str, int] = field(default_factory=dict)
    by_landuse: dict[str, int] = field(default_factory=dict)
    tallest_m: float | None = None
    total_gfa_sqm: float = 0.0
    # As-built (OSM) and value (engine) layers. Kept in the same report as the permitted massing
    # because the interesting numbers are the differences between them.
    built_count: int = 0
    built_with_surveyed_height: int = 0
    built_at_permitted_ceiling: int = 0
    built_shape_only: int = 0
    built_footprint_sqm: float = 0.0
    parcels_with_a_building: int = 0
    priced: int = 0
    withheld: int = 0
    hypothetical: int = 0
    rlv_psf_land: dict[str, float] = field(default_factory=dict)


@dataclass
class Manifest:
    """
    Everything needed to place, trust and rebuild the district.

    The guide's non-negotiable is that no processed asset may leave the pipeline without enough
    metadata to reconstruct source CRS, destination CRS, origin, axis convention, units and
    vertical datum. That list is this dataclass, plus the provenance histogram that says how much
    of the district is authority and how much is inference.
    """

    city: str
    aoi_id: str
    aoi_name: str
    built_at: str
    basis: str                    # 'permitted' -- what the heights mean
    basis_statement: str
    source_crs: int
    target_crs: int
    origin: list[float]
    axis_convention: str
    units: str
    vertical: dict
    lod: str
    floor_height_m: float
    height_chain: list[str]
    sources: list[dict]
    attribution: list[str]
    snapshot: dict                # which raw acquisition this was baked from
    stats: Stats
    rejected: list[Rejected]

    def to_json(self) -> dict:
        d = asdict(self)
        d['stats'] = asdict(self.stats)
        d['rejected'] = [asdict(r) for r in self.rejected]
        return d
