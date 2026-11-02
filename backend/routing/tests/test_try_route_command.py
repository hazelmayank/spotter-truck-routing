from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from routing.management.commands import try_route
from routing.services.geocoding import GeocodingError, Place
from routing.services.routing import RouteOption


def fake_route() -> RouteOption:
    coords = [(32.0, -96.0), (33.0, -97.0), (34.0, -98.0)]
    return RouteOption(
        id="A",
        coords=coords,
        display_coords=[coords[0], coords[-1]],
        distance_miles=725.54,
        duration_s=11 * 3600 + 55 * 60 + 20,
        time_points=[(0, 0), (725.54, 42920)],
    )


def test_try_route_prints_places_and_a_summary_per_route(monkeypatch: pytest.MonkeyPatch) -> None:
    places = {
        "Dallas, TX": Place("Dallas, TX", 32.77, -96.79),
        "Denver, CO": Place("Denver, CO", 39.73, -104.99),
    }
    monkeypatch.setattr(try_route, "geocode", lambda query: places[query])
    monkeypatch.setattr(try_route, "get_routes", lambda *args, **kwargs: [fake_route()])
    out = StringIO()

    call_command("try_route", "Dallas, TX", "Denver, CO", stdout=out)

    lines = out.getvalue().splitlines()
    assert "Dallas, TX (32.7700, -96.7900) -> Denver, CO (39.7300, -104.9900)" in lines
    assert "A: 725.5 mi, 11h 55m, 3 points (2 simplified), 2 time points" in lines


def test_try_route_passes_the_load_to_the_router(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(try_route, "geocode", lambda query: Place(query, 1.0, 2.0))
    calls = []
    monkeypatch.setattr(
        try_route, "get_routes", lambda *args, **kwargs: calls.append(args) or [fake_route()]
    )

    call_command("try_route", "a", "b", "--load-lb", "65000", stdout=StringIO())

    origin, destination, _, load_lb = calls[0]
    assert (origin, destination, load_lb) == ((1.0, 2.0), (1.0, 2.0), 65000)


def test_try_route_reports_lookup_errors_as_command_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_match(query: str) -> Place:
        raise GeocodingError(f"no match for '{query}'")

    monkeypatch.setattr(try_route, "geocode", no_match)

    with pytest.raises(CommandError, match="no match for 'Nowhere'"):
        call_command("try_route", "Nowhere", "Denver, CO", stdout=StringIO())
