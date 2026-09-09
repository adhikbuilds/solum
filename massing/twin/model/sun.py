"""
Where the sun actually is over this city, at a stated moment.

"Geographically appropriate sun direction" is the first item on the guide's realism list, and it
is the one that is trivially checkable and almost always faked. A light dragged around until the
render looks nice produces shadows that fall in a direction the city never sees; in Dubai, where
the sun passes north of overhead in summer and the shadows are short and hard, an eyeballed
key light reads wrong to anyone who has stood there.

So the direction is computed, from the AOI's own latitude and longitude, with the NOAA solar
position algorithm -- the same one used for sundials and PV yield. It is accurate to well under a
degree, which is far past what a shadow needs, and it means the render carries a timestamp: the
scene is Dubai at a stated hour, not Dubai under a lamp.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone


def solar_position(lat: float, lon: float, when: datetime) -> dict:
    """
    Solar azimuth and elevation in degrees for a location and an instant (NOAA).

    Azimuth is measured clockwise from true north; elevation is above the horizon.
    """
    if when.tzinfo is None:
        raise ValueError('pass an aware datetime -- a solar position without a timezone is a guess')
    utc = when.astimezone(timezone.utc)

    # Fractional Julian day and century.
    jd = utc.timestamp() / 86400.0 + 2440587.5
    t = (jd - 2451545.0) / 36525.0

    geom_mean_long = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    geom_mean_anom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

    m = math.radians(geom_mean_anom)
    sun_eq = (math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
              + math.sin(2 * m) * (0.019993 - 0.000101 * t)
              + math.sin(3 * m) * 0.000289)
    true_long = geom_mean_long + sun_eq
    app_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(125.04 - 1934.136 * t))

    mean_obliq = 23 + (26 + ((21.448 - t * (46.815 + t * (0.00059 - t * 0.001813)))) / 60) / 60
    obliq = mean_obliq + 0.00256 * math.cos(math.radians(125.04 - 1934.136 * t))

    decl = math.degrees(math.asin(math.sin(math.radians(obliq)) * math.sin(math.radians(app_long))))

    y = math.tan(math.radians(obliq / 2)) ** 2
    eq_time = 4 * math.degrees(
        y * math.sin(2 * math.radians(geom_mean_long))
        - 2 * eccent * math.sin(m)
        + 4 * eccent * y * math.sin(m) * math.cos(2 * math.radians(geom_mean_long))
        - 0.5 * y * y * math.sin(4 * math.radians(geom_mean_long))
        - 1.25 * eccent * eccent * math.sin(2 * m))

    minutes = utc.hour * 60 + utc.minute + utc.second / 60
    true_solar_time = (minutes + eq_time + 4 * lon) % 1440
    hour_angle = true_solar_time / 4 - 180 if true_solar_time / 4 >= 0 else true_solar_time / 4 + 180

    lat_r, decl_r, ha_r = math.radians(lat), math.radians(decl), math.radians(hour_angle)
    zenith = math.acos(math.sin(lat_r) * math.sin(decl_r)
                       + math.cos(lat_r) * math.cos(decl_r) * math.cos(ha_r))
    elevation = 90 - math.degrees(zenith)

    denom = math.cos(lat_r) * math.sin(zenith)
    if abs(denom) < 1e-9:
        azimuth = 180.0
    else:
        cos_az = (math.sin(lat_r) * math.cos(zenith) - math.sin(decl_r)) / denom
        azimuth = math.degrees(math.acos(max(-1.0, min(1.0, cos_az))))
        azimuth = (180 + azimuth) % 360 if hour_angle > 0 else (540 - azimuth) % 360

    return {
        'when': when.isoformat(),
        'azimuth_deg': round(azimuth, 2),
        'elevation_deg': round(elevation, 2),
        'declination_deg': round(decl, 3),
        'basis': 'NOAA solar position algorithm from the AOI centroid',
    }


def scene_direction(azimuth_deg: float, elevation_deg: float, distance: float = 1.0) -> list[float]:
    """
    Sun position as a vector in the local plan frame: +x east, +y north, +z up.

    The renderer's `rotateX(-PI/2)` carries it into the Y-up scene along with everything else, so
    the light and the geometry cannot drift apart.
    """
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return [round(distance * math.cos(el) * math.sin(az), 4),   # east
            round(distance * math.cos(el) * math.cos(az), 4),   # north
            round(distance * math.sin(el), 4)]                  # up


def default_moment() -> datetime:
    """
    Mid-afternoon at the equinox, Gulf Standard Time.

    Chosen rather than "now" so a rebuild does not silently re-light the district -- and chosen
    at 15:00 because a high Dubai noon casts almost no shadow, which is exactly when a massing
    model stops reading as three-dimensional.
    """
    return datetime(2026, 3, 21, 15, 0, tzinfo=timezone(timedelta(hours=4)))
