"""Geodesic helpers for polylines of (lat, lon) points."""

from bisect import bisect_right
from math import asin, cos, radians, sin, sqrt

Point = tuple[float, float]

EARTH_RADIUS_MILES = 3958.8


def haversine_miles(a: Point, b: Point) -> float:
    """Great-circle distance in miles between two (lat, lon) points in degrees."""
    lat1, lon1 = map(radians, a)
    lat2, lon2 = map(radians, b)
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(h))


def cumulative_distances(coords: list[Point]) -> list[float]:
    """Miles from the first point to each point; same length as `coords`, starting at 0."""
    cum = [0.0] * len(coords)
    for i in range(1, len(coords)):
        cum[i] = cum[i - 1] + haversine_miles(coords[i - 1], coords[i])
    return cum


def interpolate_point(coords: list[Point], cum: list[float], target_miles: float) -> Point:
    """Point `target_miles` along the line, clamped to its ends.

    Interpolates linearly in lat/lon within a segment, which is accurate for the short
    segments of a routing polyline.
    """
    if target_miles <= 0:
        return coords[0]
    if target_miles >= cum[-1]:
        return coords[-1]

    i = bisect_right(cum, target_miles) - 1
    segment_miles = cum[i + 1] - cum[i]  # > 0: cum[i] <= target < cum[i + 1]
    fraction = (target_miles - cum[i]) / segment_miles
    (lat1, lon1), (lat2, lon2) = coords[i], coords[i + 1]
    return (lat1 + fraction * (lat2 - lat1), lon1 + fraction * (lon2 - lon1))
