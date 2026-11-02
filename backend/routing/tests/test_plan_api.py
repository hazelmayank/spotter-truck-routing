import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from routing.services import planner, weather
from routing.services.tomtom import TomTomError
from routing.services.weather import OpenMeteoClient

from .fakes import (
    FakeResponse,
    FakeSession,
    FakeTomTomClient,
    fixture_routes,
    routes_response,
    serve_forecast,
)

DEPARTURE = (datetime.now(UTC) + timedelta(days=1)).replace(
    hour=12, minute=0, second=0, microsecond=0
)
LEVELS = {"LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL"}
CHECKPOINT_FIELDS = {
    "mile",
    "lat",
    "lon",
    "eta",
    "wind_mph",
    "gust_mph",
    "rain_in_hr",
    "snow_in_hr",
    "level",
    "reasons",
}
CALM_MPH = 5.0
STORM_MPH = 60.0


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    cache.clear()


def calm(lat: float, lon: float) -> float:
    return CALM_MPH


def storm_over_the_texas_panhandle(lat: float, lon: float) -> float:
    """Hits route A (through Amarillo and Dalhart) and misses routes B and C."""
    in_storm = 35.0 <= lat <= 36.5 and -103.2 <= lon <= -101.0
    return STORM_MPH if in_storm else CALM_MPH


def storm_everywhere(lat: float, lon: float) -> float:
    return STORM_MPH


def place(label: str, lat: float, lon: float) -> dict[str, Any]:
    result = {"address": {"freeformAddress": label}, "position": {"lat": lat, "lon": lon}}
    return {"results": [result]}


def tomtom_answers() -> list[dict[str, Any]]:
    return [
        place("Dallas, TX", 32.7767, -96.797),
        place("Denver, CO", 39.7392, -104.9903),
        routes_response(*fixture_routes()),
    ]


def install(
    monkeypatch: pytest.MonkeyPatch,
    tomtom_responses: list[dict[str, Any] | Exception] | None = None,
    wind_at: Callable[[float, float], float] = calm,
    weather_answer: FakeResponse | None = None,
) -> tuple[FakeTomTomClient, FakeSession]:
    tomtom = FakeTomTomClient(*(tomtom_answers() if tomtom_responses is None else tomtom_responses))
    session = FakeSession(
        weather_answer or (lambda params: serve_forecast(params, wind_at, rain=0, showers=0))
    )
    monkeypatch.setattr(planner, "TomTomClient", lambda: tomtom)
    monkeypatch.setattr(planner, "OpenMeteoClient", lambda: OpenMeteoClient(session=session))
    return tomtom, session


def iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def payload(**overrides: Any) -> dict[str, Any]:
    body = {
        "origin": "Dallas, TX",
        "destination": "Denver, CO",
        "departure": iso(DEPARTURE),
        "load_lb": 42_000,
        "interval_miles": 25,
    }
    return body | overrides


def post(body: dict[str, Any]):
    return APIClient().post("/api/plan", body, format="json")


def routes_by_id(response) -> dict[str, dict[str, Any]]:
    return {route["id"]: route for route in response.json()["routes"]}


def test_response_has_the_documented_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    response = post(payload())

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "origin",
        "destination",
        "recommended_route_id",
        "explanation",
        "warnings",
        "routes",
    }
    assert body["origin"] == {"label": "Dallas, TX", "lat": 32.7767, "lon": -96.797}
    assert body["destination"]["label"] == "Denver, CO"
    assert [route["id"] for route in body["routes"]] == ["A", "B", "C"]
    assert sorted(route["rank"] for route in body["routes"]) == [1, 2, 3]
    assert body["warnings"] == []
    assert isinstance(body["explanation"], str)


def test_each_route_has_geometry_times_checkpoints_and_a_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch)

    route = routes_by_id(post(payload()))["A"]

    assert set(route) == {
        "id",
        "rank",
        "geometry",
        "distance_mi",
        "duration_s",
        "departure",
        "arrival",
        "checkpoints",
        "summary",
    }
    assert route["geometry"]["type"] == "LineString"
    assert route["geometry"]["coordinates"][0] == pytest.approx([-96.797, 32.7767], abs=1e-3)
    assert route["departure"] == iso(DEPARTURE)
    assert route["arrival"] == iso(DEPARTURE + timedelta(seconds=route["duration_s"]))

    checkpoints = route["checkpoints"]
    assert all(set(checkpoint) == CHECKPOINT_FIELDS for checkpoint in checkpoints)
    assert [checkpoint["mile"] for checkpoint in checkpoints[:3]] == [0, 25, 50]
    assert checkpoints[-1]["mile"] == pytest.approx(route["distance_mi"], abs=0.2)
    assert checkpoints[0]["eta"] == route["departure"]
    assert checkpoints[-1]["eta"] == route["arrival"]
    assert checkpoints[0]["wind_mph"] == CALM_MPH
    assert {checkpoint["level"] for checkpoint in checkpoints} == {"LOW"}

    summary = route["summary"]
    assert set(summary["miles_by_level"]) == LEVELS
    assert sum(summary["miles_by_level"].values()) == pytest.approx(route["distance_mi"], abs=0.5)
    assert summary["avg_risk"] == 0
    assert summary["max_level"] == "LOW"


def test_calm_weather_recommends_the_fastest_route(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    body = post(payload()).json()

    assert body["recommended_route_id"] == "A"
    assert body["explanation"].startswith("Route A is recommended: same weather risk")


def test_a_storm_on_the_fastest_route_switches_the_recommendation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch, wind_at=storm_over_the_texas_panhandle)

    response = post(payload())

    body = response.json()
    routes = routes_by_id(response)
    assert body["recommended_route_id"] == "B"
    assert {route_id: route["rank"] for route_id, route in routes.items()} == {
        "A": 3,
        "B": 1,
        "C": 2,
    }
    assert routes["A"]["summary"]["miles_by_level"]["NO_TRAVEL"] > 0
    assert routes["A"]["summary"]["max_level"] == "NO_TRAVEL"
    assert routes["B"]["summary"]["miles_by_level"]["NO_TRAVEL"] == 0
    assert body["explanation"].startswith("Route B is recommended")
    assert "fastest route (A)" in body["explanation"]


def test_stormy_checkpoints_carry_level_and_reasons(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, wind_at=storm_over_the_texas_panhandle)

    checkpoints = routes_by_id(post(payload()))["A"]["checkpoints"]

    stormy = [checkpoint for checkpoint in checkpoints if checkpoint["level"] == "NO_TRAVEL"]
    assert stormy
    assert all(checkpoint["wind_mph"] == STORM_MPH for checkpoint in stormy)
    assert all("wind 60 mph: No Travel" in checkpoint["reasons"] for checkpoint in stormy)


def test_heavy_loads_raise_the_level_in_moderate_wind(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, wind_at=lambda lat, lon: 40.0)

    heavy = routes_by_id(post(payload(load_lb=50_000)))["A"]["checkpoints"][0]

    assert heavy["level"] == "SEVERE"
    assert any("load rule" in reason for reason in heavy["reasons"])


def test_a_storm_on_every_route_warns_to_depart_later(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, wind_at=storm_everywhere)

    response = post(payload())

    assert response.status_code == 200
    assert (
        "Every route has no-travel weather; consider departing later."
        in (response.json()["warnings"])
    )


def test_all_checkpoints_of_all_routes_share_one_batched_forecast_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, session = install(monkeypatch)

    post(payload())

    assert 1 <= len(session.requests) <= 3
    hour_ranges = {(r["params"]["start_hour"], r["params"]["end_hour"]) for r in session.requests}
    assert len(hour_ranges) == 1
    assert hour_ranges.pop()[0] == DEPARTURE.strftime("%Y-%m-%dT%H:%M")


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoints_follow_the_requested_interval(
    interval: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    install(monkeypatch)

    checkpoints = routes_by_id(post(payload(interval_miles=interval)))["A"]["checkpoints"]

    assert [checkpoint["mile"] for checkpoint in checkpoints[:3]] == [0, interval, 2 * interval]


def test_interval_defaults_to_25_miles(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)
    body = payload()
    del body["interval_miles"]

    checkpoints = routes_by_id(post(body))["A"]["checkpoints"]

    assert checkpoints[1]["mile"] == 25


@pytest.mark.parametrize("load_lb", [1, 80_000])
def test_load_limits_are_accepted(load_lb: int, monkeypatch: pytest.MonkeyPatch) -> None:
    tomtom, _ = install(monkeypatch)

    assert post(payload(load_lb=load_lb)).status_code == 200
    assert tomtom.calls[2][1]["vehicleWeight"] == round(load_lb * 0.45359237)


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"load_lb": 0}, "load_lb"),
        ({"load_lb": 80_001}, "load_lb"),
        ({"load_lb": "heavy"}, "load_lb"),
        ({"interval_miles": 30}, "interval_miles"),
        ({"departure": "2026-11-03T08:00:00"}, "departure"),
        ({"departure": "tomorrow"}, "departure"),
        ({"origin": ""}, "origin"),
        ({"destination": ""}, "destination"),
    ],
)
def test_invalid_input_is_a_400_with_the_field_named(
    overrides: dict[str, Any], field: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    tomtom, session = install(monkeypatch, tomtom_responses=[])

    response = post(payload(**overrides))

    assert response.status_code == 400
    assert list(response.json()) == [field]
    assert tomtom.calls == [] and session.requests == []


def test_a_departure_without_timezone_explains_what_to_add(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch, tomtom_responses=[])

    response = post(payload(departure="2026-11-03T08:00:00"))

    assert "timezone" in response.json()["departure"][0]


def test_missing_fields_are_each_reported() -> None:
    response = post({})

    assert response.status_code == 400
    assert set(response.json()) == {"origin", "destination", "departure", "load_lb"}


def test_an_unknown_place_is_a_422_with_the_message(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, tomtom_responses=[{"results": []}])

    response = post(payload(origin="Nowhereville"))

    assert response.status_code == 422
    assert response.json() == {"error": "no match for 'Nowhereville'"}


def test_no_route_between_the_places_is_a_422(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = [*tomtom_answers()[:2], routes_response()]
    install(monkeypatch, tomtom_responses=answers)

    response = post(payload())

    assert response.status_code == 422
    assert response.json() == {"error": "no route found"}


def test_a_departure_beyond_the_forecast_is_a_422(monkeypatch: pytest.MonkeyPatch) -> None:
    _, session = install(monkeypatch)
    far_away = DEPARTURE + timedelta(days=30)

    response = post(payload(departure=iso(far_away)))

    assert response.status_code == 422
    assert "Forecasts only reach" in response.json()["error"]
    assert session.requests == []


def test_a_departure_in_the_past_is_a_422(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    response = post(payload(departure=iso(DEPARTURE - timedelta(days=5))))

    assert response.status_code == 422
    assert "not in the past" in response.json()["error"]


def test_routing_service_failure_is_a_502_without_internal_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    answers = [*tomtom_answers()[:2], TomTomError("TomTom returned HTTP 500: boom")]
    install(monkeypatch, tomtom_responses=answers)

    response = post(payload())

    assert response.status_code == 502
    assert response.json() == {
        "error": "The routing service is not responding. Please try again in a moment."
    }


def test_geocoding_service_failure_is_a_502(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, tomtom_responses=[TomTomError("TomTom request failed: Timeout")])

    assert post(payload()).status_code == 502


def test_weather_service_failure_is_a_502(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather.time, "sleep", lambda seconds: None)
    install(monkeypatch, weather_answer=FakeResponse(503))

    response = post(payload())

    assert response.status_code == 502
    assert response.json() == {
        "error": "The weather service is not responding. Please try again in a moment."
    }


def test_plan_only_accepts_post() -> None:
    assert APIClient().get("/api/plan").status_code == 405


def test_each_stage_is_logged_with_its_timing(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    install(monkeypatch)

    with caplog.at_level(logging.INFO, logger="routing"):
        post(payload())

    messages = [record.getMessage() for record in caplog.records]
    for stage in ("geocode", "routing", "checkpoints", "weather", "risk"):
        assert any(m.startswith(f"plan stage={stage} ms=") for m in messages)
    assert any(m.startswith("plan total ms=") for m in messages)
