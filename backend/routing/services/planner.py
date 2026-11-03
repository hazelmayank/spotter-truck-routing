"""Plans a trip: geocode, route, sample checkpoints, forecast, assess risk, rank."""

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from .geocoding import Place, geocode
from .recommend import Candidate, RouteSummary, explain, rank_routes, summarize, warnings_for
from .risk import MISSING_DATA_REASON, CheckpointRisk, assess_checkpoint
from .routing import MAX_ROUTES, RouteOption, get_routes
from .sampling import Checkpoint, build_checkpoints
from .timing import timed_stage
from .tomtom import TomTomClient
from .weather import HourlySeries, HourlyWeather, OpenMeteoClient, weather_at

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlanRequest:
    origin: str
    destination: str
    departure_utc: datetime
    load_lb: float
    interval_miles: int


@dataclass(frozen=True)
class PlannedCheckpoint:
    checkpoint: Checkpoint
    weather: HourlyWeather
    risk: CheckpointRisk


@dataclass(frozen=True)
class PlannedRoute:
    option: RouteOption
    checkpoints: list[PlannedCheckpoint]
    summary: RouteSummary
    rank: int

    @property
    def departure_utc(self) -> datetime:
        return self.checkpoints[0].checkpoint.eta_utc

    @property
    def arrival_utc(self) -> datetime:
        return self.checkpoints[-1].checkpoint.eta_utc


@dataclass(frozen=True)
class TripPlan:
    origin: Place
    destination: Place
    routes: list[PlannedRoute]
    recommended_route_id: str
    explanation: str
    warnings: list[str]
    departure_utc: datetime
    load_lb: float


def plan_trip(request: PlanRequest) -> TripPlan:
    started = time.perf_counter()
    tomtom, open_meteo = TomTomClient(), OpenMeteoClient()

    with timed_stage(logger, "plan", "geocode"):
        origin = geocode(request.origin, tomtom)
        destination = geocode(request.destination, tomtom)

    with timed_stage(logger, "plan", "routing"):
        options = get_routes(
            (origin.lat, origin.lon),
            (destination.lat, destination.lon),
            request.departure_utc,
            request.load_lb,
            tomtom,
        )

    with timed_stage(logger, "plan", "checkpoints"):
        checkpoint_lists = [
            build_checkpoints(
                option.coords, request.interval_miles, request.departure_utc, option.time_points
            )
            for option in options
        ]

    with timed_stage(logger, "plan", "weather"):
        forecasts = _forecasts_by_route(open_meteo, checkpoint_lists, request.departure_utc)

    with timed_stage(logger, "plan", "risk"):
        routes, ranked = _rank_routes(options, checkpoint_lists, forecasts, request.load_lb)

    logger.info(
        "plan total ms=%.0f routes=%d checkpoints=%d",
        (time.perf_counter() - started) * 1000,
        len(routes),
        sum(len(route.checkpoints) for route in routes),
    )
    return TripPlan(
        origin=origin,
        destination=destination,
        routes=routes,
        recommended_route_id=ranked[0].id,
        explanation=explain(ranked),
        warnings=[*warnings_for(ranked), *_data_warnings(routes)],
        departure_utc=request.departure_utc,
        load_lb=request.load_lb,
    )


def _forecasts_by_route(
    client: OpenMeteoClient, checkpoint_lists: Sequence[list[Checkpoint]], departure_utc: datetime
) -> list[list[HourlySeries]]:
    """One batched fetch for every checkpoint of every route, split back per route."""
    checkpoints = [checkpoint for route in checkpoint_lists for checkpoint in route]
    latest_eta = max(checkpoint.eta_utc for checkpoint in checkpoints)
    series = iter(
        client.fetch_hourly([(c.lat, c.lon) for c in checkpoints], departure_utc, latest_eta)
    )
    return [[next(series) for _ in route] for route in checkpoint_lists]


def _rank_routes(
    options: list[RouteOption],
    checkpoint_lists: list[list[Checkpoint]],
    forecasts: list[list[HourlySeries]],
    load_lb: float,
) -> tuple[list[PlannedRoute], list[Candidate]]:
    """The routes in the order of `options`, and the same routes ranked best first."""
    planned = [
        _assess_route(checkpoints, forecast, load_lb)
        for checkpoints, forecast in zip(checkpoint_lists, forecasts, strict=True)
    ]
    summaries = [_summarize(route_checkpoints) for route_checkpoints in planned]
    candidates = [
        Candidate(option.id, summary, option.duration_s)
        for option, summary in zip(options, summaries, strict=True)
    ]
    ranked = rank_routes(candidates)
    rank_by_id = {candidate.id: rank for rank, candidate in enumerate(ranked, start=1)}
    routes = [
        PlannedRoute(option, route_checkpoints, summary, rank_by_id[option.id])
        for option, route_checkpoints, summary in zip(options, planned, summaries, strict=True)
    ]
    return routes, ranked


def _assess_route(
    checkpoints: list[Checkpoint], forecast: list[HourlySeries], load_lb: float
) -> list[PlannedCheckpoint]:
    planned = []
    for checkpoint, series in zip(checkpoints, forecast, strict=True):
        weather = weather_at(series, checkpoint.eta_utc)
        risk = assess_checkpoint(weather.wind_mph, weather.rain_in_hr, weather.snow_in_hr, load_lb)
        planned.append(PlannedCheckpoint(checkpoint, weather, risk))
    return planned


def _summarize(checkpoints: list[PlannedCheckpoint]) -> RouteSummary:
    return summarize([(c.risk.level, c.checkpoint.segment_miles) for c in checkpoints])


def _data_warnings(routes: list[PlannedRoute]) -> list[str]:
    warnings = []
    if len(routes) < MAX_ROUTES:
        warnings.append(f"Only {len(routes)} route(s) found between these places.")
    missing = sum(
        MISSING_DATA_REASON in checkpoint.risk.reasons
        for route in routes
        for checkpoint in route.checkpoints
    )
    if missing:
        warnings.append(
            f"Weather data was missing at {missing} checkpoint(s); they are counted as low risk."
        )
    return warnings
