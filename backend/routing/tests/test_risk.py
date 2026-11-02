import pytest

from routing.services.risk import (
    RiskLevel,
    apply_load_rules,
    assess_checkpoint,
    classify_rain,
    classify_snow,
    classify_wind,
)

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = RiskLevel


def test_risk_level_values() -> None:
    assert [level.value for level in RiskLevel] == [0, 1, 2, 3, 4]
    assert sorted(RiskLevel) == [LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL]


@pytest.mark.parametrize(
    ("wind_mph", "expected"),
    [
        (0, LOW),
        (24.9, LOW),
        (25, MODERATE),
        (34.9, MODERATE),
        (35, HIGH),
        (44.9, HIGH),
        (45, SEVERE),
        (54.9, SEVERE),
        (55, NO_TRAVEL),
        (90, NO_TRAVEL),
    ],
)
def test_classify_wind(wind_mph: float, expected: RiskLevel) -> None:
    assert classify_wind(wind_mph) == expected


@pytest.mark.parametrize(
    ("rain_in_hr", "expected"),
    [
        (0, LOW),
        (0.099, LOW),
        (0.10, MODERATE),
        (0.249, MODERATE),
        (0.25, HIGH),
        (0.499, HIGH),
        (0.50, SEVERE),
        (1.00, SEVERE),
        (1.01, NO_TRAVEL),
    ],
)
def test_classify_rain(rain_in_hr: float, expected: RiskLevel) -> None:
    assert classify_rain(rain_in_hr) == expected


@pytest.mark.parametrize(
    ("snow_in_hr", "expected"),
    [
        (0, LOW),
        (0.49, LOW),
        (0.5, MODERATE),
        (0.99, MODERATE),
        (1.0, HIGH),
        (1.99, HIGH),
        (2.0, SEVERE),
        (3.0, SEVERE),
        (3.01, NO_TRAVEL),
    ],
)
def test_classify_snow(snow_in_hr: float, expected: RiskLevel) -> None:
    assert classify_snow(snow_in_hr) == expected


@pytest.mark.parametrize(
    ("wind_mph", "load_lb", "expected"),
    [
        (55, 1000, NO_TRAVEL),
        (50, 30000, SEVERE),
        (50, 30001, NO_TRAVEL),
        (45, 30001, NO_TRAVEL),
        (44.9, 30001, HIGH),
        (40, 40000, HIGH),
        (40, 40001, SEVERE),
        (35, 40001, SEVERE),
        (34.9, 80000, MODERATE),
        (30, 80000, MODERATE),
    ],
)
def test_load_rules_raise_wind_level_by_weight(
    wind_mph: float, load_lb: float, expected: RiskLevel
) -> None:
    base = classify_wind(wind_mph)

    assert apply_load_rules(base, wind_mph, load_lb) == expected


@pytest.mark.parametrize("level", list(RiskLevel))
@pytest.mark.parametrize("wind_mph", [0, 30, 40, 50, 60])
@pytest.mark.parametrize("load_lb", [0, 30000, 40001, 100000])
def test_load_rules_never_lower_a_level(level: RiskLevel, wind_mph: float, load_lb: float) -> None:
    assert apply_load_rules(level, wind_mph, load_lb) >= level


def test_heavy_load_in_40_mph_wind_raises_a_moderate_level_to_severe() -> None:
    assert apply_load_rules(MODERATE, 40, 50000) == SEVERE


def test_assess_checkpoint_all_clear() -> None:
    result = assess_checkpoint(wind_mph=10, rain_in_hr=0, snow_in_hr=0, load_lb=20000)

    assert result.level == LOW
    assert (result.wind_level, result.rain_level, result.snow_level) == (LOW, LOW, LOW)
    assert result.reasons == []


def test_assess_checkpoint_rain_is_worst_factor() -> None:
    result = assess_checkpoint(wind_mph=30, rain_in_hr=0.6, snow_in_hr=0.5, load_lb=20000)

    assert result.wind_level == MODERATE
    assert result.rain_level == SEVERE
    assert result.snow_level == MODERATE
    assert result.level == SEVERE
    assert "rain 0.6 in/hr: Severe" in result.reasons


def test_assess_checkpoint_snow_is_worst_factor() -> None:
    result = assess_checkpoint(wind_mph=5, rain_in_hr=0.1, snow_in_hr=3.5, load_lb=0)

    assert result.level == NO_TRAVEL
    assert result.snow_level == NO_TRAVEL


def test_assess_checkpoint_load_rule_raises_and_explains() -> None:
    result = assess_checkpoint(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=35000)

    assert result.wind_level == SEVERE
    assert result.level == NO_TRAVEL
    assert "wind 47 mph with 35,000 lb load: No Travel (load rule)" in result.reasons


def test_assess_checkpoint_load_rule_not_reported_when_it_changes_nothing() -> None:
    result = assess_checkpoint(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=20000)

    assert result.level == SEVERE
    assert not any("load rule" in reason for reason in result.reasons)


def test_assess_checkpoint_load_rule_not_reported_when_rain_is_already_severe() -> None:
    result = assess_checkpoint(wind_mph=40, rain_in_hr=0.6, snow_in_hr=0, load_lb=50000)

    assert result.level == SEVERE
    assert not any("load rule" in reason for reason in result.reasons)


def test_assess_checkpoint_wind_55_is_no_travel_for_any_load() -> None:
    result = assess_checkpoint(wind_mph=55, rain_in_hr=0, snow_in_hr=0, load_lb=1000)

    assert result.level == NO_TRAVEL


@pytest.mark.parametrize(
    ("wind_mph", "rain_in_hr", "snow_in_hr"),
    [(None, 0, 0), (10, None, 0), (10, 0, None), (None, None, None)],
)
def test_assess_checkpoint_missing_values_count_as_zero(
    wind_mph: float | None, rain_in_hr: float | None, snow_in_hr: float | None
) -> None:
    result = assess_checkpoint(wind_mph, rain_in_hr, snow_in_hr, load_lb=20000)

    assert result.level == LOW
    assert "missing data" in result.reasons


def test_assess_checkpoint_missing_data_does_not_hide_other_risk() -> None:
    result = assess_checkpoint(wind_mph=None, rain_in_hr=0.6, snow_in_hr=0, load_lb=0)

    assert result.level == SEVERE
    assert "missing data" in result.reasons
    assert result.wind_level == LOW


def test_assess_checkpoint_complete_data_has_no_missing_reason() -> None:
    result = assess_checkpoint(wind_mph=0, rain_in_hr=0, snow_in_hr=0, load_lb=0)

    assert "missing data" not in result.reasons
