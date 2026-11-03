import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def timed_stage(logger: logging.Logger, label: str, stage: str) -> Iterator[None]:
    """Log how long the block took, as `<label> stage=<stage> ms=<n>`."""
    started = time.perf_counter()
    try:
        yield
    finally:
        logger.info("%s stage=%s ms=%.0f", label, stage, (time.perf_counter() - started) * 1000)
