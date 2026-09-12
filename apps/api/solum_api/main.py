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
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from solum_massing.paths import fixture
from solum_massing.dda import LAYER, Provenance, fetch_plot, parse_feature
from solum_massing.envelope import buildable_envelope
from solum_massing.feasibility import MIX_BASIS, RERA_MIX, appraise
from solum_massing.massing import generate
from solum_massing.solid import build_scene
from solum_api.city import router as city_router, shutdown as city_shutdown, startup as city_startup

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Open the Postgres pool for the life of the process, and close it once."""
    city_startup()
    try:
        yield
    finally:
        city_shutdown()

app = FastAPI(
    lifespan=lifespan,
    title='Solum massing service',
    description='DDA regulatory envelope -> buildable envelope -> massing candidates -> feasibility',
    version='0.1.0',
)

# The city surface -- tiles, search, the manifest and the study -- used to be a second FastAPI
# app on a second port reading three generated files. It is the same pure modules underneath, so
# two apps over them was a staging decision rather than a design. One backend, one origin.
app.include_router(city_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'], allow_methods=['GET'], allow_headers=['*'],
    # The tile route sets Content-Encoding and an ETag; a browser on another origin
    # cannot read either unless they are exposed.
    expose_headers=['ETag', 'Content-Encoding'],
)

FIXTURE = fixture()

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
            floors=cand.floors,
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

MAX_COMPARE = 12

def _best_by_rlv(reg, *, conservative: bool):
    """
    The highest-RLV candidate for one plot under one setback bound, plus its envelope.

    Deliberately not `_study`: that calls `build_scene`, which fetches the surrounding parcels
    for 3D context. Screening a dozen plots does not need a dozen context fetches to rank them,
    and the ranking uses no geometry at all.
    """
    env = buildable_envelope(reg)
    candidates = generate(reg, env, use_conservative=conservative)
    if not candidates:
        return None, env, []
    priced = [
        (
            c,
            appraise(
                c.gfa_sqft, reg.area_sqft.value or 0.0,
                floors=c.floors, parking_bays=c.parking_bays,
            ),
        )
        for c in candidates
    ]
    return max(priced, key=lambda pair: pair[1].residual_land_value), env, candidates

def _bound(pair) -> dict | None:
    """One end of a plot's range: the best candidate under one setback assignment."""
    if pair is None:
        return None
    c, f = pair
    return {
        'floors': c.floors,
        'gfa_sqft': round(c.gfa_sqft),
        'gfa_utilisation': round(c.gfa_utilisation, 4),
        'binding_constraint': c.binding_constraint,
        'total_units': f.total_units,
        'residual_land_value': f.residual_land_value,
        'rlv_psf_land': f.rlv_psf_land,
    }

@app.get('/api/compare')
def compare(plots: str, geometry: bool = False) -> dict:
    """
    Screen several plots side by side.

    Every plot is returned as a **range**, never a point: `low` prices the envelope with the
    largest published setback on every edge, `high` with the smallest. DDA publishes SIDE1..SIDE4
    without saying which polygon edge each belongs to, so a single number here would assert an
    ordering the data cannot support -- one plot's conservative case can outrank another's
    optimistic one. `contested_by` marks exactly that: it names the rows ranked below this one whose
    range still reaches it, so an ordering the register does not settle is stated rather than implied.

    `geometry=true` adds the winning candidate's slabs and parcel outline per plot, so the screened
    set can be drawn as buildings rather than only tabulated. Context is deliberately not fetched
    for these -- a dozen thumbnails do not need a dozen neighbourhood queries, and at thumbnail
    size a block of neighbours is noise.

    A plot the DDA register does not carry is a first-class row (`status: off_register`), not an
    error. DDA covers ~44.8% of Dubai; the rest sits with Trakhees, Dubai Municipality, Dubai
    South and DSO. Dropping those rows would make the tool look broken on more than half the city.
    """
    numbers, seen = [], set()
    for raw in plots.split(','):
        n = raw.strip()
        if n and n not in seen:
            seen.add(n)
            numbers.append(n)
    if not numbers:
        raise HTTPException(400, 'no plot numbers given')
    if len(numbers) > MAX_COMPARE:
        raise HTTPException(400, f'{len(numbers)} plots requested; the limit is {MAX_COMPARE}')

    rows = []
    for n in numbers:
        try:
            reg = fetch_plot(n)
        except ValueError as e:
            rows.append({'plot_number': n, 'status': 'invalid', 'detail': str(e)})
            continue
        except LookupError:
            rows.append({
                'plot_number': n, 'status': 'off_register',
                'detail': 'not on the DDA register -- may sit with Trakhees, Dubai Municipality, '
                          'Dubai South or DSO, which publish no equivalent parcel layer',
            })
            continue
        except Exception as e:
            rows.append({'plot_number': n, 'status': 'error', 'detail': f'DDA lookup failed: {e}'})
            continue

        low, env, candidates_low = _best_by_rlv(reg, conservative=True)
        high, _, _ = _best_by_rlv(reg, conservative=False)
        if low is None or high is None:
            rows.append({
                'plot_number': n, 'status': 'no_candidates',
                'detail': env.basis or 'no massing candidate fits the published limits',
            })
            continue

        shape = None
        if geometry:
            best_floors = low[0].floors
            scene = build_scene(reg, env, candidates_low, use_conservative=True, with_context=False)
            hit = next((s for s in scene['solids'] if s['floors'] == best_floors), None)
            if hit:
                shape = {
                    'parcel_rings': scene['geometry']['parcel_rings'],
                    'envelope_rings': scene['geometry']['envelope_conservative_rings'],
                    'levels': hit['levels'],
                    'height_m': hit['height_m'],
                    'floors': hit['floors'],
                }

        rows.append({
            'plot_number': reg.plot_number or n,
            'status': 'ok',
            'geometry': shape,
            'landuse': reg.landuse,
            'land_name': reg.land_name,
            'area_sqft': reg.area_sqft.value,
            'permitted_gfa_sqft': reg.permitted_gfa_sqft.value,
            'max_floors': reg.max_floors.value,
            'implied_far': reg.implied_far.value,
            'low': _bound(low),
            'high': _bound(high),
            # False when a side was deferred: low/high no longer bracket the answer, they are
            # just two readings. The UI must not present that as a range.
            'bounded': env.bounded,
            'setbacks_complete': reg.setbacks_complete,
            'parking_deferred': reg.parking_rule.value is None,
            'provenance': {
                'area_sqft': reg.area_sqft.basis,
                'permitted_gfa_sqft': reg.permitted_gfa_sqft.basis,
                'max_floors': reg.max_floors.basis,
                'setbacks_m': reg.setbacks_m.basis,
                'parking': reg.parking_rule.basis,
                'envelope': env.basis,
            },
        })

    priced = [r for r in rows if r['status'] == 'ok']
    priced.sort(key=lambda r: r['low']['residual_land_value'], reverse=True)

    # A ranked list asserts that every row beats every row beneath it. On bounded ranges that
    # claim only holds where the intervals are disjoint, so each row names the rows below it that
    # its own range still reaches. Rows are sorted by `low` descending, so for j below i we have
    # low[j] <= low[i]; the intervals therefore overlap exactly when high[j] >= low[i].
    #
    # Comparing each row against the leader alone is not enough: two mid-table rows can overlap
    # each other while both sit clear of the top row, and the table would silently assert an
    # order it cannot support.
    for i, r in enumerate(priced):
        if not r['bounded']:
            # A deferred side means low and high are two readings, not two ends. There is no
            # interval to intersect, so the ordering is unknown rather than contested or clear.
            r['contested_by'] = None
            continue
        r['contested_by'] = [
            o['plot_number'] for o in priced[i + 1:]
            if not o['bounded'] or o['high']['residual_land_value'] >= r['low']['residual_land_value']
        ]

    rest = [r for r in rows if r['status'] != 'ok']
    return {
        'rows': priced + rest,
        'ranked_on': 'residual_land_value, conservative bound, descending',
        'requested': len(numbers),
        'priced': len(priced),
    }

@app.get('/api/demo')
def demo(optimistic: bool = False) -> dict:
    """The bundled reference parcel. Works with no network, so the UI always has something."""
    import json
    feature = json.loads(FIXTURE.read_text())['features'][0]
    return _study(parse_feature(feature), conservative=not optimistic)

# The reference parcel is served from the same origin as the API, so there is no CORS story in
# the browser. The single-plot viewer that used to be served from here is gone: `apps/web` is the
# frontend now, and two of them meant two things to keep in step.
app.mount('/fixtures', StaticFiles(directory=FIXTURE.parent), name='fixtures')

