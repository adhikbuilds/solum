"""
From a rendered parcel to what it is worth.

This is the join the guide calls the crux of a semantic twin: a thing on screen must resolve to a
persistent entity, and the entity must carry meaning beyond its geometry. Here the identifier is
the DDA plot number -- the authority's own key, not an index into our output -- and the meaning
is the one this repo already computes: buildable envelope, massing candidates, and the residual
land value of the best of them.

**The two footprints differ, and the study's is the authoritative one.** The district bakes a
plate from permitted GFA over permitted storeys, which is a fast derivation good enough to give a
block its shape. The study path solves the envelope properly -- setbacks inset from the real
parcel edges, plate fitted to the site's dominant axis, candidates enumerated per storey count.
When the two disagree about a plot, the study is right and the district is scenery. Anything
reading a district plate as a scheme is reading it wrong, which is why `district_is_scenery`
travels in the response rather than living in a comment here.
"""

from __future__ import annotations

from solum_massing.dda import Provenance, fetch_plot
from solum_massing.envelope import buildable_envelope
from solum_massing.feasibility import appraise
from solum_massing.massing import generate
from solum_massing.solid import build_scene


def appraise_plot(plot_number: str, *, conservative: bool = True) -> dict:
    """
    Resolve one plot id to its regulation, its best massing candidate and its money.

    `conservative` sizes the envelope against the largest published setback. DDA names four
    setbacks but never says which parcel edge each applies to, so the honest answer is a range;
    this returns one end of it and says which end.
    """
    reg = fetch_plot(plot_number)
    env = buildable_envelope(reg)
    candidates = generate(reg, env, use_conservative=conservative)

    if not candidates:
        return {
            'plot_number': reg.plot_number,
            'resolved': True,
            'verdict': 'withheld',
            'why': 'no massing candidate survives the published envelope for this plot',
            'regulation': _regulation(reg),
        }

    priced = [
        (c, appraise(c.gfa_sqft, reg.area_sqft.value or 0.0,
                     floors=c.floors, parking_bays=c.parking_bays))
        for c in candidates
    ]
    best, money = max(priced, key=lambda pair: pair[1].residual_land_value)

    return {
        'plot_number': reg.plot_number,
        'resolved': True,
        'setback_bound': 'conservative' if conservative else 'optimistic',
        'regulation': _regulation(reg),
        'scheme': {
            'floors': best.floors,
            'gfa_sqft': round(best.gfa_sqft),
            'gfa_utilisation': round(best.gfa_utilisation, 4),
            'binding_constraint': best.binding_constraint,
            'total_units': money.total_units,
            'parking_bays': best.parking_bays,
        },
        'money': {
            'residual_land_value': money.residual_land_value,
            'rlv_psf_land': money.rlv_psf_land,
            'gdv': money.gdv,
            'non_land_cost': money.non_land_cost,
            'blended_psf': money.blended_psf,
            'breakeven_psf': money.breakeven_psf,
        },
        # The solved scheme's own geometry, so the answer can be seen where it would stand rather
        # than only read as a number. Rings come back relative to the parcel centroid, in the same
        # plan frame the district uses, so the viewer places them by adding the parcel's centroid.
        'geometry': _scheme_geometry(reg, env, candidates, best),
        'district_is_scenery': (
            'The block around this plot is massed from permitted GFA over permitted storeys. '
            'This scheme is solved from the parcel edges and the published setbacks, so where the '
            'two disagree about footprint, this one is the answer.'
        ),
        'candidates': len(candidates),
    }


def _scheme_geometry(reg, env, candidates, best) -> dict | None:
    """
    The best candidate as levels, one ring set per storey.

    `build_scene` is asked for the massing only -- no context parcels, no basemap -- because the
    district already supplies both, and re-fetching a block of neighbours to draw one scheme
    inside a district that is already on screen would be the study path duplicating the twin.
    """
    try:
        scene = build_scene(reg, env, candidates, with_context=False)
    except Exception:
        return None
    solids = scene.get('solids') or []
    solid = next((s for s in solids if s.get('candidate', {}).get('floors') == best.floors), None)
    if solid is None:
        solid = solids[0] if solids else None
    if solid is None:
        return None
    return {
        'levels': solid.get('levels') or [],
        'envelope_rings': (scene.get('geometry') or {}).get('envelope_conservative_rings') or [],
        'frame': 'local plan metres relative to the parcel centroid; add the parcel centroid to place',
    }


def _regulation(reg) -> dict:
    """The published envelope, each field still carrying where it came from."""
    def sourced(s):
        return {'value': s.value, 'provenance': s.provenance.value, 'basis': s.basis}

    return {
        'land_name': reg.land_name,
        'landuse': reg.landuse,
        'area_sqft': sourced(reg.area_sqft),
        'permitted_gfa_sqft': sourced(reg.permitted_gfa_sqft),
        'max_floors': sourced(reg.max_floors),
        'parking_rule': sourced(reg.parking_rule),
        'setbacks_complete': reg.setbacks_complete,
        'unavailable': [
            k for k, s in (
                ('area', reg.area_sqft), ('permitted GFA', reg.permitted_gfa_sqft),
                ('storeys', reg.max_floors), ('parking', reg.parking_rule),
            ) if s.provenance is Provenance.UNAVAILABLE
        ],
    }
