"""Checkpoint weather risk: per-factor classification plus load-based escalation."""

from dataclasses import dataclass
from enum import IntEnum
from typing import NamedTuple


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


# Upper bounds for LOW, MODERATE, HIGH, SEVERE, in that order, as (bound, inclusive).
# A value below a bound (or equal to it, if inclusive) takes that level; past the last
# bound it is NO_TRAVEL.
Bound = tuple[float, bool]

WIND_MPH_BOUNDS: tuple[Bound, ...] = ((25, False), (35, False), (45, False), (55, False))
RAIN_IN_HR_BOUNDS: tuple[Bound, ...] = ((0.10, False), (0.25, False), (0.50, False), (1.00, True))
SNOW_IN_HR_BOUNDS: tuple[Bound, ...] = ((0.5, False), (1.0, False), (2.0, False), (3.0, True))

WIND_NO_TRAVEL_MPH = 55

MISSING_DATA_REASON = "missing data"


class LoadRule(NamedTuple):
    wind_min_mph: float
    wind_max_mph: float
    load_over_lb: float
    level: RiskLevel


LOAD_RULES = (
    LoadRule(wind_min_mph=45, wind_max_mph=55, load_over_lb=30_000, level=RiskLevel.NO_TRAVEL),
    LoadRule(wind_min_mph=35, wind_max_mph=45, load_over_lb=40_000, level=RiskLevel.SEVERE),
)


@dataclass(frozen=True)
class CheckpointRisk:
    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    reasons: list[str]


def _classify(value: float, bounds: tuple[Bound, ...]) -> RiskLevel:
    # There are four bounds for five levels: zip stops after SEVERE, and anything past
    # the last bound is NO_TRAVEL.
    for level, (bound, inclusive) in zip(RiskLevel, bounds, strict=False):
        if value < bound or (inclusive and value == bound):
            return level
    return RiskLevel.NO_TRAVEL


def classify_wind(mph: float) -> RiskLevel:
    return _classify(mph, WIND_MPH_BOUNDS)


def classify_rain(in_per_hr: float) -> RiskLevel:
    return _classify(in_per_hr, RAIN_IN_HR_BOUNDS)


def classify_snow(in_per_hr: float) -> RiskLevel:
    return _classify(in_per_hr, SNOW_IN_HR_BOUNDS)


def apply_load_rules(level: RiskLevel, wind_mph: float, load_lb: float) -> RiskLevel:
    """Return `level` raised by any matching load rule; a rule never lowers it."""
    if wind_mph >= WIND_NO_TRAVEL_MPH:
        return RiskLevel.NO_TRAVEL
    for rule in LOAD_RULES:
        if rule.wind_min_mph <= wind_mph < rule.wind_max_mph and load_lb > rule.load_over_lb:
            level = max(level, rule.level)
    return level


def risk_level(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> RiskLevel:
    """The worst of wind, rain and snow, raised by any load rule."""
    base_level = max(classify_wind(wind_mph), classify_rain(rain_in_hr), classify_snow(snow_in_hr))
    return apply_load_rules(base_level, wind_mph, load_lb)


def assess_checkpoint(
    wind_mph: float | None,
    rain_in_hr: float | None,
    snow_in_hr: float | None,
    load_lb: float,
) -> CheckpointRisk:
    """Combine wind, rain and snow, then apply load rules. Missing values count as 0."""
    reasons: list[str] = []
    if None in (wind_mph, rain_in_hr, snow_in_hr):
        reasons.append(MISSING_DATA_REASON)
    wind = wind_mph or 0.0
    rain = rain_in_hr or 0.0
    snow = snow_in_hr or 0.0

    wind_level = classify_wind(wind)
    rain_level = classify_rain(rain)
    snow_level = classify_snow(snow)

    for name, value, unit, factor_level in (
        ("wind", wind, "mph", wind_level),
        ("rain", rain, "in/hr", rain_level),
        ("snow", snow, "in/hr", snow_level),
    ):
        if factor_level > RiskLevel.LOW:
            reasons.append(f"{name} {value:g} {unit}: {factor_level.label}")

    level = risk_level(wind, rain, snow, load_lb)
    if level > max(wind_level, rain_level, snow_level):
        reasons.append(f"wind {wind:g} mph with {load_lb:,.0f} lb load: {level.label} (load rule)")

    return CheckpointRisk(level, wind_level, rain_level, snow_level, reasons)
