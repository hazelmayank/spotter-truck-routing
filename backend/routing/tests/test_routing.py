import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from routing.services.geo import Point, cumulative_distances, haversine_miles, interpolate_point
from routing.services.routing import RouteOption, RoutingError, get_routes
from routing.services.tomtom import TomTomError

from .fakes import FakeTomTomClient

FIXTURES = Path(__file__).parent / "fixtures"
METERS_PER_MILE = 1609.344

DALLAS = (32.7767, -96.797)
DENVER = (39.7392, -104.9903)
DEPARTURE = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)


def fixture_routes() -> list[dict[str, Any]]:
    """Fastest first: US-287, then I-35/I-70 (+22% time), then US-84 (+35% time)."""
    with (FIXTURES / "calculate_route_alternatives.json").open() as file:
        return json.load(file)["routes"]


def response(*routes: dict[str, Any]) -> dict[str, Any]:
    return {"formatVersion": "0.0.12", "routes": list(routes)}


def request_routes(client: FakeTomTomClient, load_lb: float = 40_000) -> list[RouteOption]:
    return get_routes(DALLAS, DENVER, DEPARTURE, load_lb, client=client)


def locations_in(path: str) -> list[Point]:
    stops = path.split("/")[-2].split(":")
    return [tuple(map(float, stop.split(","))) for stop in stops]


def points_of(route: dict[str, Any]) -> list[Point]:
    return [(p["latitude"], p["longitude"]) for p in route["legs"][0]["points"]]


def test_three_routes_from_tomtom_need_a_single_request() -> None:
    client = FakeTomTomClient(response(*fixture_routes()))

    routes = request_routes(client)

    assert len(client.calls) == 1
    assert [route.id for route in routes] == ["A", "B", "C"]


def test_primary_request_asks_for_truck_routes_with_alternatives() -> None:
    client = FakeTomTomClient(response(*fixture_routes()))

    request_routes(client)

    path, params = client.calls[0]
    assert path == "routing/1/calculateRoute/32.776700,-96.797000:39.739200,-104.990300/json"
    assert params == {
        "travelMode": "truck",
        "vehicleWeight": 18144,
        "maxAlternatives": 2,
        "departAt": "2026-11-03T08:00:00Z",
        "routeRepresentation": "polyline",
        "instructionsType": "coded",
        "computeTravelTimeFor": "all",
        "traffic": "true",
    }


@pytest.mark.parametrize(
    ("load_lb", "vehicle_weight_kg"),
    [(1_000, 454), (30_000, 13608), (40_000, 18144), (80_000, 36287)],
)
def test_load_is_sent_to_tomtom_in_rounded_kilograms(
    load_lb: float, vehicle_weight_kg: int
) -> None:
    client = FakeTomTomClient(response(*fixture_routes()))

    request_routes(client, load_lb)

    assert client.calls[0][1]["vehicleWeight"] == vehicle_weight_kg


def test_distance_and_duration_come_from_the_route_summary() -> None:
    raw = fixture_routes()[0]
    raw["summary"]["lengthInMeters"] = 160_934
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    assert fastest.distance_miles == pytest.approx(100, abs=0.001)
    assert fastest.duration_s == raw["summary"]["travelTimeInSeconds"]


def test_coordinates_are_lat_lon_pairs_in_route_order() -> None:
    raw = fixture_routes()[0]
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    assert fastest.coords == points_of(raw)
    assert fastest.coords[0] == pytest.approx(DALLAS, abs=1e-4)
    assert fastest.coords[-1] == pytest.approx(DENVER, abs=1e-4)


def test_time_points_are_instruction_offsets_in_miles_and_elapsed_seconds() -> None:
    raw = fixture_routes()[0]
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    instructions = raw["guidance"]["instructions"]
    assert fastest.time_points == [
        (i["routeOffsetInMeters"] / METERS_PER_MILE, i["travelTimeInSeconds"]) for i in instructions
    ]
    assert fastest.time_points[0] == (0, 0)
    assert fastest.time_points[-1] == (fastest.distance_miles, fastest.duration_s)


def test_time_points_are_completed_when_instructions_miss_the_ends() -> None:
    raw = fixture_routes()[0]
    raw["guidance"]["instructions"] = raw["guidance"]["instructions"][1:-1]
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    assert fastest.time_points[0] == (0, 0)
    assert fastest.time_points[-1] == (fastest.distance_miles, fastest.duration_s)
    assert len(fastest.time_points) == len(raw["guidance"]["instructions"]) + 2


def test_legs_are_joined_without_repeating_the_shared_point() -> None:
    raw = fixture_routes()[0]
    points = raw["legs"][0]["points"]
    first_leg, second_leg = deepcopy(raw["legs"][0]), deepcopy(raw["legs"][0])
    first_leg["points"], second_leg["points"] = points[:10], points[9:]
    raw["legs"] = [first_leg, second_leg]
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    assert fastest.coords == points_of(fixture_routes()[0])


def test_display_line_is_simplified_but_checkpoints_use_the_full_line() -> None:
    raw = fixture_routes()[0]
    client = FakeTomTomClient(response(raw, *fixture_routes()[1:]))

    fastest = request_routes(client)[0]

    assert len(fastest.coords) == len(raw["legs"][0]["points"])
    assert len(fastest.display_coords) < len(fastest.coords) / 2
    assert fastest.display_coords[0] == fastest.coords[0]
    assert fastest.display_coords[-1] == fastest.coords[-1]


def test_routes_are_sorted_by_duration_and_labelled_a_b_c() -> None:
    fastest, middle, slowest = fixture_routes()
    client = FakeTomTomClient(response(slowest, fastest, middle))

    routes = request_routes(client)

    assert [route.id for route in routes] == ["A", "B", "C"]
    assert [route.duration_s for route in routes] == [
        fastest["summary"]["travelTimeInSeconds"],
        middle["summary"]["travelTimeInSeconds"],
        slowest["summary"]["travelTimeInSeconds"],
    ]


def test_single_route_triggers_left_then_right_via_requests() -> None:
    fastest, middle, slowest = fixture_routes()
    client = FakeTomTomClient(response(fastest), response(middle), response(slowest))

    routes = request_routes(client)

    assert [route.id for route in routes] == ["A", "B", "C"]
    assert len(client.calls) == 3
    primary_params, left_params, right_params = (params for _, params in client.calls)
    assert primary_params["maxAlternatives"] == 2
    assert "maxAlternatives" not in left_params
    assert "maxAlternatives" not in right_params
    assert left_params["travelMode"] == "truck"
    assert left_params["vehicleWeight"] == primary_params["vehicleWeight"]
    assert left_params["departAt"] == primary_params["departAt"]


def test_via_points_sit_fifteen_percent_of_the_straight_line_off_the_route_midpoint() -> None:
    fastest, middle, slowest = fixture_routes()
    client = FakeTomTomClient(response(fastest), response(middle), response(slowest))

    request_routes(client)

    coords = points_of(fastest)
    cum = cumulative_distances(coords)
    midpoint = interpolate_point(coords, cum, cum[-1] / 2)
    expected_offset = 0.15 * haversine_miles(DALLAS, DENVER)
    (left_stops, right_stops) = (locations_in(path) for path, _ in client.calls[1:])
    assert left_stops[0] == right_stops[0] == pytest.approx(DALLAS, abs=1e-5)
    assert left_stops[-1] == right_stops[-1] == pytest.approx(DENVER, abs=1e-5)
    left_via, right_via = left_stops[1], right_stops[1]
    assert haversine_miles(midpoint, left_via) == pytest.approx(expected_offset, abs=1.0)
    assert haversine_miles(midpoint, right_via) == pytest.approx(expected_offset, abs=1.0)
    # Travelling north-west, left of the line is the south-west side.
    assert left_via[0] < midpoint[0] < right_via[0]


def test_only_one_via_request_is_made_when_two_routes_are_enough_for_three() -> None:
    fastest, middle, slowest = fixture_routes()
    client = FakeTomTomClient(response(fastest, middle), response(slowest))

    routes = request_routes(client)

    assert len(routes) == 3
    assert len(client.calls) == 2


@pytest.mark.parametrize(("slower_by", "kept"), [(1.39, True), (1.41, False)])
def test_via_route_more_than_forty_percent_slower_than_the_fastest_is_dropped(
    slower_by: float, kept: bool
) -> None:
    fastest, middle, _ = fixture_routes()
    middle["summary"]["travelTimeInSeconds"] = int(
        fastest["summary"]["travelTimeInSeconds"] * slower_by
    )
    client = FakeTomTomClient(response(fastest), response(middle), response(fastest))

    routes = request_routes(client)

    assert len(routes) == (2 if kept else 1)


def test_via_route_that_repeats_an_existing_route_is_dropped() -> None:
    fastest, _, _ = fixture_routes()
    client = FakeTomTomClient(response(fastest), response(fastest), response(fastest))

    routes = request_routes(client)

    assert [route.id for route in routes] == ["A"]


def test_partly_shared_via_route_is_kept() -> None:
    fastest, _, slowest = fixture_routes()
    client = FakeTomTomClient(response(fastest), response(slowest), TomTomError("no route"))

    routes = request_routes(client)

    assert [route.id for route in routes] == ["A", "B"]


def test_via_point_with_no_route_is_skipped() -> None:
    fastest, middle, _ = fixture_routes()
    client = FakeTomTomClient(response(fastest), TomTomError("no route"), response(middle))

    routes = request_routes(client)

    assert [route.id for route in routes] == ["A", "B"]
    assert len(client.calls) == 3


def test_failure_of_the_first_request_is_not_swallowed() -> None:
    client = FakeTomTomClient(TomTomError("TomTom returned HTTP 403: Forbidden"))

    with pytest.raises(TomTomError, match="403"):
        request_routes(client)


def test_no_route_found_is_an_error() -> None:
    client = FakeTomTomClient(response())

    with pytest.raises(RoutingError, match="no route"):
        request_routes(client)
