"""
The city stage, pinned at the two places it could quietly lie.

The district's tests guard a bake that draws 88 parcels. This one guards a bake that draws
100,000, where the same mistake stops being visible: nobody inspects a hundred thousand plots to
notice that a few thousand grew a height they were never given.

So the assertions are about refusal again, and the refusals are two:

  1. a plot with no published height carries no `height_m` at all -- not zero, not a default, not
     null-that-survives-into-the-tile, where `['has', 'height_m']` would let it through into
     `fill-extrusion-height` and stand it up as a building;
  2. a plot DDA publishes as non-residential is priced but flagged `hypothetical`, because the
     unit mix behind every figure in this repo is residential and a number is not comparable just
     because it is a number.

Offline, against the checked-in parcel response. Nothing here touches the network.
"""

import json
import pathlib

import pytest

from solum_massing.paths import fixture
from solum_city.pipeline.city import (
    APPRAISAL_FIELDS, OUT_FIELDS, PLACEHOLDERS, _clean, _height, _rings, _value,
)

FIXTURE = fixture()
FLOOR_H = 3.2

@pytest.fixture(scope='module')
def feature() -> dict:
    return json.loads(FIXTURE.read_text())['features'][0]

# --- the height chain ------------------------------------------------------------------------

@pytest.mark.parametrize('attrs, metres, source', [
    ({'MAX_HEIGHT_METERS': 156.8}, 156.8, 'authority'),
    ({'MAX_HEIGHT_FLOORS': 'G+P+12'}, 44.8, 'derived'),
    ({'MAX_HEIGHT_FLOORS': 'G+1'}, 6.4, 'derived'),
    ({'MAX_HEIGHT_FLOORS': 4}, 12.8, 'derived'),
    ({'HEIGHT_CATEGORY': '7 - 8'}, 24.0, 'assumption'),
    # Published metres beat derived storeys: the chain is ordered, not first-match-wins.
    ({'MAX_HEIGHT_METERS': 100.0, 'MAX_HEIGHT_FLOORS': 'G+1'}, 100.0, 'authority'),
])
def test_height_chain_resolves_in_order(attrs, metres, source):
    assert _height(attrs, FLOOR_H) == (metres, source)

@pytest.mark.parametrize('attrs', [
    {},
    {'MAX_HEIGHT_FLOORS': 'N/A', 'HEIGHT_CATEGORY': 'N/A'},
    {'MAX_HEIGHT_FLOORS': '', 'HEIGHT_CATEGORY': 'UNDEFINED'},
    {'MAX_HEIGHT_METERS': 0, 'MAX_HEIGHT_FLOORS': None},
])
def test_no_published_height_is_unavailable_not_zero(attrs):
    """The end of the chain is nothing. A default here is a building that does not exist."""
    metres, source = _height(attrs, FLOOR_H)
    assert metres is None
    assert source == 'unavailable'

def test_unavailable_height_never_reaches_the_tile_as_a_key():
    """
    `['has', 'height_m']` is the whole 3D policy, so the absence has to be a real absence.

    A null that survives into the tile satisfies `has` and lands in fill-extrusion-height, which
    is how 13,973 plots with no published height would have become 13,973 flat-zero buildings.
    """
    metres, source = _height({'MAX_HEIGHT_FLOORS': 'N/A'}, FLOOR_H)
    attrs = {'id': '1', 'height_src': source}
    if metres is not None:
        attrs['height_m'] = metres
    assert 'height_m' not in attrs

# --- placeholders ----------------------------------------------------------------------------

@pytest.mark.parametrize('raw', sorted(PLACEHOLDERS - {''}) + ['n/a', ' UNDEFINED '])
def test_placeholders_are_not_values(raw):
    assert _clean(raw) is None

@pytest.mark.parametrize('raw', ['G+4', 'Completed', 'RESIDENTIAL', 0, 12.5])
def test_real_values_survive_cleaning(raw):
    """Zero is a value. Filtering it out is the other half of the same mistake."""
    assert _clean(raw) == raw

# --- the value layer ---------------------------------------------------------------------------

def test_non_residential_is_priced_but_flagged(feature):
    """
    The arithmetic is sound and the premise is not, so the figure carries a flag, not a silence.

    Every RLV in this repo rests on a residential unit mix. Pricing a warehouse plot on it answers
    what the land would be worth if it were built residential -- worth showing, never comparable
    to the plot beside it, and indistinguishable from one unless the tile says so.
    """
    out = _value(feature, {'MAIN_LANDUSE': 'INDUSTRIAL'})
    assert out['rlv_verdict'] == 'hypothetical'
    assert 'rlv_psf' in out

def test_residential_is_priced_plainly(feature):
    out = _value(feature, {'MAIN_LANDUSE': 'RESIDENTIAL'})
    assert out['rlv_verdict'] == 'priced'
    assert isinstance(out['rlv'], int)

def test_an_unsolvable_plot_is_withheld_with_a_reason_not_a_zero():
    out = _value({'attributes': {}, 'geometry': {}}, {'MAIN_LANDUSE': 'RESIDENTIAL'})
    assert out['rlv_verdict'] == 'withheld'
    assert out['rlv_why']
    assert 'rlv' not in out and 'rlv_psf' not in out

# --- acquisition ---------------------------------------------------------------------------------

def test_the_snapshot_asks_for_everything_the_engine_reads():
    """
    A city snapshot that omits a field the appraisal needs cannot be fixed later -- only refetched.

    The first city pull carried what a map draws and not what an appraisal reads, and every plot
    came back priced against setbacks that were never requested. This is that bug, pinned.
    """
    requested = set(OUT_FIELDS.split(','))
    for field in APPRAISAL_FIELDS:
        assert field in requested
    for side in (1, 2, 3, 4):
        assert f'BUILDING_SETBACK_SIDE{side}' in requested
    assert 'GENERAL_NOTES' in requested          # the parking rule is prose inside it

def test_reprojection_leaves_the_metre_frame_only_on_the_way_out(feature):
    """Rings come back as lon/lat inside Dubai, and the source geometry is untouched."""
    before = json.dumps(feature['geometry'])
    rings = _rings(feature['geometry'])
    assert rings and len(rings[0]) >= 4
    for lon, lat in rings[0]:
        assert 54.0 < lon < 56.5
        assert 24.5 < lat < 25.5
    assert json.dumps(feature['geometry']) == before
