"""
Stage 1: pull the district once, and never touch it again.

Two rules govern this file.

**Raw is immutable.** A snapshot lands in `raw/<aoi>/<date>/` and is never overwritten. Re-running
on the same day is a no-op unless `--refetch` is passed, which writes a *new* dated snapshot
beside the old one. A twin whose source can be silently replaced cannot be rebuilt, and "it
looked different last week" becomes unanswerable.

**Pagination is not optional.** `solum_massing.fetch_context` issues one query for a ring around
a plot, which is fine for 66 neighbours. An ArcGIS MapServer caps a response at its own
`maxRecordCount` and says so in `exceededTransferLimit`; a district that crosses that cap and
ignores the flag gets a quietly truncated city. So this pages on `resultOffset` until the server
stops setting the flag, and records how many pages it took.

Nothing here runs in a render path. Acquisition is a command you run, whose output a build reads.
"""

from __future__ import annotations

import hashlib
import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from solum_massing.dda import LAYER, SPATIAL_REFERENCE

RAW_DIR = Path(__file__).resolve().parents[1] / 'raw'

# The DDA layer advertises maxRecordCount=1000. Asking for exactly that and paging on the flag
# means the client never has to know the server's cap -- if DDA lowers it, the flag still fires.
PAGE_SIZE = 1000
MAX_PAGES = 200          # ~200k parcels; a runaway loop stops being a fetch and becomes a scrape
USER_AGENT = 'Mozilla/5.0 (Solum city base)'

OUT_FIELDS = ','.join([
    'OBJECTID', 'PLOT_NUMBER', 'LAND_NAME', 'PROJECT_NAME', 'ENTITY_NAME',
    'AREA_SQM', 'AREA_SQFT', 'GFA_SQM', 'GFA_SQFT',
    'MAX_HEIGHT_FLOORS', 'MAX_HEIGHT_METERS', 'HEIGHT_CATEGORY',
    'MAX_PLOT_COVERAGE', 'CONSTRUCTION_STATUS',
    'MAIN_LANDUSE', 'SUB_LANDUSE', 'LANDUSE_DETAILS', 'LANDUSE_CATEGORY',
])


@dataclass(frozen=True)
class Snapshot:
    """A dated, immutable acquisition on disk."""

    directory: Path
    fetched_on: str
    pages: list[Path]
    feature_count: int
    truncated: bool
    source: dict

    def features(self) -> list[dict]:
        out: list[dict] = []
        for p in self.pages:
            out.extend(json.loads(p.read_text()).get('features') or [])
        return out


def _query(
    envelope: tuple[float, float, float, float], offset: int, crs: int,
    out_fields: str = OUT_FIELDS,
) -> str:
    xmin, ymin, xmax, ymax = envelope
    geometry = {
        'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax,
        'spatialReference': {'wkid': crs},
    }
    return urllib.parse.urlencode({
        'geometry': json.dumps(geometry),
        'geometryType': 'esriGeometryEnvelope',
        'inSR': str(crs),
        'outSR': str(crs),          # stated explicitly: the base does no reprojection downstream
        'spatialRel': 'esriSpatialRelIntersects',
        'outFields': out_fields,
        'returnGeometry': 'true',
        # Paging on resultOffset without a deterministic sort is a real hazard, not a theoretical
        # one: the server is free to return rows in a different order per request, which both
        # repeats and *skips* records across pages. The dedupe downstream catches repeats; nothing
        # catches a skip. Ordering by OBJECTID makes the page boundaries stable.
        'orderByFields': 'OBJECTID',
        'resultOffset': str(offset),
        'resultRecordCount': str(PAGE_SIZE),
        'f': 'json',
    })


def _get(url: str, timeout: int) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    if data.get('error'):
        raise RuntimeError(f'DDA rejected the request: {data["error"]}')
    return data


def snapshot_dir(aoi_id: str, on: str | None = None) -> Path:
    return RAW_DIR / aoi_id / (on or date.today().isoformat())


def latest(aoi_id: str) -> Snapshot | None:
    """The newest snapshot on disk for this AOI, or None if the district was never acquired."""
    base = RAW_DIR / aoi_id
    if not base.exists():
        return None
    dated = sorted((d for d in base.iterdir() if (d / 'source.json').exists()), reverse=True)
    if not dated:
        return None
    return read(dated[0])


def read(directory: Path) -> Snapshot:
    source = json.loads((directory / 'source.json').read_text())
    pages = [directory / name for name in source['pages']]
    for p in pages:
        if not p.exists():
            raise FileNotFoundError(f'snapshot {directory.name} lists {p.name}, which is missing')
    return Snapshot(
        directory=directory,
        fetched_on=source['fetched_on'],
        pages=pages,
        feature_count=source['feature_count'],
        truncated=source['truncated'],
        source=source,
    )


def fetch(
    aoi_id: str,
    envelope: tuple[float, float, float, float],
    *,
    crs: int = SPATIAL_REFERENCE,
    refetch: bool = False,
    timeout: int = 60,
    out_fields: str = OUT_FIELDS,
) -> Snapshot:
    """
    Acquire the AOI from the live DDA layer into a dated, immutable snapshot.

    Returns the existing snapshot untouched if today's already exists and `refetch` is false.
    """
    directory = snapshot_dir(aoi_id)
    if directory.exists() and (directory / 'source.json').exists() and not refetch:
        return read(directory)
    if directory.exists() and refetch:
        # Immutability means a new folder, not a rewritten one.
        stamp = 1
        while (alt := directory.parent / f'{directory.name}.{stamp}').exists():
            stamp += 1
        directory = alt

    directory.mkdir(parents=True, exist_ok=True)
    pages: list[str] = []
    checksums: dict[str, str] = {}
    total = 0
    truncated = False
    offset = 0

    for page_no in range(MAX_PAGES):
        body = _get(f'{LAYER}?{_query(envelope, offset, crs, out_fields)}', timeout)
        feats = body.get('features') or []
        name = f'page-{page_no:03d}.json'
        text = json.dumps(body, separators=(',', ':'))
        (directory / name).write_text(text)
        pages.append(name)
        checksums[name] = hashlib.sha256(text.encode()).hexdigest()[:16]
        total += len(feats)

        if not body.get('exceededTransferLimit') or not feats:
            break
        offset += len(feats)
    else:
        # Fell off the end of MAX_PAGES with the server still flagging more.
        truncated = True

    source = {
        'aoi': aoi_id,
        'fetched_on': date.today().isoformat(),
        'source_id': 'dda-parcels',
        'layer': LAYER,
        'crs': crs,
        'envelope': list(envelope),
        'out_fields': out_fields.split(','),
        'page_size': PAGE_SIZE,
        'pages': pages,
        'sha256_16': checksums,
        'feature_count': total,
        'truncated': truncated,
    }
    (directory / 'source.json').write_text(json.dumps(source, indent=2))
    return read(directory)


def from_fixture(path: Path) -> list[dict]:
    """
    The offline path: read an ArcGIS response already checked into the repo.

    `massing/fixtures/parcel-3156315.json` is a real, verified response, so the whole pipeline can
    be exercised and tested without a network call and without hammering a public authority layer.
    """
    return json.loads(Path(path).read_text()).get('features') or []
