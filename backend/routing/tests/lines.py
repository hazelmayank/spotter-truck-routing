from math import radians

from routing.services.geo import EARTH_RADIUS_MILES, Point

MILES_PER_DEGREE = EARTH_RADIUS_MILES * radians(1)


def equator_line(miles: float, points: int = 21) -> list[Point]:
    """Straight line along the equator with evenly spaced vertices."""
    degrees = miles / MILES_PER_DEGREE
    return [(0.0, degrees * i / (points - 1)) for i in range(points)]
