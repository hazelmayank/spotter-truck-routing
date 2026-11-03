import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

MS_PER_S = 1000


@contextmanager
def timed_stage(logger: logging.Logger, label: str, stage: str) -> Iterator[None]:
    """Log how long the block took, as `<label> stage=<stage> ms=<n>`."""
    started = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - started) * MS_PER_S
        logger.info("%s stage=%s ms=%.0f", label, stage, elapsed_ms)
