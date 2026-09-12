"""
A city in a file: fill an empty database without a network fetch.

    python -m solum_city.db.seed                    # load the committed seed into Postgres
    python -m solum_city.db.seed --warm             # ...and build the z8-12 overview tiles
    python -m solum_city.db.seed --extract          # regenerate the seed from a full snapshot

The problem this solves is the first five minutes of a fresh clone. `solum_city/raw/` is gitignored --
206 MB of dated ArcGIS pages that nobody should carry in git -- so `python -m solum_city.db.load` on a
new machine says "no snapshot on disk" and the only way forward is a twenty-minute fetch against
a public authority layer, followed by a twenty-minute massing bake. That is a reasonable thing to
ask of someone rebuilding the city. It is an unreasonable thing to ask of someone who wants to
see whether the stack runs.

So one district is committed instead: `twin/seed/downtown-dubai.json`, a 6 km x 6 km window of
the same DDA layer centred on the Burj Khalifa district -- 1,078 plots, ~1.9 MB, the exact area
the reference products show. It is a verbatim slice of a dated snapshot, not a synthesised or
rounded one: the attributes are the authority's own, the rings are in EPSG:3997 as delivered, and
`seed.sha256` pins the feature array so a silently edited seed is detectable.

**It goes through the real loader.** `load.load()` takes a `snapshot` override, and the adapter
below answers the four things it asks of a snapshot. Nothing about the ingest -- the height
chain, the placeholder cleaning, the RLV, the dual geometry, the idempotency -- is reimplemented
here, because a second loader that drifts from the first is worse than no seed at all.

**It bakes its own massing.** The file pipeline writes `out/<aoi>/massing.geojsonl` in a
twenty-minute parallel run over 100k plots; 1,078 plots is a few seconds in-process, so the seed
carries no derived geometry and the plates are computed at load time. The seeded map shows real
volumes, not flat outlines.

The seeded AOI is `downtown-dubai`, distinct from `dubai-all`, so seeding never collides with or
overwrites a real city load. A machine can hold both.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

from solum_city.db import load as loader
from solum_city.pipeline.city import _mass_one

SEED_DIR = ROOT / 'seed'
DEFAULT_SEED = SEED_DIR / 'downtown-dubai.json'
AOI = 'downtown-dubai'

# The window the seed is cut to, in EPSG:3997 metres: the Burj Khalifa district and Business Bay.
# Centre is the mean first-vertex of the 53 parcels the layer itself labels BURJ KHALIFA DISTRICT,
# so the window is anchored to the data rather than to a coordinate typed from a map.
WINDOW_CENTRE = (494643, 2787278)
WINDOW_HALF_M = 3000

class _SeedSnapshot:
    """
    What `load.load()` asks of a snapshot, answered from a committed file.

    Duck-typed rather than constructed as `parcels.Snapshot`, which is frozen around a directory
    of pages that a seed does not have.
    """

    def __init__(self, doc: dict, path: Path):
        meta = doc['seed']
        self._features = doc['features']
        self.path = path
        self.meta = meta
        self.fetched_on = meta['extracted_from']['fetched_on']
        self.feature_count = meta['feature_count']
        # The row in `snapshots` says, in its own source JSON, that it came from a seed and which
        # acquisition it was cut from. A database whose provenance stops at "someone loaded
        # something" cannot answer the only question that matters about a number on the screen.
        self.source = {
            'aoi': AOI,
            'source_id': meta['extracted_from']['source_id'],
            'layer': meta['extracted_from']['layer'],
            'crs': meta['extracted_from']['crs'],
            'fetched_on': self.fetched_on,
            'feature_count': meta['feature_count'],
            'truncated': False,
            'seeded_from': str(path.name),
            'seed_sha256': meta['sha256'],
            'cut_from_snapshot': {
                'aoi': meta['extracted_from']['aoi'],
                'feature_count': meta['extracted_from']['snapshot_feature_count'],
            },
            'envelope': meta['envelope_3997'],
            'out_fields': meta['out_fields'],
        }

    def features(self) -> list[dict]:
        return self._features

def _digest(features: list[dict]) -> str:
    return hashlib.sha256(
        json.dumps(features, separators=(',', ':'), sort_keys=True).encode()
    ).hexdigest()

def read(path: Path = DEFAULT_SEED) -> _SeedSnapshot:
    """Parse and verify the seed. A seed that fails its own checksum is not loaded."""
    if not path.exists():
        raise FileNotFoundError(f'no seed at {path}; regenerate with --extract')
    doc = json.loads(path.read_text())
    snap = _SeedSnapshot(doc, path)
    actual = _digest(doc['features'])
    if actual != snap.meta['sha256']:
        raise ValueError(
            f'{path.name} does not match its own sha256 -- the feature array has been edited '
            f'since it was cut (recorded {snap.meta["sha256"][:12]}, found {actual[:12]}). '
            f'Regenerate with --extract rather than hand-editing a snapshot slice.'
        )
    if len(doc['features']) != snap.feature_count:
        raise ValueError(f'{path.name} declares {snap.feature_count} features, carries '
                         f'{len(doc["features"])}')
    return snap

def seed(dsn: str, path: Path = DEFAULT_SEED, *, warm: bool = False) -> int:
    snap = read(path)
    print(f'· seed {path.name}: {snap.feature_count:,} plots, '
          f'cut from the {snap.fetched_on} {snap.meta["extracted_from"]["aoi"]} snapshot')

    volumes: list[dict] = []
    for feat in snap.features():
        for v in _mass_one(feat) or ():
            volumes.append(v)
    print(f'· massed {len(volumes):,} volumes in-process')

    return loader.load(dsn, AOI, warm=warm, snapshot=snap, massing_features=volumes)

def extract(source_aoi: str = 'dubai-all', path: Path = DEFAULT_SEED) -> int:
    """
    Re-cut the seed from a full snapshot on disk. Needs `solum_city/raw/`; developers regenerating the
    seed have it, everyone else just loads the committed result.
    """
    from solum_city.sources import parcels

    snap = parcels.latest(source_aoi)
    if snap is None:
        print(f'! no snapshot on disk for {source_aoi}; run `python -m solum_city.pipeline.city fetch`')
        return 1

    cx, cy = WINDOW_CENTRE
    selected = []
    for feat in snap.features():
        rings = (feat.get('geometry') or {}).get('rings')
        if not rings or len(rings[0]) < 4:
            continue
        x, y = rings[0][0][0], rings[0][0][1]
        if abs(x - cx) < WINDOW_HALF_M and abs(y - cy) < WINDOW_HALF_M:
            selected.append(feat)
    # Ordered by OBJECTID so a re-cut of the same snapshot is byte-identical and the checksum is
    # meaningful. Page order is the server's, and the server does not promise one.
    selected.sort(key=lambda f: f['attributes'].get('OBJECTID') or 0)

    xs = [c[0] for f in selected for ring in f['geometry']['rings'] for c in ring]
    ys = [c[1] for f in selected for ring in f['geometry']['rings'] for c in ring]
    doc = {
        'seed': {
            'id': AOI,
            'title': 'Downtown Dubai and Business Bay',
            'description': (
                f'A {WINDOW_HALF_M * 2 // 1000} km x {WINDOW_HALF_M * 2 // 1000} km window of the '
                'DDA parcel layer, centred on the Burj Khalifa district. Committed so a fresh '
                'clone can fill an empty database without a network fetch and without the '
                '206 MB city-wide snapshot.'
            ),
            'feature_count': len(selected),
            'window_3997': {'centre': list(WINDOW_CENTRE), 'half_extent_m': WINDOW_HALF_M},
            'envelope_3997': [min(xs), min(ys), max(xs), max(ys)],
            'sha256': _digest(selected),
            'provenance': 'authority',
            'extracted_from': {
                'source_id': snap.source['source_id'],
                'layer': snap.source['layer'],
                'crs': snap.source['crs'],
                'fetched_on': snap.source['fetched_on'],
                'aoi': snap.source['aoi'],
                'snapshot_feature_count': snap.source['feature_count'],
            },
            'out_fields': snap.source['out_fields'],
            'regenerate': 'python -m solum_city.db.seed --extract',
        },
        'features': selected,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1))
    print(f'· {len(selected):,} plots -> {path} ({path.stat().st_size / 1e6:.2f} MB)')
    return 0

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--dsn', default=os.environ.get('SOLUM_DSN', loader.DEFAULT_DSN))
    ap.add_argument('--file', type=Path, default=DEFAULT_SEED)
    ap.add_argument('--warm', action='store_true',
                    help='build the z8-12 overview tiles after seeding')
    ap.add_argument('--extract', action='store_true',
                    help='regenerate the seed file from the full snapshot on disk')
    ap.add_argument('--source-aoi', default='dubai-all', help='snapshot to cut --extract from')
    a = ap.parse_args(argv)
    if a.extract:
        return extract(a.source_aoi, a.file)
    return seed(a.dsn, a.file, warm=a.warm)

if __name__ == '__main__':
    raise SystemExit(main())
