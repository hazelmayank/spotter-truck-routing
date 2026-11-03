import logging
from datetime import UTC, datetime, timedelta
from math import ceil
from typing import Any

import pytest
from django.core.cache import cache

from routing.services.heatmap import build_heatmap, corridor_grid, grid_points
from routing.services.weather import ForecastRangeError, OpenMeteoClient, last_forecast_hour

from .fakes import FakeSession, serve_forecast
from .lines import equator_line

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
START = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)
LINE = equator_line(100)


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    cache.clear()


def calm_forecast(params: dict[str, Any]) -> Any:
    return serve_forecast(params, rain=0, showers=0)


def wind_equals_hour(params: dict[str, Any]) -> Any:
    """Wind speed in mph equals the hour number, so each hour sits at a known threshold."""
    body = calm_forecast(params)
    for location in body if isinstance(body, list) else [body]:
        hours = len(location["hourly"]["time"])
        location["hourly"]["wind_speed_10m"] = [float(hour) for hour in range(hours)]
    return body


def missing_weather(params: dict[str, Any]) -> Any:
    body = serve_forecast(params)
    for location in body if isinstance(body, list) else [body]:
        for variable in ("wind_speed_10m", "rain", "showers", "snowfall"):
            location["hourly"][variable] = [None] * len(location["hourly"]["time"])
    return body


def build(handler=calm_forecast, load_lb: float = 20_000, departure: datetime = START):
    session = FakeSession(handler)
    heatmap = build_heatmap(
        [LINE], departure, load_lb, client=OpenMeteoClient(session=session), now=NOW
    )
    return heatmap, session


class TestCorridorGrid:
    def test_points_sit_on_multiples_of_the_step(self) -> None:
        points = corridor_grid([LINE], 0.25)

        assert all(lat % 0.25 == 0 and lon % 0.25 == 0 for lat, lon in points)

    def test_is_three_cells_wide_along_a_straight_line(self) -> None:
        line = [(0.0, 0.0), (0.0, 2.5)]  # 10 cells long, about 173 miles

        points = corridor_grid([line], 0.25)

        assert {lat for lat, _ in points} == {-0.25, 0.0, 0.25}
        assert {lon for _, lon in points} == {i * 0.25 for i in range(-1, 12)}
        assert len(points) == 3 * 13

    def test_is_sorted_south_to_north_then_west_to_east(self) -> None:
        points = corridor_grid([LINE], 0.25)

        assert points == sorted(points)

    def test_routes_sharing_a_corridor_share_their_points(self) -> None:
        assert corridor_grid([LINE, LINE], 0.25) == corridor_grid([LINE], 0.25)

    def test_diverging_routes_add_points(self) -> None:
        north = [(lat + 2.0, lon) for lat, lon in LINE]

        assert len(corridor_grid([LINE, north], 0.25)) > len(corridor_grid([LINE], 0.25))

    def test_a_coarser_step_gives_fewer_points(self) -> None:
        assert len(corridor_grid([LINE], 0.5)) < len(corridor_grid([LINE], 0.25))


class TestGridPoints:
    def test_uses_quarter_degree_cells_normally(self) -> None:
        grid = grid_points([LINE])

        assert grid.step_deg == 0.25
        assert grid.points == corridor_grid([LINE], 0.25)

    def test_falls_back_to_half_degree_cells_over_the_cap(self) -> None:
        grid = grid_points([LINE], max_points=10)

        assert grid.step_deg == 0.5
        assert grid.points == corridor_grid([LINE], 0.5)
        assert all(lat % 0.5 == 0 and lon % 0.5 == 0 for lat, lon in grid.points)

    def test_keeps_the_fine_grid_at_exactly_the_cap(self) -> None:
        fine = corridor_grid([LINE], 0.25)

        grid = grid_points([LINE], max_points=len(fine))

        assert (grid.step_deg, grid.points) == (0.25, fine)


class TestBuildHeatmap:
    def test_has_one_entry_per_hour_for_every_grid_point(self) -> None:
        heatmap, _ = build()

        assert heatmap.hours == 49
        assert [(p.lat, p.lon) for p in heatmap.points] == grid_points([LINE]).points
        assert heatmap.step_deg == 0.25
        for point in heatmap.points:
            assert len(point.risk) == len(point.wind_mph) == 49
            assert len(point.rain_in_hr) == len(point.snow_in_hr) == 49

    def test_starts_at_the_departure_hour(self) -> None:
        heatmap, _ = build(departure=START + timedelta(minutes=20))

        assert heatmap.start == START

    def test_risk_follows_the_wind_thresholds_hour_by_hour(self) -> None:
        heatmap, _ = build(wind_equals_hour)

        risk = heatmap.points[0].risk
        assert [risk[hour] for hour in (0, 24, 25, 34, 35, 44, 45, 48)] == [0, 0, 1, 1, 2, 2, 3, 3]

    def test_a_heavy_load_raises_the_risk_where_the_load_rules_apply(self) -> None:
        light, _ = build(wind_equals_hour, load_lb=20_000)
        heavy, _ = build(wind_equals_hour, load_lb=50_000)

        assert light.points[0].risk[40] == 2  # 40 mph is HIGH
        assert heavy.points[0].risk[40] == 3  # over 40,000 lb in 35-44 mph is SEVERE
        assert light.points[0].risk[48] == 3  # 48 mph is SEVERE
        assert heavy.points[0].risk[48] == 4  # over 30,000 lb in 45-54 mph is NO_TRAVEL

    def test_a_light_load_gets_no_load_rule(self) -> None:
        heatmap, _ = build(wind_equals_hour, load_lb=1_000)

        assert heatmap.points[0].risk[40] == 2

    def test_reports_wind_rain_and_snow_for_every_hour(self) -> None:
        heatmap, _ = build(lambda params: serve_forecast(params))
        point = heatmap.points[0]

        assert point.wind_mph[0] == pytest.approx(round(point.lat, 1))  # test wind is the latitude
        assert point.rain_in_hr == pytest.approx([0.15] * 49)  # rain 0.10 + showers 0.05
        assert point.snow_in_hr == [0.0] * 49

    def test_rounds_wind_to_a_tenth_and_precipitation_to_a_hundredth(self) -> None:
        def handler(params: dict[str, Any]) -> Any:
            body = calm_forecast(params)
            for location in body if isinstance(body, list) else [body]:
                size = len(location["hourly"]["time"])
                location["hourly"]["wind_speed_10m"] = [12.3456] * size
                location["hourly"]["rain"] = [0.12345] * size
                location["hourly"]["snowfall"] = [0.678] * size
            return body

        point = build(handler)[0].points[0]

        assert (point.wind_mph[0], point.rain_in_hr[0], point.snow_in_hr[0]) == (12.3, 0.12, 0.68)

    def test_missing_weather_counts_as_zero(self) -> None:
        heatmap, _ = build(missing_weather)

        for point in heatmap.points:
            assert set(point.risk) == {0}
            assert set(point.wind_mph) == set(point.rain_in_hr) == set(point.snow_in_hr) == {0.0}

    def test_makes_one_batched_request_set_for_the_whole_range(self) -> None:
        heatmap, session = build()

        batches = ceil(len(heatmap.points) / 100)
        assert len(session.requests) == batches
        ranges = {(r["params"]["start_hour"], r["params"]["end_hour"]) for r in session.requests}
        assert ranges == {("2026-11-03T08:00", "2026-11-05T08:00")}

    def test_is_served_from_the_cache_the_second_time(self) -> None:
        _, first_session = build()
        _, second_session = build()

        assert first_session.requests
        assert second_session.requests == []

    def test_ends_at_the_forecast_horizon_instead_of_failing(self) -> None:
        departure = last_forecast_hour(NOW) - timedelta(hours=10)

        heatmap, session = build(departure=departure)

        assert heatmap.hours == 11
        assert session.requests[0]["params"]["end_hour"] == "2026-11-18T23:00"

    def test_a_departure_after_the_horizon_is_rejected_without_a_request(self) -> None:
        departure = last_forecast_hour(NOW) + timedelta(hours=1)
        session = FakeSession(calm_forecast)

        with pytest.raises(ForecastRangeError, match="Forecasts only reach"):
            build_heatmap(
                [LINE], departure, 20_000, client=OpenMeteoClient(session=session), now=NOW
            )

        assert session.requests == []

    def test_a_departure_in_the_past_is_rejected_without_a_request(self) -> None:
        session = FakeSession(calm_forecast)

        with pytest.raises(ForecastRangeError, match="not in the past"):
            build_heatmap(
                [LINE],
                datetime(2026, 11, 2, 23, 0, tzinfo=UTC),
                20_000,
                client=OpenMeteoClient(session=session),
                now=NOW,
            )

        assert session.requests == []

    def test_logs_the_timing_of_each_stage(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="routing"):
            build()

        messages = [record.getMessage() for record in caplog.records]
        for stage in ("grid", "weather", "risk"):
            assert any(m.startswith(f"heatmap stage={stage} ms=") for m in messages)
