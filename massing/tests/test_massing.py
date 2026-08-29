"""
Tests pin the behaviour that matters: the engine reads regulation, and refuses to invent it.
"""

import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from solum_massing.dda import Provenance, _parse_floors, _parse_parking, parse_feature
from solum_massing.envelope import buildable_envelope
from solum_massing.massing import generate

FIXTURE = pathlib.Path(__file__).resolve().parents[1] / 'fixtures' / 'parcel-3156315.json'


@pytest.fixture
def reg():
    return parse_feature(json.loads(FIXTURE.read_text())['features'][0])


@pytest.fixture
def env(reg):
    return buildable_envelope(reg)


# --- the polygon is real, and self-consistent -------------------------------------------------

def test_polygon_area_matches_the_authoritys_own_figure(reg, env):
    """
    The strongest available check that we are reading the geometry correctly: compute the area
    ourselves from the ring and compare with the AREA_SQFT the same authority published.
    """
    assert env.parcel_sqft == pytest.approx(reg.area_sqft.value, rel=0.001)


def test_far_is_derived_not_assumed(reg):
    far = reg.implied_far
    assert far.provenance is Provenance.DERIVED
    assert far.value == pytest.approx(2.0, abs=0.01)


# --- parsing the authority's notation ---------------------------------------------------------

def test_ground_plus_eight_is_nine_storeys():
    """G+8 is nine floors. Dropping the ground floor loses a whole storey of saleable area."""
    assert _parse_floors('G+8').value == 9
    assert _parse_floors('G + 12').value == 13


def test_unparseable_height_is_unavailable_not_zero():
    for raw in (None, '', 'N/A', 0, 'SEE SITE PLAN'):
        assert _parse_floors(raw).provenance is Provenance.UNAVAILABLE
        assert _parse_floors(raw).value is None


def test_parking_rule_is_read_when_stated_and_refused_when_not():
    ok = _parse_parking('- PARKING: ONE BAY PER EVERY 50 SQ.M OF THE GFA FOR ALL BUILDINGS')
    assert ok.provenance is Provenance.AUTHORITY and ok.value == 50.0

    # Mentions parking, but in wording we do not recognise. Refusing is the point.
    vague = _parse_parking('- PARKING AS PER DUBAI MUNICIPALITY REQUIREMENTS.')
    assert vague.provenance is Provenance.UNAVAILABLE and vague.value is None


# --- the setback ambiguity is surfaced, not resolved by guessing -------------------------------

def test_uneven_setbacks_produce_a_bounded_range_and_admit_it(reg, env):
    assert reg.setbacks_m.value == [20.0, 10.0, 10.0, 10.0]
    assert env.ambiguous is True
    assert env.conservative_sqft < env.optimistic_sqft
    assert 'does not state which polygon edge' in env.basis


def test_envelope_is_strictly_inside_the_parcel(env):
    assert env.optimistic_sqft < env.parcel_sqft
    assert env.conservative.within(env.optimistic)


# --- the finding worth protecting -------------------------------------------------------------

def test_gfa_ceiling_binds_before_the_envelope_for_taller_schemes(reg, env):
    """
    The setback ambiguity does NOT change achievable GFA once a scheme is tall enough, because
    the published GFA ceiling binds first. That is what makes the unresolved side assignment
    tolerable rather than blocking: it only costs us precision on low-rise.
    """
    conservative = {c.floors: c for c in generate(reg, env, use_conservative=True)}
    optimistic = {c.floors: c for c in generate(reg, env, use_conservative=False)}

    for floors in (5, 6, 7, 8, 9):
        assert conservative[floors].gfa_sqft == pytest.approx(optimistic[floors].gfa_sqft)
        assert conservative[floors].binding_constraint == 'permitted GFA'

    # Low-rise is where it still costs us: the envelope binds and the two bounds diverge.
    assert optimistic[2].gfa_sqft > conservative[2].gfa_sqft


def test_no_candidate_exceeds_what_the_authority_permits(reg, env):
    for candidate in generate(reg, env, use_conservative=False):
        assert candidate.gfa_sqft <= reg.permitted_gfa_sqft.value + 1
        assert candidate.floors <= reg.max_floors.value


def test_entitlement_is_fully_reachable(reg, env):
    """A plot that can use 100% of its GFA must be shown as such, not 95% from a gridding artefact."""
    assert any(c.is_efficient for c in generate(reg, env, use_conservative=True))


def test_parking_is_none_when_the_authority_stated_no_rule(reg, env):
    reg.parking_rule = _parse_parking('')
    assert all(c.parking_bays is None for c in generate(reg, env))
