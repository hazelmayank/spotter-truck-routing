"""Settings for tests: independent of any local .env and of real credentials."""

import os

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["TOMTOM_API_KEY"] = "test-key"

from .settings import *  # noqa: E402, F403
from .settings import REST_FRAMEWORK  # noqa: E402

# Throttling is switched on only by the tests that check it.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}
