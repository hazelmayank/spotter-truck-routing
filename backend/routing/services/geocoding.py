from dataclasses import dataclass
from urllib.parse import quote

from .tomtom import TomTomClient

COUNTRY_SET = "US,CA"
SUGGESTION_LIMIT = 5


class GeocodingError(Exception):
    pass


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float


def geocode(query: str, client: TomTomClient | None = None) -> Place:
    if not query.strip():
        raise GeocodingError("query is empty")
    places = _search(client or TomTomClient(), query, limit=1, params={})
    if not places:
        raise GeocodingError(f"no match for '{query}'")
    return places[0]


def suggest(query: str, client: TomTomClient | None = None) -> list[Place]:
    """Up to five autocomplete matches; a blank query has none."""
    if not query.strip():
        return []
    return _search(client or TomTomClient(), query, SUGGESTION_LIMIT, {"typeahead": "true"})


def _search(client: TomTomClient, query: str, limit: int, params: dict[str, str]) -> list[Place]:
    path = f"search/2/search/{quote(query, safe='')}.json"
    body = client.get_json(path, {"limit": limit, "countrySet": COUNTRY_SET, **params})
    return [
        Place(
            label=match["address"]["freeformAddress"],
            lat=match["position"]["lat"],
            lon=match["position"]["lon"],
        )
        for match in body["results"]
    ]
