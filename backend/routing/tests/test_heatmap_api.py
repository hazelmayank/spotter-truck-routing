import gzip
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from routing.services import heatmap as heatmap_service
from routing.services import weather
from routing.services.weather import OpenMeteoClient

from .fakes import FakeResponse, FakeSession, serve_forecast

DEPARTURE = (datetime.now(UTC) + timedelta(days=1)).replace(
    hour=12, minute=0, second=0, microsecond=0
)
DALLAS_TO_DENVER = {
    "type": "LineString",
    "coordinates": [[-96.797, 32.7767], [-100.0, 36.0], [-104.9903, 39.7392]],
}
DETOUR = {
    "type": "LineString",
    "coordinates": [[-96.797, 32.7767], [-97.5, 38.0], [-104.9903, 39.7392]],
}


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    cache.clear()


def install(monkeypatch: pytest.MonkeyPatch, answer: Any = None) -> FakeSession:
    session = FakeSession(answer or (lambda params: serve_forecast(params, rain=0, showers=0)))
    monkeypatch.setattr(
        heatmap_service, "OpenMeteoClient", lambda: OpenMeteoClient(session=session)
    )
    return session


def iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def payload(**overrides: Any) -> dict[str, Any]:
    body = {
        "routes": [{"id": "A", "geometry": DALLAS_TO_DENVER}],
        "departure": iso(DEPARTURE),
        "load_lb": 42_000,
    }
    return body | overrides


def post(body: dict[str, Any], **extra: str):
    return APIClient().post("/api/heatmap", body, format="json", **extra)


def test_response_has_the_documented_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    response = post(payload())

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"start", "hours", "step_deg", "points"}
    assert body["step_deg"] == 0.25
    assert body["start"] == iso(DEPARTURE)
    assert body["hours"] == 49
    assert len(body["points"]) > 30
    point = body["points"][0]
    assert set(point) == {"lat", "lon", "risk", "wind_mph", "rain_in_hr", "snow_in_hr"}
    for series in ("risk", "wind_mph", "rain_in_hr", "snow_in_hr"):
        assert len(point[series]) == 49


def test_points_are_grid_cells_along_the_route(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    points = post(payload()).json()["points"]

    assert all(p["lat"] % 0.25 == 0 and p["lon"] % 0.25 == 0 for p in points)
    assert min(p["lat"] for p in points) < 33
    assert max(p["lat"] for p in points) > 39
    assert min(p["lon"] for p in points) < -104.5
    assert max(p["lon"] for p in points) > -97.5


def test_risk_levels_are_whole_numbers_from_0_to_4(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch, lambda params: serve_forecast(params, wind_at=lambda lat, lon: 50.0))

    point = post(payload()).json()["points"][0]

    assert set(point["risk"]) == {4}  # 50 mph with 42,000 lb is NO_TRAVEL


def test_more_routes_widen_the_corridor(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)
    one = len(post(payload()).json()["points"])
    cache.clear()

    two = len(
        post(
            payload(
                routes=[
                    {"id": "A", "geometry": DALLAS_TO_DENVER},
                    {"id": "B", "geometry": DETOUR},
                ]
            )
        ).json()["points"]
    )

    assert two > one


def test_the_forecast_is_fetched_once_per_range_and_then_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = install(monkeypatch)
    post(payload())
    first_requests = len(session.requests)

    post(payload())

    assert first_requests > 0
    assert len(session.requests) == first_requests


def test_the_response_is_gzipped_when_the_client_accepts_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install(monkeypatch)

    response = post(payload(), HTTP_ACCEPT_ENCODING="gzip")

    assert response["Content-Encoding"] == "gzip"
    assert json.loads(gzip.decompress(response.content))["hours"] == 49


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"departure": "2026-11-03T08:00:00"}, "departure"),
        ({"departure": "tomorrow"}, "departure"),
        ({"load_lb": 0}, "load_lb"),
        ({"load_lb": 80_001}, "load_lb"),
        ({"routes": []}, "routes"),
        ({"routes": [{"id": str(n), "geometry": DALLAS_TO_DENVER} for n in range(4)]}, "routes"),
        ({"routes": [{"id": "A"}]}, "routes"),
        ({"routes": [{"id": "A", "geometry": {"type": "Point", "coordinates": [0, 0]}}]}, "routes"),
        (
            {"routes": [{"id": "A", "geometry": {"type": "LineString", "coordinates": [[0, 0]]}}]},
            "routes",
        ),
        (
            {
                "routes": [
                    {
                        "id": "A",
                        "geometry": {"type": "LineString", "coordinates": [[0, 0], [200, 0]]},
                    }
                ]
            },
            "routes",
        ),
        (
            {
                "routes": [
                    {
                        "id": "A",
                        "geometry": {"type": "LineString", "coordinates": [[0, 0], [0, 95]]},
                    }
                ]
            },
            "routes",
        ),
    ],
)
def test_invalid_input_is_a_400_naming_the_field(
    overrides: dict[str, Any], field: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = install(monkeypatch)

    response = post(payload(**overrides))

    assert response.status_code == 400
    assert list(response.json()) == [field]
    assert session.requests == []


def test_missing_fields_are_each_reported() -> None:
    response = post({})

    assert response.status_code == 400
    assert set(response.json()) == {"routes", "departure", "load_lb"}


def test_a_departure_beyond_the_forecast_is_a_422(monkeypatch: pytest.MonkeyPatch) -> None:
    session = install(monkeypatch)

    response = post(payload(departure=iso(DEPARTURE + timedelta(days=30))))

    assert response.status_code == 422
    assert "Forecasts only reach" in response.json()["error"]
    assert session.requests == []


def test_a_departure_in_the_past_is_a_422(monkeypatch: pytest.MonkeyPatch) -> None:
    install(monkeypatch)

    response = post(payload(departure=iso(DEPARTURE - timedelta(days=5))))

    assert response.status_code == 422
    assert "not in the past" in response.json()["error"]


def test_weather_service_failure_is_a_502(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather.time, "sleep", lambda seconds: None)
    install(monkeypatch, FakeResponse(503))

    response = post(payload())

    assert response.status_code == 502
    assert response.json() == {
        "error": "The weather service is not responding. Please try again in a moment."
    }


def test_heatmap_only_accepts_post() -> None:
    assert APIClient().get("/api/heatmap").status_code == 405
