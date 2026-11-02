import pytest

from routing.services.geo import cumulative_distances, haversine_miles, interpolate_point

from .lines import MILES_PER_DEGREE, equator_line


def test_haversine_one_degree_of_equator() -> None:
    assert haversine_miles((0, 0), (0, 1)) == pytest.approx(69.0934, rel=1e-4)


def test_haversine_one_degree_of_latitude_matches_longitude_at_equator() -> None:
    assert haversine_miles((0, 0), (1, 0)) == pytest.approx(69.0934, rel=1e-4)


def test_haversine_same_point_is_zero() -> None:
    assert haversine_miles((40.7, -74.0), (40.7, -74.0)) == 0


def test_haversine_is_symmetric() -> None:
    a, b = (40.7128, -74.0060), (34.0522, -118.2437)

    assert haversine_miles(a, b) == pytest.approx(haversine_miles(b, a))


def test_haversine_known_city_pair() -> None:
    # New York to Los Angeles is about 2,445 miles great-circle.
    distance = haversine_miles((40.7128, -74.0060), (34.0522, -118.2437))

    assert distance == pytest.approx(2445, abs=10)


def test_cumulative_distances_straight_line() -> None:
    coords = equator_line(100, points=5)

    cum = cumulative_distances(coords)

    assert len(cum) == len(coords)
    assert cum[0] == 0
    assert cum == pytest.approx([0, 25, 50, 75, 100], abs=0.01)


def test_cumulative_distances_is_non_decreasing_with_repeated_points() -> None:
    coords = [(0.0, 0.0), (0.0, 0.0), (0.0, 0.1)]

    cum = cumulative_distances(coords)

    assert cum[0] == cum[1] == 0
    assert cum[2] > 0


def test_cumulative_distances_single_point() -> None:
    assert cumulative_distances([(1.0, 2.0)]) == [0]


def test_interpolate_point_at_vertices() -> None:
    coords = equator_line(100)
    cum = cumulative_distances(coords)

    assert interpolate_point(coords, cum, 0) == coords[0]
    assert interpolate_point(coords, cum, cum[-1]) == coords[-1]
    assert interpolate_point(coords, cum, cum[2]) == pytest.approx(coords[2])


@pytest.mark.parametrize("target_miles", [10, 37.5, 62, 99.9])
def test_interpolate_point_between_vertices(target_miles: float) -> None:
    coords = equator_line(100)
    cum = cumulative_distances(coords)

    lat, lon = interpolate_point(coords, cum, target_miles)

    assert lat == 0
    assert lon * MILES_PER_DEGREE == pytest.approx(target_miles, abs=0.01)


def test_interpolate_point_on_a_bend() -> None:
    # Two perpendicular legs of equal length: the midpoint of the path is the corner.
    corner_degrees = 1.0
    coords = [(0.0, 0.0), (0.0, corner_degrees), (corner_degrees, corner_degrees)]
    cum = cumulative_distances(coords)

    lat, lon = interpolate_point(coords, cum, cum[1])

    assert (lat, lon) == pytest.approx((0.0, corner_degrees))


def test_interpolate_point_clamps_outside_the_line() -> None:
    coords = equator_line(100)
    cum = cumulative_distances(coords)

    assert interpolate_point(coords, cum, -5) == coords[0]
    assert interpolate_point(coords, cum, 500) == coords[-1]


def test_interpolate_point_with_zero_length_segment() -> None:
    coords = [(0.0, 0.0), (0.0, 0.0), (0.0, 1.0)]
    cum = cumulative_distances(coords)

    lat, lon = interpolate_point(coords, cum, cum[-1] / 2)

    assert lat == 0
    assert lon == pytest.approx(0.5)
