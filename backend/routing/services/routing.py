from dataclasses import dataclass, replace
from datetime import UTC, datetime
from string import ascii_uppercase
from typing import Any

from .geo import (
    Point,
    cumulative_distances,
    haversine_miles,
    interpolate_point,
    offset_perpendicular,
    resample,
    shared_fraction,
    simplify,
)
from .sampling import TimePoint
from .tomtom import TomTomClient, TomTomError

METERS_PER_MILE = 1609.344
KG_PER_LB = 0.45359237

MAX_ROUTES = 3
MAX_ALTERNATIVES = MAX_ROUTES - 1
DISPLAY_TOLERANCE_DEG = 0.0005

VIA_OFFSET_FRACTION = 0.15  # of the straight-line origin -> destination distance
MAX_DURATION_RATIO = 1.4  # a via route may take at most 40% longer than the fastest route
DUPLICATE_SHARED_FRACTION = 0.9
DUPLICATE_RADIUS_MILES = 0.5
CANDIDATE_STEP_MILES = 1.0
EXISTING_STEP_MILES = 0.25  # finer than the radius, so a point is never far from a sample


class RoutingError(Exception):
    pass


@dataclass(frozen=True)
class RouteOption:
    id: str
    coords: list[Point]  # full resolution: checkpoints are sampled on this line
    display_coords: list[Point]  # simplified for the response
    distance_miles: float
    duration_s: float
    time_points: list[TimePoint]


def get_routes(
    origin: Point,
    destination: Point,
    departure_utc: datetime,
    load_lb: float,
    client: TomTomClient | None = None,
) -> list[RouteOption]:
    """Up to three routes sorted by duration and labelled A, B, C."""
    client = client or TomTomClient()
    routes = _fetch_routes(client, [origin, destination], departure_utc, load_lb)
    if not routes:
        raise RoutingError("no route found")
    if len(routes) < MAX_ROUTES:
        routes = _add_via_routes(client, routes, origin, destination, departure_utc, load_lb)

    routes = sorted(routes, key=lambda route: route.duration_s)[:MAX_ROUTES]
    return [replace(route, id=label) for route, label in zip(routes, ascii_uppercase, strict=False)]


def _fetch_routes(
    client: TomTomClient, stops: list[Point], departure_utc: datetime, load_lb: float
) -> list[RouteOption]:
    params: dict[str, Any] = {
        "travelMode": "truck",
        "vehicleWeight": round(load_lb * KG_PER_LB),
        "departAt": departure_utc.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "routeRepresentation": "polyline",
        "instructionsType": "coded",
        "computeTravelTimeFor": "all",
        "traffic": "true",
    }
    if len(stops) == 2:
        # TomTom returns alternatives only for routes without intermediate waypoints.
        params["maxAlternatives"] = MAX_ALTERNATIVES
    locations = ":".join(f"{lat:.6f},{lon:.6f}" for lat, lon in stops)
    body = client.get_json(f"routing/1/calculateRoute/{locations}/json", params)
    return [_parse_route(route) for route in body["routes"]]


def _parse_route(route: dict[str, Any]) -> RouteOption:
    coords: list[Point] = []
    for leg in route["legs"]:
        for p in leg["points"]:
            point = (p["latitude"], p["longitude"])
            # Consecutive legs share their junction point.
            if not coords or point != coords[-1]:
                coords.append(point)

    distance_miles = route["summary"]["lengthInMeters"] / METERS_PER_MILE
    duration_s = route["summary"]["travelTimeInSeconds"]
    return RouteOption(
        id="",
        coords=coords,
        display_coords=simplify(coords, DISPLAY_TOLERANCE_DEG),
        distance_miles=distance_miles,
        duration_s=duration_s,
        time_points=_time_points(route["guidance"]["instructions"], distance_miles, duration_s),
    )


def _time_points(
    instructions: list[dict[str, Any]], distance_miles: float, duration_s: float
) -> list[TimePoint]:
    points = [
        (i["routeOffsetInMeters"] / METERS_PER_MILE, i["travelTimeInSeconds"]) for i in instructions
    ]
    if not points or points[0][0] > 0:
        points.insert(0, (0.0, 0.0))
    if points[-1][0] < distance_miles:
        points.append((distance_miles, duration_s))
    return points


def _add_via_routes(
    client: TomTomClient,
    routes: list[RouteOption],
    origin: Point,
    destination: Point,
    departure_utc: datetime,
    load_lb: float,
) -> list[RouteOption]:
    """Routes plus detours through a point beside the fastest route's midpoint, left then right."""
    fastest = min(routes, key=lambda route: route.duration_s)
    cum = cumulative_distances(fastest.coords)
    midpoint = interpolate_point(fastest.coords, cum, cum[-1] / 2)
    offset_miles = VIA_OFFSET_FRACTION * haversine_miles(origin, destination)

    kept = list(routes)
    for side in (1, -1):
        if len(kept) >= MAX_ROUTES:
            break
        via = offset_perpendicular(midpoint, origin, destination, side * offset_miles)
        try:
            candidate = _fetch_routes(client, [origin, via, destination], departure_utc, load_lb)[0]
        except TomTomError:
            # The via point can fall where no road route exists; that side is just skipped.
            continue
        if candidate.duration_s > MAX_DURATION_RATIO * fastest.duration_s:
            continue
        if any(_is_near_duplicate(candidate, route) for route in kept):
            continue
        kept.append(candidate)
    return kept


def _is_near_duplicate(candidate: RouteOption, existing: RouteOption) -> bool:
    shared = shared_fraction(
        resample(candidate.coords, CANDIDATE_STEP_MILES),
        resample(existing.coords, EXISTING_STEP_MILES),
        DUPLICATE_RADIUS_MILES,
    )
    return shared > DUPLICATE_SHARED_FRACTION
