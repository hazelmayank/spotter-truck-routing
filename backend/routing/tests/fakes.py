from collections.abc import Callable
from typing import Any


class FakeTomTomClient:
    """Stands in for TomTomClient: replays queued responses and records the calls."""

    def __init__(self, *responses: dict[str, Any] | Exception) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((path, params))
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeResponse:
    def __init__(self, status_code: int = 200, body: Any = None) -> None:
        self.status_code = status_code
        self.ok = status_code < 400
        self.reason = "Bad Request"
        self._body = body if body is not None else {}

    def json(self) -> Any:
        return self._body


class FakeSession:
    """Stands in for requests.Session.

    `answer` is a response or exception returned for every call, or a function of the
    query params that returns one (a plain body is wrapped in a 200 response).
    """

    def __init__(self, answer: FakeResponse | Exception | Callable[[dict[str, Any]], Any]) -> None:
        self._answer = answer
        self.requests: list[dict[str, Any]] = []

    def get(self, url: str, params: dict[str, Any], timeout: float) -> FakeResponse:
        self.requests.append({"url": url, "params": params, "timeout": timeout})
        answer = self._answer(params) if callable(self._answer) else self._answer
        if isinstance(answer, Exception):
            raise answer
        return answer if isinstance(answer, FakeResponse) else FakeResponse(200, answer)
