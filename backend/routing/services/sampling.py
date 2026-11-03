"""Checkpoint sampling along a route, with an ETA at each checkpoint."""

from bisect import bisect_right
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .geo import Point, cumulative_distances, interpolate_point, sample_miles

TimePoint = tuple[float, float]  # (offset_miles, elapsed_seconds)


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lat: float
    lon: float
    segment_miles: float  # distance since the previous checkpoint; 0 for the origin
    eta_utc: datetime


def _elapsed_interpolator(
    time_points: list[TimePoint], total_miles: float
) -> Callable[[float], float]:
    """Return mile -> elapsed seconds, linear between the surrounding time points."""
    # Offsets are rescaled so the last one lands on the polyline length: the routing service
    # and the geometry measure slightly different distances, and the destination must still
    # get the full travel time.
    points = sorted(time_points)
    last_offset = points[-1][0]
    scale = total_miles / last_offset if last_offset > 0 else 1.0
    offsets = [offset * scale for offset, _ in points]
    elapsed = [seconds for _, seconds in points]

    def elapsed_at(mile: float) -> float:
        i = bisect_right(offsets, mile)
        if i == 0:
            return elapsed[0]
        if i == len(offsets):
            return elapsed[-1]
        span = offsets[i] - offsets[i - 1]  # > 0: offsets[i - 1] <= mile < offsets[i]
        return elapsed[i - 1] + (mile - offsets[i - 1]) / span * (elapsed[i] - elapsed[i - 1])

    return elapsed_at


def build_checkpoints(
    coords: list[Point],
    interval_miles: float,
    departure_utc: datetime,
    time_points: list[TimePoint],
    total_seconds: float | None = None,
) -> list[Checkpoint]:
    """Checkpoints every `interval_miles` along `coords`, origin and destination included."""
    if len(coords) < 2:
        raise ValueError("at least two coordinates are required")
    if interval_miles <= 0:
        raise ValueError("interval_miles must be positive")
    if departure_utc.tzinfo is None:
        raise ValueError("departure_utc must be timezone-aware")

    cum = cumulative_distances(coords)
    total_miles = cum[-1]

    # Without time points, ETAs are proportional to distance over `total_seconds`.
    if not time_points:
        if total_seconds is None:
            raise ValueError("time_points or total_seconds is required")
        time_points = [(0.0, 0.0), (total_miles, total_seconds)]
    elapsed_at = _elapsed_interpolator(time_points, total_miles)
    departure = departure_utc.astimezone(UTC)

    checkpoints: list[Checkpoint] = []
    previous_mile = 0.0
    for mile in sample_miles(total_miles, interval_miles):
        lat, lon = interpolate_point(coords, cum, mile)
        checkpoints.append(
            Checkpoint(
                mile=mile,
                lat=lat,
                lon=lon,
                segment_miles=mile - previous_mile,
                eta_utc=departure + timedelta(seconds=elapsed_at(mile)),
            )
        )
        previous_mile = mile
    return checkpoints
