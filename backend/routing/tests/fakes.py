import json
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

HOUR_FORMAT = "%Y-%m-%dT%H:%M"
FIXTURES = Path(__file__).parent / "fixtures"


class FakeTomTomClient:
    """Stands in for TomTomClient: replays queued responses and records the calls."""

    def __init__(self, *responses: dict[str, Any] | Exception) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((path, params))
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeResponse:
    def __init__(self, status_code: int = 200, body: Any = None) -> None:
        self.status_code = status_code
        self.ok = status_code < 400
        self.reason = "Bad Request"
        self._body = body if body is not None else {}

    def json(self) -> Any:
        return self._body


class FakeSession:
    """Stands in for requests.Session.

    `answer` is a response or exception returned for every call, or a function of the
    query params that returns one (a plain body is wrapped in a 200 response).
    """

    def __init__(self, answer: FakeResponse | Exception | Callable[[dict[str, Any]], Any]) -> None:
        self._answer = answer
        self.requests: list[dict[str, Any]] = []

    def get(self, url: str, params: dict[str, Any], timeout: float) -> FakeResponse:
        self.requests.append({"url": url, "params": params, "timeout": timeout})
        answer = self._answer(params) if callable(self._answer) else self._answer
        if isinstance(answer, Exception):
            raise answer
        return answer if isinstance(answer, FakeResponse) else FakeResponse(200, answer)


def location_body(
    lat: float,
    lon: float,
    params: dict[str, Any],
    wind_mph: float | None = None,
    rain: float = 0.1,
    showers: float = 0.05,
) -> dict[str, Any]:
    """One Open-Meteo location; wind defaults to the latitude and gusts to the longitude."""
    first = datetime.strptime(params["start_hour"], HOUR_FORMAT)
    last = datetime.strptime(params["end_hour"], HOUR_FORMAT)
    hour_count = int((last - first).total_seconds() // 3600) + 1
    hours = [first + timedelta(hours=h) for h in range(hour_count)]
    wind = lat if wind_mph is None else wind_mph
    return {
        "latitude": lat,
        "longitude": lon,
        "hourly": {
            "time": [hour.strftime(HOUR_FORMAT) for hour in hours],
            "wind_speed_10m": [wind] * hour_count,
            "wind_gusts_10m": [lon] * hour_count,
            "rain": [rain] * hour_count,
            "showers": [showers] * hour_count,
            "snowfall": [0.0] * hour_count,
        },
    }


def serve_forecast(
    params: dict[str, Any],
    wind_at: Callable[[float, float], float] | None = None,
    rain: float = 0.1,
    showers: float = 0.05,
) -> Any:
    """Answer like Open-Meteo: a list for several points, a bare object for a single one."""
    lats = [float(lat) for lat in params["latitude"].split(",")]
    lons = [float(lon) for lon in params["longitude"].split(",")]
    locations = [
        location_body(
            lat, lon, params, None if wind_at is None else wind_at(lat, lon), rain, showers
        )
        for lat, lon in zip(lats, lons, strict=True)
    ]
    return locations if len(locations) > 1 else locations[0]


def fixture_routes() -> list[dict[str, Any]]:
    """Dallas to Denver, fastest first: US-287 (A), I-35/I-70 (+22% time), US-84 (+35% time)."""
    with (FIXTURES / "calculate_route_alternatives.json").open() as file:
        return json.load(file)["routes"]


def routes_response(*routes: dict[str, Any]) -> dict[str, Any]:
    return {"formatVersion": "0.0.12", "routes": list(routes)}
