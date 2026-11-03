"""Hourly weather risk on a grid along the trip routes, for the map heatmap."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .geo import Point, resample
from .risk import apply_load_rules, classify_rain, classify_snow, classify_wind
from .timing import timed_stage
from .weather import HourlySeries, OpenMeteoClient, last_forecast_hour

logger = logging.getLogger(__name__)

GRID_STEP_DEG = 0.25  # about 17 miles
COARSE_GRID_STEP_DEG = 0.5
# Open-Meteo's free tier counts every location as a call (600 a minute), and a plan already
# uses about 100, so wide multi-route corridors fall back to the coarse grid.
MAX_GRID_POINTS = 400
CORRIDOR_CELLS = 1  # grid cells kept on each side of a route
ROUTE_SAMPLE_MILES = 10
FORECAST_HOURS = 48


@dataclass(frozen=True)
class HeatmapPoint:
    lat: float
    lon: float
    risk: list[int]  # risk level 0-4 for each hour
    wind_mph: list[float]
    rain_in_hr: list[float]
    snow_in_hr: list[float]


@dataclass(frozen=True)
class Grid:
    step_deg: float
    points: list[Point]


@dataclass(frozen=True)
class Heatmap:
    start: datetime
    hours: int
    step_deg: float  # grid spacing, so the map can size each point's glow
    points: list[HeatmapPoint]


def corridor_grid(lines: list[list[Point]], step_deg: float) -> list[Point]:
    """Grid points within CORRIDOR_CELLS cells of the lines, south to north then west to east.

    Points sit on exact multiples of `step_deg`, so the weather client's rounding and its
    cache keys do not move them.
    """
    cells: set[tuple[int, int]] = set()
    for line in lines:
        for lat, lon in resample(line, ROUTE_SAMPLE_MILES):
            row, col = round(lat / step_deg), round(lon / step_deg)
            cells.update(
                (row + d_row, col + d_col)
                for d_row in range(-CORRIDOR_CELLS, CORRIDOR_CELLS + 1)
                for d_col in range(-CORRIDOR_CELLS, CORRIDOR_CELLS + 1)
            )
    return [(row * step_deg, col * step_deg) for row, col in sorted(cells)]


def grid_points(lines: list[list[Point]], max_points: int = MAX_GRID_POINTS) -> Grid:
    points = corridor_grid(lines, GRID_STEP_DEG)
    if len(points) <= max_points:
        return Grid(GRID_STEP_DEG, points)
    return Grid(COARSE_GRID_STEP_DEG, corridor_grid(lines, COARSE_GRID_STEP_DEG))


def build_heatmap(
    lines: list[list[Point]],
    departure_utc: datetime,
    load_lb: float,
    client: OpenMeteoClient | None = None,
    now: datetime | None = None,
) -> Heatmap:
    """Risk, wind, rain and snow for each grid point and hour from the departure hour on.

    The range stops at the forecast horizon when it would run past it; a departure after the
    horizon (or before today) is rejected by the weather client.
    """
    now = now or datetime.now(UTC)
    start = departure_utc.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    end = max(start, min(start + timedelta(hours=FORECAST_HOURS), last_forecast_hour(now)))

    with timed_stage(logger, "heatmap", "grid"):
        grid = grid_points(lines)
    with timed_stage(logger, "heatmap", "weather"):
        series = (client or OpenMeteoClient()).fetch_hourly(grid.points, start, end, now)
    with timed_stage(logger, "heatmap", "risk"):
        heatmap_points = [
            _heatmap_point(point, point_series, load_lb)
            for point, point_series in zip(grid.points, series, strict=True)
        ]
    return Heatmap(
        start=start,
        hours=len(series[0].time),
        step_deg=grid.step_deg,
        points=heatmap_points,
    )


def _heatmap_point(point: Point, series: HourlySeries, load_lb: float) -> HeatmapPoint:
    risk, wind_mph, rain_in_hr, snow_in_hr = [], [], [], []
    for wind, rain, snow in zip(series.wind_mph, series.rain_in_hr, series.snow_in_hr, strict=True):
        # Missing weather counts as calm, like in the checkpoint risk.
        wind, rain, snow = wind or 0.0, rain or 0.0, snow or 0.0
        base_level = max(classify_wind(wind), classify_rain(rain), classify_snow(snow))
        risk.append(int(apply_load_rules(base_level, wind, load_lb)))
        wind_mph.append(round(wind, 1))
        rain_in_hr.append(round(rain, 2))
        snow_in_hr.append(round(snow, 2))
    return HeatmapPoint(point[0], point[1], risk, wind_mph, rain_in_hr, snow_in_hr)
