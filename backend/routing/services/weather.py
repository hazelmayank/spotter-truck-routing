"""Hourly wind and precipitation forecasts from Open-Meteo."""

import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from math import floor
from typing import Any

import requests
from django.core.cache import cache

from .geo import Point

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARIABLES = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"
HOUR_FORMAT = "%Y-%m-%dT%H:%M"

FORECAST_DAYS = 16
MAX_POINTS_PER_REQUEST = 100
MAX_WORKERS = 4
TIMEOUT_S = 15
RETRY_BACKOFFS_S = (1.0, 3.0, 8.0)
COORD_DECIMALS = 2
CACHE_TTL_S = 30 * 60


class WeatherError(Exception):
    pass


class ForecastRangeError(WeatherError):
    pass


@dataclass(frozen=True)
class HourlySeries:
    """Parallel hourly arrays for one point; None marks an hour with missing data."""

    time: list[datetime]
    wind_mph: list[float | None]
    gust_mph: list[float | None]
    rain_in_hr: list[float | None]  # rain + showers
    snow_in_hr: list[float | None]


@dataclass(frozen=True)
class HourlyWeather:
    time: datetime
    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None


class OpenMeteoClient:
    def __init__(self, session: requests.Session | None = None):
        self._session = session or requests.Session()

    def fetch_hourly(
        self,
        points: Sequence[Point],
        start_utc: datetime,
        end_utc: datetime,
        now: datetime | None = None,
    ) -> list[HourlySeries]:
        """One series per point, in order, covering the whole hours around start and end."""
        start, end = _hour_range(start_utc, end_utc, now or datetime.now(UTC))

        rounded = [(round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS)) for lat, lon in points]
        keys = {point: _cache_key(point, start, end) for point in dict.fromkeys(rounded)}
        cached = cache.get_many(keys.values())
        missing = [point for point, key in keys.items() if key not in cached]

        fetched = self._fetch_missing(missing, start, end)
        cache.set_many({keys[point]: series for point, series in fetched.items()}, CACHE_TTL_S)

        series_by_point = {point: cached[key] for point, key in keys.items() if key in cached}
        series_by_point.update(fetched)
        return [series_by_point[point] for point in rounded]

    def _fetch_missing(
        self, points: list[Point], start: datetime, end: datetime
    ) -> dict[Point, HourlySeries]:
        batches = [
            points[i : i + MAX_POINTS_PER_REQUEST]
            for i in range(0, len(points), MAX_POINTS_PER_REQUEST)
        ]
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            batch_series = pool.map(lambda batch: self._fetch_batch(batch, start, end), batches)
            series = [s for series_of_batch in batch_series for s in series_of_batch]
        return dict(zip(points, series, strict=True))

    def _fetch_batch(
        self, points: list[Point], start: datetime, end: datetime
    ) -> list[HourlySeries]:
        body = self._get(
            {
                "latitude": ",".join(f"{lat:.{COORD_DECIMALS}f}" for lat, _ in points),
                "longitude": ",".join(f"{lon:.{COORD_DECIMALS}f}" for _, lon in points),
                "hourly": HOURLY_VARIABLES,
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "timezone": "GMT",
                "start_hour": start.strftime(HOUR_FORMAT),
                "end_hour": end.strftime(HOUR_FORMAT),
            }
        )
        # A single point is answered with a bare object, several with a list.
        locations = body if isinstance(body, list) else [body]
        return [_parse_series(location["hourly"]) for location in locations]

    def _get(self, params: dict[str, Any]) -> Any:
        response = self._request(params)
        for backoff_s in RETRY_BACKOFFS_S:
            if not _is_retryable(response):
                break
            time.sleep(backoff_s)
            response = self._request(params)
        if not response.ok:
            raise WeatherError(_http_error(response))
        return response.json()

    def _request(self, params: dict[str, Any]) -> requests.Response:
        try:
            return self._session.get(FORECAST_URL, params=params, timeout=TIMEOUT_S)
        except requests.RequestException as exc:
            raise WeatherError(f"Open-Meteo request failed: {type(exc).__name__}") from exc


def _is_retryable(response: requests.Response) -> bool:
    return (
        response.status_code == HTTPStatus.TOO_MANY_REQUESTS
        or response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR
    )


def _http_error(response: requests.Response) -> str:
    message = f"Open-Meteo returned HTTP {response.status_code}"
    if response.status_code != HTTPStatus.TOO_MANY_REQUESTS:
        return message
    # The reason names the exhausted limit (minute, hour or day), which tells whether waiting helps.
    try:
        reason = response.json().get("reason")
    except ValueError:
        return message
    return f"{message}: {reason}" if reason else message


def weather_at(series: HourlySeries, eta_utc: datetime) -> HourlyWeather:
    """Values for the hour nearest to `eta_utc`; exactly half past rounds up."""
    hours_since_start = (eta_utc - series.time[0]) / timedelta(hours=1)
    i = floor(hours_since_start + 0.5)
    if not 0 <= i < len(series.time):
        raise ForecastRangeError(f"the forecast does not cover {eta_utc:%Y-%m-%d %H:%M} UTC")
    return HourlyWeather(
        time=series.time[i],
        wind_mph=series.wind_mph[i],
        gust_mph=series.gust_mph[i],
        rain_in_hr=series.rain_in_hr[i],
        snow_in_hr=series.snow_in_hr[i],
    )


def last_forecast_hour(now: datetime) -> datetime:
    """The last hour the forecast covers: the hour before 16 days after the start of today."""
    return _start_of_day(now) + timedelta(days=FORECAST_DAYS) - timedelta(hours=1)


def _start_of_day(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


def _hour_range(start_utc: datetime, end_utc: datetime, now: datetime) -> tuple[datetime, datetime]:
    """Whole-hour start and end, checked against the days the forecast covers."""
    if start_utc.tzinfo is None or end_utc.tzinfo is None:
        raise ValueError("start_utc and end_utc must be timezone-aware")
    if end_utc < start_utc:
        raise ForecastRangeError("the end of the forecast range is before its start")

    start = start_utc.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    end = end_utc.astimezone(UTC)
    end = end.replace(minute=0, second=0, microsecond=0) + (
        timedelta(hours=1) if end.minute or end.second or end.microsecond else timedelta()
    )

    today = _start_of_day(now)
    forecast_end = last_forecast_hour(now) + timedelta(hours=1)
    if start < today:
        raise ForecastRangeError(
            f"Forecasts start today ({today:%Y-%m-%d} UTC); "
            "choose a departure that is not in the past."
        )
    if end >= forecast_end:
        raise ForecastRangeError(
            f"Forecasts only reach {forecast_end:%Y-%m-%d %H:%M} UTC but the trip window ends "
            f"{end:%Y-%m-%d %H:%M} UTC; choose an earlier departure."
        )
    return start, end


def _cache_key(point: Point, start: datetime, end: datetime) -> str:
    lat, lon = point
    return f"open-meteo:{lat},{lon}:{start:%Y%m%d%H}:{end:%Y%m%d%H}"


def _parse_series(hourly: dict[str, list[Any]]) -> HourlySeries:
    return HourlySeries(
        time=[datetime.strptime(t, HOUR_FORMAT).replace(tzinfo=UTC) for t in hourly["time"]],
        wind_mph=hourly["wind_speed_10m"],
        gust_mph=hourly["wind_gusts_10m"],
        rain_in_hr=[
            _sum_present(rain, showers)
            for rain, showers in zip(hourly["rain"], hourly["showers"], strict=True)
        ],
        snow_in_hr=hourly["snowfall"],
    )


def _sum_present(*values: float | None) -> float | None:
    present = [value for value in values if value is not None]
    return sum(present) if present else None
