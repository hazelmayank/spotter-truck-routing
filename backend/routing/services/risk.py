"""Checkpoint weather risk: per-factor classification plus load-based escalation."""

from dataclasses import dataclass, field
from enum import IntEnum


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

# Load rules raise (never lower) the level. Wind in [min, max) with load above the limit.
WIND_NO_TRAVEL_MPH = 55
HEAVY_LOAD_NO_TRAVEL = (45, 55, 30_000, RiskLevel.NO_TRAVEL)  # (wind_min, wind_max, load_gt, level)
HEAVY_LOAD_SEVERE = (35, 45, 40_000, RiskLevel.SEVERE)
LOAD_RULES = (HEAVY_LOAD_NO_TRAVEL, HEAVY_LOAD_SEVERE)

MISSING_DATA_REASON = "missing data"


@dataclass(frozen=True)
class CheckpointRisk:
    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    reasons: list[str] = field(default_factory=list)


def _classify(value: float, bounds: tuple[Bound, ...]) -> RiskLevel:
    # Four bounds cover LOW..SEVERE; zip stops there and anything beyond is NO_TRAVEL.
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
    for wind_min, wind_max, load_gt, rule_level in LOAD_RULES:
        if wind_min <= wind_mph < wind_max and load_lb > load_gt:
            level = max(level, rule_level)
    return level


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

    base_level = max(wind_level, rain_level, snow_level)
    level = apply_load_rules(base_level, wind, load_lb)
    if level > base_level:
        reasons.append(f"wind {wind:g} mph with {load_lb:,.0f} lb load: {level.label} (load rule)")

    return CheckpointRisk(level, wind_level, rain_level, snow_level, reasons)
