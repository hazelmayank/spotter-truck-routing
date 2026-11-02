from routing.services.geo import MILES_PER_DEGREE, Point


def equator_line(miles: float, points: int = 21) -> list[Point]:
    """Straight line along the equator with evenly spaced vertices."""
    degrees = miles / MILES_PER_DEGREE
    return [(0.0, degrees * i / (points - 1)) for i in range(points)]
