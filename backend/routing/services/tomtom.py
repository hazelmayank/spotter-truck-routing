from typing import Any

import requests
from django.conf import settings

BASE_URL = "https://api.tomtom.com"
TIMEOUT_S = 15


class TomTomError(Exception):
    pass


class TomTomClient:
    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self._api_key = api_key or settings.TOMTOM_API_KEY
        if not self._api_key:
            raise TomTomError("TOMTOM_API_KEY is not set")
        self._session = session or requests.Session()

    def get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._session.get(
                f"{BASE_URL}/{path}", params={**params, "key": self._api_key}, timeout=TIMEOUT_S
            )
        except requests.RequestException as exc:
            # The exception text contains the request URL, and with it the API key.
            raise TomTomError(f"TomTom request failed: {type(exc).__name__}") from None
        if not response.ok:
            raise TomTomError(
                f"TomTom returned HTTP {response.status_code}: {_error_message(response)}"
            )
        return response.json()


def _error_message(response: requests.Response) -> str:
    try:
        return response.json()["detailedError"]["message"]
    except (ValueError, KeyError, TypeError):
        return response.reason
