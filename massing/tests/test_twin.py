"""
The city base, pinned where it would otherwise drift.

Three things are worth a test here, and they are all about refusal rather than output:
the height chain must never invent a height, the bake must never draw a building it cannot
derive, and the frame must be recoverable -- a parcel baked into local metres has to come back
to the exact DDA easting and northing it went in as. Everything else is renderable detail.

All of it runs offline against the checked-in parcel response. No test in this file touches the
network.
"""

import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from solum_massing.dda import Provenance                       # noqa: E402
from twin.model import config as cityconfig                      # noqa: E402
from twin.pipeline.build import bake                             # noqa: E402
from twin.model.heights import resolve                           # noqa: E402

FIXTURE = pathlib.Path(__file__).resolve().parents[1] / 'fixtures' / 'parcel-3156315.json'


def _area(parts) -> float:
    """Net area over every part, holes subtracted -- the measure the flat-ring version missed."""
    from shapely.geometry import Polygon
    return sum(Polygon(part[0], part[1:]).area for part in parts)


@pytest.fixture
def cfg():
    return cityconfig.load('dubai')


@pytest.fixture
def features():
    return json.loads(FIXTURE.read_text())['features']


# --- the height chain -------------------------------------------------------------------------

def test_published_metres_outrank_storeys():
    h = resolve({'MAX_HEIGHT_METERS': 84.5, 'MAX_HEIGHT_FLOORS': 'G+8'}, 3.2)
    assert h.metres == 84.5
    assert h.provenance is Provenance.AUTHORITY


def test_storeys_derive_metres_and_keep_the_ground_floor():
    h = resolve({'MAX_HEIGHT_FLOORS': 'G+8'}, 3.2)
    assert h.floors == 9                       # G + 8, not 8
    assert h.metres == pytest.approx(28.8)
    assert h.provenance is Provenance.DERIVED


def test_a_storey_band_is_an_assumption_not_an_authority_figure():
    h = resolve({'HEIGHT_CATEGORY': '9 - 10'}, 3.2)
    assert h.provenance is Provenance.ASSUMPTION


def test_an_open_band_takes_its_lower_bound():
    """'50+' has no midpoint. Understating a supertall is the safe direction."""
    assert resolve({'HEIGHT_CATEGORY': '50+'}, 3.2).floors == 50


def test_nothing_published_yields_nothing():
    """The rung with no default under it. This is the whole point of the chain."""
    h = resolve({'MAX_HEIGHT_FLOORS': 'N/A', 'HEIGHT_CATEGORY': 'N/A'}, 3.2)
    assert h.metres is None
    assert h.provenance is Provenance.UNAVAILABLE


# --- the bake ---------------------------------------------------------------------------------

def test_the_reference_parcel_bakes_to_its_published_regulation(cfg, features):
    parcels, stats, rejected = bake(features, cfg)
    assert stats.kept == 1 and not rejected
    p = parcels[0]
    assert p.id == '3156315'
    assert p.height.floors == 9
    assert p.status == 'Completed'
    assert p.render == 'solid'


def test_the_frame_round_trips_to_the_source_crs(cfg, features):
    """
    Gate A. A baked vertex plus the origin must be the DDA easting/northing it came from --
    the bake translates, it never reprojects.
    """
    src = features[0]['geometry']['rings'][0][0]
    parcels, _, _ = bake(features, cfg)
    x, y = parcels[0].plot[0][0][0]      # first part, exterior ring, first vertex
    assert x + cfg.origin[0] == pytest.approx(src[0], abs=1e-3)
    assert y + cfg.origin[1] == pytest.approx(src[1], abs=1e-3)


def test_a_footprint_never_exceeds_its_own_plot(cfg, features):
    """Gate B, measured over every part and net of holes, not just the first ring."""
    parcels, _, _ = bake(features, cfg)
    for p in parcels:
        assert _area(p.footprint) <= _area(p.plot) * 1.001


def test_geometry_is_nested_by_part_not_flattened(cfg, features):
    """
    The format contract. A part is `[exterior, *holes]`; a flat ring list cannot distinguish a
    courtyard from a second piece of the same parcel, and a renderer that guesses wrong punches a
    void through a building.
    """
    parcels, _, _ = bake(features, cfg)
    for p in parcels:
        for geom in (p.footprint, p.plot):
            assert geom and all(part and all(len(v) == 2 for v in part[0]) for part in geom)


def test_a_multipart_parcel_survives_as_two_parts(cfg, features):
    """Two disjoint squares must bake as two parts -- never as one square with a hole in it."""
    split = json.loads(json.dumps(features))
    ox, oy = 498990, 2791831
    square = lambda dx: [[ox + dx, oy], [ox + dx + 40, oy], [ox + dx + 40, oy + 40],
                         [ox + dx, oy + 40], [ox + dx, oy]]
    split[0]['geometry']['rings'] = [square(0), square(100)]
    parcels, _, _ = bake(split, cfg)
    assert len(parcels[0].plot) == 2
    assert _area(parcels[0].plot) == pytest.approx(3200, rel=1e-6)   # 2 x 40 x 40, no hole


def test_a_parcel_with_no_height_is_outlined_not_invented(cfg, features):
    """
    The bake must not draw a building it cannot derive. Strip the height fields and the parcel
    survives as a plot -- same geometry, no massing.
    """
    stripped = json.loads(json.dumps(features))
    stripped[0]['attributes'].update(MAX_HEIGHT_FLOORS='N/A', MAX_HEIGHT_METERS=0, HEIGHT_CATEGORY=None)
    parcels, stats, _ = bake(stripped, cfg)
    assert stats.solid == 0 and stats.outlined == 1
    assert parcels[0].height.metres is None
    assert parcels[0].plot                     # the plot is still a fact


def test_a_parcel_with_no_gfa_is_outlined_even_when_its_height_is_known(cfg, features):
    """A height without a GFA gives no floor plate, and a plate is what makes it a building."""
    stripped = json.loads(json.dumps(features))
    stripped[0]['attributes'].update(GFA_SQM=0, GFA_SQFT=0)
    _, stats, _ = bake(stripped, cfg)
    assert stats.outlined == 1


def test_slivers_are_rejected_with_a_reason(cfg, features):
    tiny = json.loads(json.dumps(features))
    tiny[0]['geometry']['rings'] = [[[498990, 2791831], [498992, 2791831],
                                     [498992, 2791833], [498990, 2791833], [498990, 2791831]]]
    parcels, stats, rejected = bake(tiny, cfg)
    assert not parcels and stats.rejected == 1
    assert 'sliver' in rejected[0].reason


# --- the city config --------------------------------------------------------------------------

def test_the_config_refuses_an_aoi_in_the_wrong_crs(tmp_path):
    raw = json.loads((cityconfig.CONFIG_DIR / 'dubai.json').read_text())
    raw['aoi']['crs'] = 4326
    p = tmp_path / 'bad.json'
    p.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match='target_crs'):
        cityconfig.load(path=p)


def test_the_config_refuses_an_origin_outside_its_own_aoi(tmp_path):
    raw = json.loads((cityconfig.CONFIG_DIR / 'dubai.json').read_text())
    raw['origin']['x'] = 0
    p = tmp_path / 'bad.json'
    p.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match='outside'):
        cityconfig.load(path=p)


# --- the as-built layer -------------------------------------------------------------------------

def _osm_way(oid, ring_lonlat, tags=None):
    return {'type': 'way', 'id': oid, 'tags': tags or {'building': 'yes'},
            'geometry': [{'lon': lo, 'lat': la} for lo, la in ring_lonlat]}


def _square_lonlat(lon, lat, metres):
    """A rough square in degrees, sized in metres at Dubai's latitude. Good enough for a fixture."""
    import math
    dlat = metres / 111_320
    dlon = metres / (111_320 * math.cos(math.radians(lat)))
    return [(lon, lat), (lon + dlon, lat), (lon + dlon, lat + dlat), (lon, lat + dlat), (lon, lat)]


def test_osm_height_tags_beat_the_plot_ceiling(cfg):
    from twin.sources import osm as buildings
    ring = _square_lonlat(55.3233, 25.2327, 30)
    raw = {'elements': [
        _osm_way(1, ring, {'building': 'yes', 'height': '42'}),
        _osm_way(2, _square_lonlat(55.3236, 25.2327, 30), {'building': 'yes', 'building:levels': '5'}),
    ]}
    built, _ = buildings.parse(raw, cfg.origin, cfg.floor_height_m, [])
    assert built[0].height_m == 42 and built[0].height_source == 'osm:height'
    assert built[1].height_m == pytest.approx(16.0) and built[1].height_source == 'osm:building:levels'


def test_only_the_dominant_structure_borrows_the_plot_ceiling(cfg):
    """
    A plot's permitted height belongs to the plot. Applied to every footprint on it, a guard hut
    becomes a nine-storey tower -- the invented number the height chain exists to prevent.
    """
    from shapely.geometry import Polygon
    from twin.sources import osm as buildings

    plot = Polygon([(-100, -100), (100, -100), (100, 100), (-100, 100)])   # 200 x 200 m, local
    parcels = [('9999', plot, 28.8)]
    big = _square_lonlat(55.32320, 25.23265, 120)      # covers well over a quarter of the plot
    small = _square_lonlat(55.32325, 25.23270, 8)      # an outbuilding
    built, _ = buildings.parse({'elements': [_osm_way(10, big), _osm_way(11, small)]},
                               cfg.origin, cfg.floor_height_m, parcels)
    by_id = {b.id: b for b in built}
    assert by_id['way/10'].height_source == 'dda:permitted'
    assert by_id['way/11'].height_m is None
    assert by_id['way/11'].height_provenance is Provenance.UNAVAILABLE


def test_a_relation_inner_ring_becomes_a_hole_not_a_second_building(cfg):
    from twin.sources import osm as buildings
    outer = _square_lonlat(55.3233, 25.2327, 60)
    inner = _square_lonlat(55.32332, 25.23272, 15)
    rel = {'type': 'relation', 'id': 7, 'tags': {'building': 'yes'}, 'members': [
        {'type': 'way', 'role': 'outer', 'geometry': [{'lon': lo, 'lat': la} for lo, la in outer]},
        {'type': 'way', 'role': 'inner', 'geometry': [{'lon': lo, 'lat': la} for lo, la in inner]},
    ]}
    built, _ = buildings.parse({'elements': [rel]}, cfg.origin, cfg.floor_height_m, [])
    assert len(built) == 1
    assert len(built[0].footprint) == 1 and len(built[0].footprint[0]) == 2   # one part, one hole


# --- the value layer ----------------------------------------------------------------------------

def test_the_reference_plot_prices(features):
    from twin.model.value import appraise_feature
    v = appraise_feature(features[0])
    assert v.rlv and v.rlv > 0 and v.floors
    assert v.hypothetical                      # published use is FACILITIES (UNIVERSITY)
    assert 'hypothetical' in v.basis


def test_a_plot_with_no_gfa_is_withheld_with_a_reason(features):
    from twin.model.value import appraise_feature
    stripped = json.loads(json.dumps(features))
    stripped[0]['attributes'].update(GFA_SQFT=0, GFA_SQM=0)
    v = appraise_feature(stripped[0])
    assert v.rlv is None and 'no GFA' in v.basis


def test_a_residential_plot_is_not_flagged_hypothetical(features):
    from twin.model.value import appraise_feature
    resi = json.loads(json.dumps(features))
    resi[0]['attributes']['LANDUSE_DETAILS'] = 'RESIDENTIAL (APARTMENT)'
    assert appraise_feature(resi[0]).hypothetical is False
