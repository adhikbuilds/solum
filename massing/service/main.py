"""
Solum massing service.

One HTTP surface over the four pure modules: read the regulatory envelope from DDA, derive the
buildable envelope, enumerate massing candidates, and price each one.

The service does exactly one impure thing -- fetch from DDA -- and it is isolated in `dda.py`.
Everything downstream is a pure function over the fetched record, which is what makes a response
reproducible: the same plot record always yields the same candidates and the same money.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from solum_massing.dda import LAYER, Provenance, fetch_plot, parse_feature  # noqa: E402
from solum_massing.envelope import buildable_envelope  # noqa: E402
from solum_massing.feasibility import MIX_BASIS, RERA_MIX, appraise  # noqa: E402
from solum_massing.massing import generate  # noqa: E402
from solum_massing.solid import build_scene  # noqa: E402

app = FastAPI(
    title='Solum massing service',
    description='DDA regulatory envelope -> buildable envelope -> massing candidates -> feasibility',
    version='0.1.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'], allow_methods=['GET'], allow_headers=['*'],
)

STATIC = Path(__file__).resolve().parents[1]
FIXTURE = STATIC / 'fixtures' / 'parcel-3156315.json'


@app.get('/api/health')
def health() -> dict:
    return {'status': 'ok', 'source': LAYER, 'unit_mix_basis': MIX_BASIS}


@app.get('/api/mix')
def mix() -> dict:
    """The default unit schedule and where it came from."""
    return {
        'basis': MIX_BASIS,
        'provenance': Provenance.DERIVED.value,
        'types': [u.__dict__ for u in RERA_MIX],
    }


def _study(reg, *, conservative: bool = True) -> dict:
    """Assemble the full study for one plot record. Pure."""
    env = buildable_envelope(reg)
    candidates = generate(reg, env, use_conservative=conservative)
    scene = build_scene(reg, env, candidates, use_conservative=conservative)

    plot_area = reg.area_sqft.value or 0.0
    for solid, cand in zip(scene['solids'], candidates):
        f = appraise(
            cand.gfa_sqft, plot_area,
            parking_bays=cand.parking_bays,
        )
        solid['feasibility'] = f.as_dict()

    # Rank by residual land value: the candidate the land is worth most to.
    ranked = sorted(
        scene['solids'], key=lambda s: s['feasibility']['residual_land_value'], reverse=True
    )
    scene['best_by_rlv'] = ranked[0]['floors'] if ranked else None
    scene['setback_mode'] = 'conservative' if conservative else 'optimistic'
    return scene


@app.get('/api/plot/{plot_number}')
def plot(plot_number: str, optimistic: bool = False) -> dict:
    """
    Full massing study for a DDA plot.

    `optimistic=true` sizes the envelope against the smallest published setback instead of the
    largest. The two together bound the answer while the side assignment is unresolved.
    """
    try:
        reg = fetch_plot(plot_number)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # network, upstream shape changes
        raise HTTPException(502, f'DDA lookup failed: {e}') from e
    return _study(reg, conservative=not optimistic)


@app.get('/api/demo')
def demo(optimistic: bool = False) -> dict:
    """The bundled reference parcel. Works with no network, so the UI always has something."""
    import json
    feature = json.loads(FIXTURE.read_text())['features'][0]
    return _study(parse_feature(feature), conservative=not optimistic)


# The viewer is served from the same origin as the API, so there is no CORS story in the browser
# and no second thing to deploy.
app.mount('/fixtures', StaticFiles(directory=STATIC / 'fixtures'), name='fixtures')


@app.get('/')
def index() -> FileResponse:
    return FileResponse(STATIC / 'viewer.html')
