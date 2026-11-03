"""Geodesic helpers for polylines of (lat, lon) points."""

from bisect import bisect_right
from collections import defaultdict
from math import asin, cos, floor, hypot, radians, sin, sqrt

Point = tuple[float, float]

EARTH_RADIUS_MILES = 3958.8
MILES_PER_DEGREE = EARTH_RADIUS_MILES * radians(1)

# Distances closer than this (miles) are treated as the same place.
EPSILON_MILES = 1e-6


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
    """Point `target_miles` along the line, clamped to its ends."""
    if target_miles <= 0:
        return coords[0]
    if target_miles >= cum[-1]:
        return coords[-1]

    i = bisect_right(cum, target_miles) - 1
    segment_miles = cum[i + 1] - cum[i]  # > 0: cum[i] <= target < cum[i + 1]
    fraction = (target_miles - cum[i]) / segment_miles
    # Linear in lat/lon, which is accurate for the short segments of a routing polyline.
    (lat1, lon1), (lat2, lon2) = coords[i], coords[i + 1]
    return (lat1 + fraction * (lat2 - lat1), lon1 + fraction * (lon2 - lon1))


def sample_miles(total_miles: float, step_miles: float) -> list[float]:
    """0, N, 2N, ... below the end, then the end itself (no duplicate on exact multiples)."""
    miles = [0.0]
    k = 1
    while k * step_miles < total_miles - EPSILON_MILES:
        miles.append(k * step_miles)
        k += 1
    if total_miles - miles[-1] > EPSILON_MILES:
        miles.append(total_miles)
    return miles


def resample(coords: list[Point], step_miles: float) -> list[Point]:
    """Points spaced `step_miles` apart along the line, ending on its last point."""
    cum = cumulative_distances(coords)
    return [interpolate_point(coords, cum, mile) for mile in sample_miles(cum[-1], step_miles)]


def shared_fraction(route: list[Point], other: list[Point], radius_miles: float) -> float:
    """Fraction of `route` points within `radius_miles` of some point of `other`."""
    # Only points are compared, so both lines should be densely sampled (see `resample`).
    cell_lat = radius_miles / MILES_PER_DEGREE
    # Widest cell in degrees of longitude, so a cell is at least `radius_miles` wide anywhere.
    cell_lon = cell_lat / cos(radians(max(abs(lat) for lat, _ in other)))

    def cell_of(point: Point) -> tuple[int, int]:
        return floor(point[0] / cell_lat), floor(point[1] / cell_lon)

    grid: defaultdict[tuple[int, int], list[Point]] = defaultdict(list)
    for point in other:
        grid[cell_of(point)].append(point)

    def has_neighbor(point: Point) -> bool:
        row, col = cell_of(point)
        return any(
            haversine_miles(point, neighbor) <= radius_miles
            for d_row in (-1, 0, 1)
            for d_col in (-1, 0, 1)
            for neighbor in grid.get((row + d_row, col + d_col), ())
        )

    return sum(has_neighbor(point) for point in route) / len(route)


def offset_perpendicular(point: Point, origin: Point, destination: Point, miles: float) -> Point:
    """`point` moved `miles` left of the origin -> destination direction; negative goes right."""
    lat, _ = point
    east = (destination[1] - origin[1]) * cos(radians(lat))
    north = destination[0] - origin[0]
    length = hypot(east, north)
    left_east, left_north = -north / length, east / length
    d_lat = left_north * miles / MILES_PER_DEGREE
    d_lon = left_east * miles / (MILES_PER_DEGREE * cos(radians(lat)))
    return (lat + d_lat, point[1] + d_lon)


def _distance_to_segment_deg(point: Point, start: Point, end: Point) -> float:
    """Planar distance in degrees from `point` to the segment start-end."""
    seg_lat, seg_lon = end[0] - start[0], end[1] - start[1]
    seg_length_sq = seg_lat**2 + seg_lon**2
    if seg_length_sq == 0:
        return hypot(point[0] - start[0], point[1] - start[1])
    t = ((point[0] - start[0]) * seg_lat + (point[1] - start[1]) * seg_lon) / seg_length_sq
    t = max(0.0, min(1.0, t))
    return hypot(point[0] - (start[0] + t * seg_lat), point[1] - (start[1] + t * seg_lon))


def simplify(coords: list[Point], tolerance_deg: float) -> list[Point]:
    """Douglas-Peucker: drop points closer than `tolerance_deg` to the simplified line."""
    if len(coords) < 3:
        return list(coords)

    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    pending = [(0, len(coords) - 1)]
    while pending:
        start, end = pending.pop()
        farthest, farthest_deg = start, 0.0
        for i in range(start + 1, end):
            deviation = _distance_to_segment_deg(coords[i], coords[start], coords[end])
            if deviation > farthest_deg:
                farthest, farthest_deg = i, deviation
        if farthest_deg > tolerance_deg:
            keep[farthest] = True
            pending.extend([(start, farthest), (farthest, end)])
    return [point for point, kept in zip(coords, keep, strict=True) if kept]
