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
