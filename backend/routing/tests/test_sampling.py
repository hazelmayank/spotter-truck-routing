from datetime import UTC, datetime, timedelta
from math import radians

import pytest

from routing.services.geo import EARTH_RADIUS_MILES, cumulative_distances
from routing.services.sampling import build_checkpoints

MILES_PER_DEGREE = EARTH_RADIUS_MILES * radians(1)  # one degree on a great circle
DEPARTURE = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)


def equator_line(miles: float, points: int = 21) -> list[tuple[float, float]]:
    degrees = miles / MILES_PER_DEGREE
    return [(0.0, degrees * i / (points - 1)) for i in range(points)]


def elapsed_seconds(checkpoint) -> float:
    return (checkpoint.eta_utc - DEPARTURE).total_seconds()


def uniform_time_points(miles: float, seconds: float) -> list[tuple[float, float]]:
    return [(0, 0), (miles, seconds)]


@pytest.mark.parametrize(
    ("interval", "expected_miles"),
    [
        (10, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 105]),
        (25, [0, 25, 50, 75, 100, 105]),
        (50, [0, 50, 100, 105]),
    ],
)
def test_checkpoint_miles_for_each_interval(interval: int, expected_miles: list[float]) -> None:
    coords = equator_line(105)

    checkpoints = build_checkpoints(coords, interval, DEPARTURE, uniform_time_points(105, 6300))

    assert [c.mile for c in checkpoints] == pytest.approx(expected_miles, abs=0.01)


def test_first_checkpoint_is_the_origin() -> None:
    coords = equator_line(105)

    first = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(105, 6300))[0]

    assert first.mile == 0
    assert (first.lat, first.lon) == coords[0]
    assert first.segment_miles == 0
    assert first.eta_utc == DEPARTURE


def test_last_checkpoint_is_the_destination() -> None:
    coords = equator_line(105)
    total = cumulative_distances(coords)[-1]

    last = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(105, 6300))[-1]

    assert last.mile == pytest.approx(total)
    assert (last.lat, last.lon) == pytest.approx(coords[-1])
    assert last.segment_miles == pytest.approx(5, abs=0.01)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_segment_miles_sum_to_route_length(interval: int) -> None:
    coords = equator_line(333.3)
    total = cumulative_distances(coords)[-1]

    checkpoints = build_checkpoints(coords, interval, DEPARTURE, uniform_time_points(333.3, 20000))

    assert sum(c.segment_miles for c in checkpoints) == pytest.approx(total, abs=0.1)


def test_each_segment_is_distance_since_previous_checkpoint() -> None:
    coords = equator_line(105)

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(105, 6300))

    for previous, current in zip(checkpoints, checkpoints[1:], strict=False):
        assert current.segment_miles == pytest.approx(current.mile - previous.mile)


def test_route_that_is_an_exact_multiple_has_no_duplicate_destination() -> None:
    coords = equator_line(100)

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(100, 6000))

    assert [round(c.mile) for c in checkpoints] == [0, 25, 50, 75, 100]


def test_route_shorter_than_interval_has_origin_and_destination() -> None:
    coords = equator_line(8)

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(8, 600))

    assert len(checkpoints) == 2
    assert checkpoints[0].mile == 0
    assert checkpoints[1].mile == pytest.approx(8, abs=0.01)
    assert checkpoints[1].segment_miles == pytest.approx(8, abs=0.01)
    assert elapsed_seconds(checkpoints[1]) == pytest.approx(600)


def test_eta_interpolates_between_uneven_time_points() -> None:
    # First 50 miles take an hour (50 mph); the last 50 take only 10 minutes (300 mph).
    coords = equator_line(100)
    time_points = [(0, 0), (50, 3600), (100, 4200)]

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, time_points)

    assert [elapsed_seconds(c) for c in checkpoints] == pytest.approx(
        [0, 1800, 3600, 3900, 4200], abs=0.5
    )


def test_eta_uses_every_surrounding_time_point_pair() -> None:
    coords = equator_line(100)
    time_points = [(0, 0), (10, 600), (20, 700), (100, 5000)]

    checkpoints = build_checkpoints(coords, 10, DEPARTURE, time_points)

    by_mile = {round(c.mile): elapsed_seconds(c) for c in checkpoints}
    assert by_mile[10] == pytest.approx(600, abs=0.5)
    assert by_mile[20] == pytest.approx(700, abs=0.5)
    assert by_mile[60] == pytest.approx(700 + 40 / 80 * 4300, abs=0.5)


def test_eta_is_timezone_aware_utc() -> None:
    coords = equator_line(100)

    last = build_checkpoints(coords, 25, DEPARTURE, uniform_time_points(100, 3600))[-1]

    assert last.eta_utc.utcoffset() == timedelta(0)
    assert last.eta_utc == DEPARTURE + timedelta(hours=1)


def test_destination_eta_matches_total_duration_when_lengths_differ_slightly() -> None:
    # The routing service reports 100.4 mi; the polyline measures 100 mi.
    coords = equator_line(100)
    time_points = [(0, 0), (50.2, 1800), (100.4, 3600)]

    last = build_checkpoints(coords, 25, DEPARTURE, time_points)[-1]

    assert elapsed_seconds(last) == pytest.approx(3600)


def test_missing_time_points_fall_back_to_proportional_duration() -> None:
    coords = equator_line(100)

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, [], total_seconds=7200)

    assert [elapsed_seconds(c) for c in checkpoints] == pytest.approx(
        [0, 1800, 3600, 5400, 7200], abs=0.5
    )


def test_missing_time_points_and_total_seconds_is_an_error() -> None:
    with pytest.raises(ValueError, match="time_points"):
        build_checkpoints(equator_line(100), 25, DEPARTURE, [])


def test_duplicate_offsets_in_time_points_do_not_break_interpolation() -> None:
    coords = equator_line(100)
    time_points = [(0, 0), (50, 3000), (50, 3000), (100, 6000)]

    checkpoints = build_checkpoints(coords, 25, DEPARTURE, time_points)

    assert [elapsed_seconds(c) for c in checkpoints] == pytest.approx(
        [0, 1500, 3000, 4500, 6000], abs=0.5
    )


def test_unsorted_time_points_are_handled() -> None:
    coords = equator_line(100)
    time_points = [(100, 4200), (0, 0), (50, 3600)]

    checkpoints = build_checkpoints(coords, 50, DEPARTURE, time_points)

    assert [elapsed_seconds(c) for c in checkpoints] == pytest.approx([0, 3600, 4200], abs=0.5)


def test_naive_departure_is_rejected() -> None:
    with pytest.raises(ValueError, match="timezone"):
        build_checkpoints(equator_line(100), 25, datetime(2026, 11, 3, 8, 0), [(0, 0), (100, 1)])


@pytest.mark.parametrize("interval", [0, -5])
def test_non_positive_interval_is_rejected(interval: int) -> None:
    with pytest.raises(ValueError, match="interval"):
        build_checkpoints(equator_line(100), interval, DEPARTURE, [(0, 0), (100, 1)])


def test_fewer_than_two_coordinates_is_rejected() -> None:
    with pytest.raises(ValueError, match="coordinates"):
        build_checkpoints([(0.0, 0.0)], 25, DEPARTURE, [(0, 0), (1, 1)])
