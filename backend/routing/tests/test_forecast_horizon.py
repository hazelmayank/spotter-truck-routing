from datetime import UTC, datetime, timedelta, timezone

import pytest

from routing.services.weather import last_forecast_hour


def test_last_forecast_hour_is_the_hour_before_sixteen_days_after_the_start_of_today() -> None:
    now = datetime(2026, 11, 3, 12, 30, tzinfo=UTC)

    assert last_forecast_hour(now) == datetime(2026, 11, 18, 23, 0, tzinfo=UTC)


def test_last_forecast_hour_does_not_depend_on_the_time_of_day() -> None:
    midnight = datetime(2026, 11, 3, 0, 0, tzinfo=UTC)
    almost_next_day = datetime(2026, 11, 3, 23, 59, tzinfo=UTC)

    assert last_forecast_hour(midnight) == last_forecast_hour(almost_next_day)


def test_last_forecast_hour_uses_the_utc_date_whatever_the_timezone_of_now() -> None:
    # 02:00 on Nov 3 in UTC+5:30 is still Nov 2 in UTC.
    now = datetime(2026, 11, 3, 2, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))

    assert last_forecast_hour(now) == datetime(2026, 11, 17, 23, 0, tzinfo=UTC)


@pytest.mark.parametrize("hours_after", [0, 1])
def test_the_next_day_moves_the_horizon_by_a_day(hours_after: int) -> None:
    today = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)
    tomorrow = today + timedelta(days=1, hours=hours_after)

    assert last_forecast_hour(tomorrow) - last_forecast_hour(today) == timedelta(days=1)
