import pytest
from django.test import Client

ALLOWED_ORIGIN = "http://localhost:5173"  # the test settings run in DEBUG mode


def preflight(origin: str):
    return Client().options(
        "/api/plan",
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type",
    )


def test_the_frontend_origin_may_call_the_api() -> None:
    response = preflight(ALLOWED_ORIGIN)

    assert response["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert "POST" in response["Access-Control-Allow-Methods"]
    assert "content-type" in response["Access-Control-Allow-Headers"]


@pytest.mark.parametrize(
    "origin",
    ["https://evil.example.com", "http://localhost:5174", "http://localhost:5173.evil.com"],
)
def test_other_origins_get_no_cors_headers(origin: str) -> None:
    assert "Access-Control-Allow-Origin" not in preflight(origin)


def test_a_simple_request_from_another_origin_gets_no_cors_header() -> None:
    response = Client().get("/api/health", HTTP_ORIGIN="https://evil.example.com")

    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response


def test_responses_do_not_allow_credentials() -> None:
    response = Client().get("/api/health", HTTP_ORIGIN=ALLOWED_ORIGIN)

    assert response["Access-Control-Allow-Origin"] == ALLOWED_ORIGIN
    assert "Access-Control-Allow-Credentials" not in response
