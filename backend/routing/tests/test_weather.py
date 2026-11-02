import threading
import time
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import pytest
import requests
from django.core.cache import cache

from routing.services import weather
from routing.services.geo import Point
from routing.services.weather import (
    ForecastRangeError,
    HourlySeries,
    OpenMeteoClient,
    WeatherError,
    weather_at,
)

from .fakes import FakeResponse, FakeSession, location_body, serve_forecast

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
START = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)
END = START + timedelta(hours=4)
FORECAST_END = datetime(2026, 11, 19, 0, 0, tzinfo=UTC)  # first hour with no forecast
CENTRAL_STANDARD = timezone(timedelta(hours=-6))


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    cache.clear()


def spread_points(count: int) -> list[Point]:
    return [(30 + i * 0.05, -100 + i * 0.05) for i in range(count)]


def fetch(
    points: list[Point], session: FakeSession, start: datetime = START, end: datetime = END
) -> list[HourlySeries]:
    return OpenMeteoClient(session=session).fetch_hourly(points, start, end, now=NOW)


def points_in(request: dict[str, Any]) -> int:
    return len(request["params"]["latitude"].split(","))


@pytest.mark.parametrize(
    ("count", "batch_sizes"),
    [(1, [1]), (100, [100]), (101, [100, 1]), (250, [100, 100, 50])],
)
def test_points_are_split_into_batches_of_at_most_100(count: int, batch_sizes: list[int]) -> None:
    session = FakeSession(serve_forecast)

    fetch(spread_points(count), session)

    assert sorted((points_in(r) for r in session.requests), reverse=True) == batch_sizes


def test_batched_results_come_back_in_the_order_of_the_points() -> None:
    points = spread_points(250)

    series = fetch(points, FakeSession(serve_forecast))

    assert [s.wind_mph[0] for s in series] == pytest.approx([round(lat, 2) for lat, _ in points])
    assert [s.gust_mph[0] for s in series] == pytest.approx([round(lon, 2) for _, lon in points])


def test_points_are_rounded_to_two_decimals_and_deduplicated() -> None:
    session = FakeSession(serve_forecast)
    dallas, dallas_nearby, denver = (32.7767, -96.797), (32.7801, -96.7962), (39.7392, -104.9903)

    series = fetch([dallas, denver, dallas_nearby, dallas], session)

    assert len(session.requests) == 1
    params = session.requests[0]["params"]
    assert params["latitude"] == "32.78,39.74"
    assert params["longitude"] == "-96.80,-104.99"
    assert len(series) == 4
    assert series[0] == series[2] == series[3]
    assert series[0].wind_mph[0] == 32.78
    assert series[1].wind_mph[0] == 39.74


def test_request_asks_for_hourly_mph_inch_gmt_over_the_hour_range() -> None:
    session = FakeSession(serve_forecast)

    fetch([(32.78, -96.8)], session)

    request = session.requests[0]
    assert request["url"] == "https://api.open-meteo.com/v1/forecast"
    assert request["timeout"] == 15
    assert request["params"] == {
        "latitude": "32.78",
        "longitude": "-96.80",
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": "2026-11-03T08:00",
        "end_hour": "2026-11-03T12:00",
    }


def test_hour_range_is_widened_to_whole_hours() -> None:
    session = FakeSession(serve_forecast)

    fetch([(32.78, -96.8)], session, START + timedelta(minutes=20), END + timedelta(minutes=5))

    params = session.requests[0]["params"]
    assert (params["start_hour"], params["end_hour"]) == ("2026-11-03T08:00", "2026-11-03T13:00")


def test_series_has_utc_times_and_one_value_per_hour() -> None:
    series = fetch([(32.78, -96.8)], FakeSession(serve_forecast))[0]

    assert series.time == [START + timedelta(hours=h) for h in range(5)]
    assert series.time[0].tzinfo == UTC
    assert len(series.wind_mph) == len(series.gust_mph) == len(series.snow_in_hr) == 5


def test_rain_in_hr_is_rain_plus_showers() -> None:
    series = fetch([(32.78, -96.8)], FakeSession(serve_forecast))[0]

    assert series.rain_in_hr == pytest.approx([0.15] * 5)


@pytest.mark.parametrize(
    ("rain", "showers", "expected"),
    [(0.2, None, 0.2), (None, 0.3, 0.3), (None, None, None), (0.0, 0.0, 0.0)],
)
def test_rain_in_hr_with_missing_parts(
    rain: float | None, showers: float | None, expected: float | None
) -> None:
    def serve(params: dict[str, Any]) -> dict[str, Any]:
        body = location_body(32.78, -96.8, params)
        body["hourly"]["rain"], body["hourly"]["showers"] = [rain] * 5, [showers] * 5
        return body

    series = fetch([(32.78, -96.8)], FakeSession(serve))[0]

    assert series.rain_in_hr[0] == expected


def test_missing_wind_stays_none() -> None:
    def serve(params: dict[str, Any]) -> dict[str, Any]:
        body = location_body(32.78, -96.8, params)
        body["hourly"]["wind_speed_10m"][2] = None
        return body

    series = fetch([(32.78, -96.8)], FakeSession(serve))[0]

    assert series.wind_mph[2] is None
    assert series.wind_mph[1] == 32.78


def test_second_identical_call_is_served_from_the_cache() -> None:
    session = FakeSession(serve_forecast)
    points = spread_points(5)

    first = fetch(points, session)
    second = fetch(points, session)

    assert len(session.requests) == 1
    assert second == first


def test_only_uncached_points_are_requested() -> None:
    session = FakeSession(serve_forecast)
    fetch([(32.78, -96.8), (39.74, -104.99)], session)

    series = fetch([(39.74, -104.99), (35.22, -101.83)], session)

    assert len(session.requests) == 2
    assert session.requests[1]["params"]["latitude"] == "35.22"
    assert [s.wind_mph[0] for s in series] == [39.74, 35.22]


def test_cache_is_keyed_by_hour_range() -> None:
    session = FakeSession(serve_forecast)
    fetch([(32.78, -96.8)], session)

    fetch([(32.78, -96.8)], session, START, END + timedelta(hours=1))

    assert len(session.requests) == 2


def test_cached_forecasts_expire_after_thirty_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    timeouts = []
    real_set_many = cache.set_many
    monkeypatch.setattr(
        weather.cache,
        "set_many",
        lambda data, timeout: timeouts.append(timeout) or real_set_many(data, timeout),
    )

    fetch([(32.78, -96.8)], FakeSession(serve_forecast))

    assert timeouts == [30 * 60]


def forecast_body() -> dict[str, Any]:
    params = {"start_hour": "2026-11-03T08:00", "end_hour": "2026-11-03T12:00"}
    return location_body(32.78, -96.8, params)


@pytest.mark.parametrize("status", [429, 500, 503])
def test_retries_once_on_rate_limit_and_server_errors(
    status: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    sleeps = []
    monkeypatch.setattr(weather.time, "sleep", sleeps.append)
    answers = [FakeResponse(status), FakeResponse(200, forecast_body())]
    session = FakeSession(lambda params: answers.pop(0))

    series = fetch([(32.78, -96.8)], session)

    assert len(session.requests) == 2
    assert len(sleeps) == 1
    assert series[0].wind_mph[0] == 32.78


def test_gives_up_after_one_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather.time, "sleep", lambda seconds: None)
    session = FakeSession(FakeResponse(503))

    with pytest.raises(WeatherError, match="HTTP 503"):
        fetch([(32.78, -96.8)], session)

    assert len(session.requests) == 2


def test_client_errors_are_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather.time, "sleep", lambda seconds: pytest.fail("slept"))
    session = FakeSession(FakeResponse(400))

    with pytest.raises(WeatherError, match="HTTP 400"):
        fetch([(32.78, -96.8)], session)

    assert len(session.requests) == 1


def test_network_failure_is_a_weather_error() -> None:
    session = FakeSession(requests.ConnectionError("down"))

    with pytest.raises(WeatherError, match="ConnectionError"):
        fetch([(32.78, -96.8)], session)


def test_batches_run_in_parallel_on_at_most_four_workers() -> None:
    running, peak, lock = 0, 0, threading.Lock()

    def serve(params: dict[str, Any]) -> Any:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1
        return serve_forecast(params)

    fetch(spread_points(800), FakeSession(serve))

    assert 1 < peak <= 4


def test_range_past_the_forecast_horizon_is_rejected_without_a_request() -> None:
    session = FakeSession(serve_forecast)
    start = datetime(2026, 11, 18, 8, 0, tzinfo=UTC)

    with pytest.raises(ForecastRangeError, match="2026-11-19 00:00 UTC"):
        fetch([(32.78, -96.8)], session, start, start + timedelta(hours=48))

    assert session.requests == []


def test_last_forecast_hour_is_accepted_and_the_next_is_not() -> None:
    last_hour = FORECAST_END - timedelta(hours=1)
    fetch([(32.78, -96.8)], FakeSession(serve_forecast), last_hour, last_hour)

    with pytest.raises(ForecastRangeError):
        fetch([(32.78, -96.8)], FakeSession(serve_forecast), last_hour, FORECAST_END)


def test_start_before_today_is_rejected() -> None:
    session = FakeSession(serve_forecast)

    with pytest.raises(ForecastRangeError, match="not in the past"):
        fetch([(32.78, -96.8)], session, datetime(2026, 11, 2, 23, 0, tzinfo=UTC), START)

    assert session.requests == []


def test_end_before_start_is_rejected() -> None:
    with pytest.raises(ForecastRangeError, match="before"):
        fetch([(32.78, -96.8)], FakeSession(serve_forecast), END, START)


def test_naive_datetimes_are_rejected() -> None:
    naive_start = datetime(2026, 11, 3, 8, 0)

    with pytest.raises(ValueError, match="timezone"):
        fetch([(32.78, -96.8)], FakeSession(serve_forecast), naive_start, END)


def hourly_series() -> HourlySeries:
    hours = [START + timedelta(hours=h) for h in range(5)]
    return HourlySeries(
        time=hours,
        wind_mph=[10.0, 20.0, None, 40.0, 50.0],
        gust_mph=[15.0, 25.0, 35.0, 45.0, 55.0],
        rain_in_hr=[0.0, 0.1, 0.2, 0.3, 0.4],
        snow_in_hr=[0.0, 0.0, 0.5, 0.0, 1.0],
    )


@pytest.mark.parametrize(
    ("eta", "expected_hour"),
    [
        (START, 0),
        (START + timedelta(minutes=29), 0),
        (START + timedelta(minutes=30), 1),
        (START + timedelta(minutes=31), 1),
        (START + timedelta(hours=1, minutes=29), 1),
        (START + timedelta(hours=1, minutes=31), 2),
        (START + timedelta(hours=4), 4),
        (START + timedelta(hours=3, minutes=40), 4),
        (START - timedelta(minutes=29), 0),
        (START + timedelta(hours=4, minutes=29), 4),
    ],
)
def test_weather_at_picks_the_nearest_hour(eta: datetime, expected_hour: int) -> None:
    series = hourly_series()

    hour = weather_at(series, eta)

    assert hour.time == series.time[expected_hour]
    assert hour.wind_mph == series.wind_mph[expected_hour]
    assert hour.gust_mph == series.gust_mph[expected_hour]
    assert hour.rain_in_hr == series.rain_in_hr[expected_hour]
    assert hour.snow_in_hr == series.snow_in_hr[expected_hour]


def test_weather_at_ignores_the_timezone_of_the_eta() -> None:
    eta = (START + timedelta(hours=2)).astimezone(CENTRAL_STANDARD)

    assert weather_at(hourly_series(), eta).time == START + timedelta(hours=2)


@pytest.mark.parametrize("offset", [timedelta(minutes=-31), timedelta(hours=4, minutes=31)])
def test_weather_at_outside_the_series_is_an_error(offset: timedelta) -> None:
    with pytest.raises(ForecastRangeError, match="does not cover"):
        weather_at(hourly_series(), START + offset)
