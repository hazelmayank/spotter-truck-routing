from typing import Any

import pytest

from routing.services.geocoding import GeocodingError, Place, geocode, suggest

from .fakes import FakeTomTomClient


def search_result(label: str, lat: float, lon: float) -> dict[str, Any]:
    return {
        "type": "Geo",
        "id": "US/GEO/p0/1",
        "score": 4.2,
        "address": {"countryCode": "US", "freeformAddress": label},
        "position": {"lat": lat, "lon": lon},
    }


def search_response(*results: dict[str, Any]) -> dict[str, Any]:
    return {"summary": {"query": "q", "numResults": len(results)}, "results": list(results)}


def test_geocode_returns_the_first_match() -> None:
    client = FakeTomTomClient(search_response(search_result("Dallas, TX", 32.7767, -96.797)))

    place = geocode("Dallas, TX", client=client)

    assert place == Place(label="Dallas, TX", lat=32.7767, lon=-96.797)


def test_geocode_asks_for_one_us_or_canadian_match() -> None:
    client = FakeTomTomClient(search_response(search_result("Dallas, TX", 32.7767, -96.797)))

    geocode("Dallas, TX", client=client)

    path, params = client.calls[0]
    assert path == "search/2/search/Dallas%2C%20TX.json"
    assert params == {"limit": 1, "countrySet": "US,CA"}


def test_geocode_without_a_match_raises_a_clear_error() -> None:
    client = FakeTomTomClient(search_response())

    with pytest.raises(GeocodingError, match="no match for 'Nowhereville'"):
        geocode("Nowhereville", client=client)


@pytest.mark.parametrize("query", ["", "   "])
def test_geocode_rejects_an_empty_query_without_calling_the_api(query: str) -> None:
    client = FakeTomTomClient()

    with pytest.raises(GeocodingError, match="empty"):
        geocode(query, client=client)

    assert client.calls == []


def test_suggest_returns_each_result_as_a_place() -> None:
    client = FakeTomTomClient(
        search_response(
            search_result("Denver, CO", 39.7392, -104.9903),
            search_result("Denver, NC", 35.5, -81.0),
        )
    )

    places = suggest("Denv", client=client)

    assert places == [
        Place("Denver, CO", 39.7392, -104.9903),
        Place("Denver, NC", 35.5, -81.0),
    ]


def test_suggest_requests_at_most_five_typeahead_results() -> None:
    client = FakeTomTomClient(search_response())

    suggest("Denv", client=client)

    _, params = client.calls[0]
    assert params == {"limit": 5, "countrySet": "US,CA", "typeahead": "true"}


def test_suggest_with_no_matches_is_an_empty_list() -> None:
    assert suggest("zzzz", client=FakeTomTomClient(search_response())) == []


@pytest.mark.parametrize("query", ["", "  "])
def test_suggest_with_a_blank_query_skips_the_api(query: str) -> None:
    client = FakeTomTomClient()

    assert suggest(query, client=client) == []
    assert client.calls == []
