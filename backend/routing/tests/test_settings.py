import importlib
import sys
from collections.abc import Callable
from types import ModuleType

import pytest

SETTINGS_ENV = (
    "SECRET_KEY",
    "DEBUG",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "TOMTOM_API_KEY",
    "RENDER_EXTERNAL_HOSTNAME",
)


@pytest.fixture
def load_settings(monkeypatch: pytest.MonkeyPatch) -> Callable[..., ModuleType]:
    """Import config.settings afresh with exactly the given environment variables."""
    # A developer's local .env must not leak into these tests.
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: False)

    def load(**env: str) -> ModuleType:
        for name in SETTINGS_ENV:
            monkeypatch.delenv(name, raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        sys.modules.pop("config.settings", None)
        return importlib.import_module("config.settings")

    return load


PRODUCTION = {
    "SECRET_KEY": "a-long-random-secret",
    "ALLOWED_HOSTS": "api.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
}


class TestDebugAndSecretKey:
    def test_debug_is_off_unless_asked_for(self, load_settings) -> None:
        assert load_settings(**PRODUCTION).DEBUG is False

    @pytest.mark.parametrize("value", ["true", "True", "1", "yes"])
    def test_debug_can_be_switched_on(self, load_settings, value: str) -> None:
        assert load_settings(DEBUG=value).DEBUG is True

    @pytest.mark.parametrize("value", ["false", "0", "no", ""])
    def test_other_values_leave_debug_off(self, load_settings, value: str) -> None:
        assert load_settings(**PRODUCTION, DEBUG=value).DEBUG is False

    def test_production_refuses_to_start_without_a_secret_key(self, load_settings) -> None:
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            load_settings(DEBUG="false")

    def test_production_uses_the_secret_key_it_is_given(self, load_settings) -> None:
        assert load_settings(**PRODUCTION).SECRET_KEY == "a-long-random-secret"

    def test_debug_falls_back_to_a_development_key(self, load_settings) -> None:
        settings = load_settings(DEBUG="true")

        assert settings.SECRET_KEY == "insecure-dev-key"


class TestAllowedHosts:
    def test_come_from_the_environment(self, load_settings) -> None:
        settings = load_settings(**PRODUCTION | {"ALLOWED_HOSTS": "a.example.com, b.example.com"})

        assert settings.ALLOWED_HOSTS == ["a.example.com", "b.example.com"]

    def test_never_allow_every_host(self, load_settings) -> None:
        assert "*" not in load_settings(**PRODUCTION).ALLOWED_HOSTS

    def test_include_the_hostname_render_assigns(self, load_settings) -> None:
        settings = load_settings(**PRODUCTION, RENDER_EXTERNAL_HOSTNAME="svc-1234.onrender.com")

        assert settings.ALLOWED_HOSTS == ["api.example.com", "svc-1234.onrender.com"]

    def test_are_unchanged_outside_render(self, load_settings) -> None:
        assert load_settings(**PRODUCTION).ALLOWED_HOSTS == ["api.example.com"]


class TestCors:
    def test_allow_only_the_listed_origins(self, load_settings) -> None:
        settings = load_settings(
            **PRODUCTION | {"CORS_ALLOWED_ORIGINS": "https://a.example.com, https://b.example.com,"}
        )

        assert settings.CORS_ALLOWED_ORIGINS == ["https://a.example.com", "https://b.example.com"]

    def test_have_no_default_in_production(self, load_settings) -> None:
        env = {name: value for name, value in PRODUCTION.items() if name != "CORS_ALLOWED_ORIGINS"}

        assert load_settings(**env).CORS_ALLOWED_ORIGINS == []

    def test_default_to_the_vite_dev_server_when_debugging(self, load_settings) -> None:
        assert load_settings(DEBUG="true").CORS_ALLOWED_ORIGINS == ["http://localhost:5173"]

    def test_do_not_allow_every_origin_or_credentials(self, load_settings) -> None:
        settings = load_settings(**PRODUCTION)

        assert not getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False)
        assert not getattr(settings, "CORS_ALLOW_CREDENTIALS", False)


class TestMiddleware:
    def test_compress_responses_outermost(self, load_settings) -> None:
        assert load_settings(**PRODUCTION).MIDDLEWARE[0] == "django.middleware.gzip.GZipMiddleware"

    def test_answer_cors_before_anything_that_could_reject_the_request(self, load_settings) -> None:
        middleware = load_settings(**PRODUCTION).MIDDLEWARE

        cors = middleware.index("corsheaders.middleware.CorsMiddleware")
        assert cors < middleware.index("django.middleware.common.CommonMiddleware")

    def test_serve_static_files_through_whitenoise(self, load_settings) -> None:
        settings = load_settings(**PRODUCTION)

        assert "whitenoise.middleware.WhiteNoiseMiddleware" in settings.MIDDLEWARE
        assert settings.STATIC_ROOT.name == "staticfiles"


class TestKeys:
    def test_tomtom_key_comes_from_the_environment(self, load_settings) -> None:
        assert load_settings(**PRODUCTION, TOMTOM_API_KEY="from-env").TOMTOM_API_KEY == "from-env"

    def test_tomtom_key_is_empty_when_not_set(self, load_settings) -> None:
        assert load_settings(**PRODUCTION).TOMTOM_API_KEY == ""
