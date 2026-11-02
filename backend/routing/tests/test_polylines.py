import pytest

from routing.services.geo import (
    haversine_miles,
    offset_perpendicular,
    resample,
    sample_miles,
    shared_fraction,
    simplify,
)

from .lines import equator_line


@pytest.mark.parametrize(
    ("total_miles", "step_miles", "expected"),
    [
        (105, 25, [0, 25, 50, 75, 100, 105]),
        (100, 25, [0, 25, 50, 75, 100]),
        (8, 25, [0, 8]),
    ],
)
def test_sample_miles_ends_exactly_at_the_total(
    total_miles: float, step_miles: float, expected: list[float]
) -> None:
    assert sample_miles(total_miles, step_miles) == pytest.approx(expected)


def test_resample_spaces_points_evenly_along_the_line() -> None:
    coords = equator_line(10, points=3)

    points = resample(coords, 1)

    assert len(points) == 11
    assert haversine_miles(points[0], points[1]) == pytest.approx(1, abs=0.001)
    assert points[-1] == coords[-1]


def test_shared_fraction_of_a_line_with_itself_is_one() -> None:
    line = resample(equator_line(20), 0.25)

    assert shared_fraction(line, line, radius_miles=0.5) == 1


def test_shared_fraction_of_distant_lines_is_zero() -> None:
    line = resample(equator_line(20), 0.25)
    far_away = [(lat + 1, lon) for lat, lon in line]

    assert shared_fraction(line, far_away, radius_miles=0.5) == 0


def test_shared_fraction_counts_only_the_overlapping_part() -> None:
    first = resample(equator_line(20), 0.25)
    second = resample(equator_line(10), 0.25)

    assert shared_fraction(first, second, radius_miles=0.5) == pytest.approx(0.5, abs=0.05)


def test_shared_fraction_respects_the_radius() -> None:
    line = resample(equator_line(20), 0.25)
    offset_one_mile = [(1 / 69.09, lon) for _, lon in line]

    assert shared_fraction(line, offset_one_mile, radius_miles=0.5) == 0
    assert shared_fraction(line, offset_one_mile, radius_miles=1.5) == 1


@pytest.mark.parametrize(
    ("side", "expected_lat_sign"),
    [(1, 1), (-1, -1)],
)
def test_offset_perpendicular_goes_left_of_travel_for_positive_miles(
    side: int, expected_lat_sign: int
) -> None:
    # Travelling east, left is north.
    origin, destination, midpoint = (0.0, 0.0), (0.0, 1.0), (0.0, 0.5)

    lat, lon = offset_perpendicular(midpoint, origin, destination, side * 10)

    assert lat * expected_lat_sign > 0
    assert lon == pytest.approx(0.5)
    assert haversine_miles(midpoint, (lat, lon)) == pytest.approx(10, abs=0.05)


def test_offset_perpendicular_travelling_north_left_is_west() -> None:
    lat, lon = offset_perpendicular((0.5, 0.0), (0.0, 0.0), (1.0, 0.0), 10)

    assert lat == pytest.approx(0.5)
    assert lon < 0


def test_offset_perpendicular_is_still_perpendicular_at_high_latitude() -> None:
    origin, destination = (60.0, -100.0), (60.0, -99.0)
    midpoint = (60.0, -99.5)

    lat, lon = offset_perpendicular(midpoint, origin, destination, 10)

    assert haversine_miles(midpoint, (lat, lon)) == pytest.approx(10, abs=0.1)
    assert lon == pytest.approx(-99.5, abs=1e-6)


def test_simplify_drops_points_within_tolerance() -> None:
    coords = [(0.0, 0.0), (0.0001, 0.5), (-0.0001, 1.0), (0.0, 1.5), (0.0, 2.0)]

    assert simplify(coords, 0.0005) == [(0.0, 0.0), (0.0, 2.0)]


def test_simplify_keeps_the_corner_of_a_bend() -> None:
    coords = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0), (1.0, 2.0), (2.0, 2.0)]

    assert simplify(coords, 0.0005) == [(0.0, 0.0), (0.0, 2.0), (2.0, 2.0)]


def test_simplify_keeps_endpoints_and_short_lines_unchanged() -> None:
    assert simplify([(1.0, 1.0)], 0.0005) == [(1.0, 1.0)]
    assert simplify([(1.0, 1.0), (2.0, 2.0)], 0.0005) == [(1.0, 1.0), (2.0, 2.0)]


def test_simplify_handles_a_closed_line() -> None:
    coords = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (0.0, 0.0)]

    assert simplify(coords, 0.0005) == coords
