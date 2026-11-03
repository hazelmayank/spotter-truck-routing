import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle

from routing.api import views

RATE = 2


@pytest.fixture(autouse=True)
def throttle_on(monkeypatch: pytest.MonkeyPatch) -> None:
    cache.clear()
    monkeypatch.setattr(AnonRateThrottle, "THROTTLE_RATES", {"anon": f"{RATE}/min"})
    for view in (views.plan, views.heatmap):
        monkeypatch.setattr(view.cls, "throttle_classes", [AnonRateThrottle])


def post_plan(client_address: str) -> int:
    response = APIClient().post("/api/plan", {}, format="json", HTTP_X_FORWARDED_FOR=client_address)
    return response.status_code


def test_requests_over_the_rate_are_refused_with_429() -> None:
    statuses = [post_plan("203.0.113.1") for _ in range(RATE + 1)]

    assert statuses == [400] * RATE + [429]


def test_each_client_address_has_its_own_allowance() -> None:
    for _ in range(RATE):
        post_plan("203.0.113.1")

    assert post_plan("203.0.113.2") == 400


def test_plan_and_heatmap_share_one_allowance() -> None:
    client = APIClient()
    headers = {"HTTP_X_FORWARDED_FOR": "203.0.113.3"}
    client.post("/api/plan", {}, format="json", **headers)
    client.post("/api/heatmap", {}, format="json", **headers)

    assert client.post("/api/plan", {}, format="json", **headers).status_code == 429


def test_health_is_never_throttled() -> None:
    statuses = {APIClient().get("/api/health").status_code for _ in range(RATE * 3)}

    assert statuses == {200}
