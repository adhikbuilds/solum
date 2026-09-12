"""
The city definition, held as configuration rather than as code.

The pipeline stays reusable; the city -- its extent, its projection, its origin, its sources,
its height rules, its attribution -- is content. That separation is the single most portable
idea in the twin literature, and it is also the reason this file exists at all: every value the
pipeline could otherwise hardcode is stated once, in `config/<city>.json`, where it can be read
by a person and cited by the manifest.

Loading validates. A config that omits its CRS, its origin or its sources is not a slightly
worse config, it is a config that produces geometry nobody can place, so it is refused here
rather than three stages downstream.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parents[1] / 'config'


@dataclass(frozen=True)
class Envelope:
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.xmin, self.ymin, self.xmax, self.ymax)

    def contains(self, x: float, y: float) -> bool:
        return self.xmin <= x <= self.xmax and self.ymin <= y <= self.ymax


@dataclass(frozen=True)
class CityConfig:
    """One city, one area of interest, fully described."""

    city: str
    aoi_id: str
    aoi_name: str
    envelope: Envelope
    target_crs: int
    origin: tuple[float, float]
    units: str
    axis_convention: str
    floor_height_m: float
    vertical: dict
    basis: dict
    lod: dict
    sources: list[dict]
    attribution: list[str]
    raw: dict

    @property
    def source_by_id(self) -> dict[str, dict]:
        return {s['id']: s for s in self.sources}

    def to_local(self, x: float, y: float) -> tuple[float, float]:
        """
        3997 metres -> local plan metres: east and north, relative to the origin.

        A translation, not a reprojection -- the source CRS is already metric, which is the whole
        reason the origin can be subtracted and nothing else done.

        The output stays a plan frame (east, north) rather than a Y-up scene frame, because that
        is exactly what `solum_massing.solid` emits to `Scene.tsx`, where the renderer supplies
        the Y-up step with a single `rotateX(-PI/2)`. Two frames in one repo is how a district and
        a study end up mirrored against each other.
        """
        return (x - self.origin[0], y - self.origin[1])


def load(city: str = 'dubai', path: Path | None = None) -> CityConfig:
    p = path or CONFIG_DIR / f'{city}.json'
    if not p.exists():
        raise FileNotFoundError(f'no city config at {p}')
    raw = json.loads(p.read_text())

    missing = [k for k in ('city', 'aoi', 'target_crs', 'origin', 'sources', 'height') if k not in raw]
    if missing:
        raise ValueError(f'{p.name} is missing required keys: {", ".join(missing)}')

    aoi = raw['aoi']
    if aoi.get('kind') != 'envelope':
        raise ValueError(f"only envelope AOIs are supported in the base, got {aoi.get('kind')!r}")
    if aoi.get('crs') != raw['target_crs']:
        raise ValueError(
            f"AOI is in EPSG:{aoi.get('crs')} but target_crs is EPSG:{raw['target_crs']}. "
            'The base does no reprojection of geometry by design -- state the AOI in the target CRS.'
        )

    env = Envelope(**{k: float(aoi['envelope'][k]) for k in ('xmin', 'ymin', 'xmax', 'ymax')})
    if env.xmin >= env.xmax or env.ymin >= env.ymax:
        raise ValueError('AOI envelope is empty or inverted')

    origin = (float(raw['origin']['x']), float(raw['origin']['y']))
    if not env.contains(*origin):
        raise ValueError('origin lies outside its own AOI envelope')

    return CityConfig(
        city=raw['city'],
        aoi_id=aoi['id'],
        aoi_name=aoi['name'],
        envelope=env,
        target_crs=int(raw['target_crs']),
        origin=origin,
        units=raw.get('units', 'metre'),
        axis_convention=raw.get('axis_convention', ''),
        floor_height_m=float(raw['height']['floor_height_m']),
        vertical=raw.get('vertical', {}),
        basis=raw.get('basis', {}),
        lod=raw.get('lod', {}),
        sources=raw['sources'],
        attribution=raw.get('attribution', []),
        raw=raw,
    )
