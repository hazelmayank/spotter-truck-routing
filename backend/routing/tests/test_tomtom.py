from typing import Any

import pytest
import requests

from routing.services.tomtom import TomTomClient, TomTomError


class FakeResponse:
    def __init__(self, status_code: int = 200, body: dict[str, Any] | None = None) -> None:
        self.status_code = status_code
        self.ok = status_code < 400
        self.reason = "Bad Request"
        self._body = body if body is not None else {}

    def json(self) -> dict[str, Any]:
        return self._body


class FakeSession:
    def __init__(self, response: FakeResponse | Exception) -> None:
        self._response = response
        self.requests: list[dict[str, Any]] = []

    def get(self, url: str, params: dict[str, Any], timeout: float) -> FakeResponse:
        self.requests.append({"url": url, "params": params, "timeout": timeout})
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def test_get_json_sends_key_and_params_with_a_15_second_timeout() -> None:
    session = FakeSession(FakeResponse(body={"ok": True}))
    client = TomTomClient(api_key="secret", session=session)

    body = client.get_json("routing/1/calculateRoute/1,2:3,4/json", {"travelMode": "truck"})

    assert body == {"ok": True}
    assert session.requests == [
        {
            "url": "https://api.tomtom.com/routing/1/calculateRoute/1,2:3,4/json",
            "params": {"travelMode": "truck", "key": "secret"},
            "timeout": 15,
        }
    ]


def test_default_key_comes_from_settings(settings) -> None:
    settings.TOMTOM_API_KEY = "from-settings"
    session = FakeSession(FakeResponse())

    TomTomClient(session=session).get_json("path", {})

    assert session.requests[0]["params"]["key"] == "from-settings"


def test_missing_api_key_is_an_error(settings) -> None:
    settings.TOMTOM_API_KEY = ""

    with pytest.raises(TomTomError, match="TOMTOM_API_KEY"):
        TomTomClient()


def test_http_error_includes_status_and_tomtom_message() -> None:
    body = {"detailedError": {"code": "BAD_REQUEST", "message": "Cannot find a route"}}
    client = TomTomClient(api_key="secret", session=FakeSession(FakeResponse(400, body)))

    with pytest.raises(TomTomError, match="400.*Cannot find a route"):
        client.get_json("path", {})


def test_http_error_without_a_tomtom_message_uses_the_reason() -> None:
    client = TomTomClient(api_key="secret", session=FakeSession(FakeResponse(403)))

    with pytest.raises(TomTomError, match="403.*Bad Request"):
        client.get_json("path", {})


def test_network_error_does_not_leak_the_api_key() -> None:
    failure = requests.ConnectionError("failed: https://api.tomtom.com/x?key=secret")
    client = TomTomClient(api_key="secret", session=FakeSession(failure))

    with pytest.raises(TomTomError) as error:
        client.get_json("path", {})

    assert "secret" not in str(error.value)
    assert "ConnectionError" in str(error.value)
