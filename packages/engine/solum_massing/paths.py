"""
Where the checked-in test data lives.

Every consumer used to walk up from its own `__file__` -- `parents[3] / 'fixtures'` in one place,
`parents[1] / 'fixtures'` in another -- which meant moving a module changed what it pointed at,
silently. A wrong `parents[N]` does not raise; it resolves to a directory that happens not to
exist, and the failure surfaces later as an empty result. Anchoring on this module instead means
the answer depends on where the *package* is, not on how deeply a caller is nested inside it.
"""

from __future__ import annotations

from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures'


def fixture(name: str = 'parcel-3156315.json') -> Path:
    """A verified ArcGIS response checked into the repo, by file name."""
    p = FIXTURES / name
    if not p.exists():
        raise FileNotFoundError(f'no fixture {name} in {FIXTURES}')
    return p
