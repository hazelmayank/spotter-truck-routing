import pytest

from routing.services.recommend import (
    Candidate,
    RouteSummary,
    explain,
    rank_routes,
    summarize,
    warnings_for,
)
from routing.services.risk import RiskLevel

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = RiskLevel


def route_summary(
    no_travel: float = 0, severe: float = 0, high: float = 0, avg_risk: float = 0
) -> RouteSummary:
    miles_by_level = dict.fromkeys(RiskLevel, 0.0)
    miles_by_level[NO_TRAVEL], miles_by_level[SEVERE], miles_by_level[HIGH] = (
        no_travel,
        severe,
        high,
    )
    return RouteSummary(miles_by_level, avg_risk, LOW)


def candidate(route_id: str, duration_s: float = 3600, **summary: float) -> Candidate:
    return Candidate(route_id, route_summary(**summary), duration_s)


def ranked_ids(*candidates: Candidate) -> list[str]:
    return [c.id for c in rank_routes(list(candidates))]


def test_summarize_sums_segment_miles_per_level() -> None:
    segments = [(LOW, 0), (LOW, 25), (HIGH, 25), (SEVERE, 10), (HIGH, 5)]

    summary = summarize(segments)

    assert summary.miles_by_level == {
        LOW: 25,
        MODERATE: 0,
        HIGH: 30,
        SEVERE: 10,
        NO_TRAVEL: 0,
    }


def test_summarize_reports_every_level_even_with_no_miles() -> None:
    assert list(summarize([(LOW, 0), (LOW, 10)]).miles_by_level) == list(RiskLevel)


def test_summarize_rounds_each_level_total_to_a_tenth_of_a_mile() -> None:
    summary = summarize([(HIGH, 10.04), (HIGH, 10.04), (SEVERE, 0.04)])

    assert summary.miles_by_level[HIGH] == 20.1
    assert summary.miles_by_level[SEVERE] == 0.0


def test_average_risk_is_weighted_by_segment_miles() -> None:
    summary = summarize([(LOW, 0), (LOW, 10), (SEVERE, 30)])

    assert summary.avg_risk == pytest.approx(2.25)


def test_average_risk_of_a_zero_length_route_is_zero() -> None:
    assert summarize([(LOW, 0)]).avg_risk == 0


def test_max_level_counts_every_checkpoint_including_the_origin() -> None:
    assert summarize([(SEVERE, 0), (LOW, 25)]).max_level == SEVERE
    assert summarize([(LOW, 0), (MODERATE, 25)]).max_level == MODERATE


@pytest.mark.parametrize(
    ("better", "worse"),
    [
        (
            candidate("A", no_travel=0, severe=90, high=90, avg_risk=3, duration_s=9000),
            candidate("B", no_travel=0.1, severe=0, high=0, avg_risk=0, duration_s=100),
        ),
        (
            candidate("A", severe=0.1, high=90, avg_risk=3, duration_s=9000),
            candidate("B", severe=10, high=0, avg_risk=0, duration_s=100),
        ),
        (
            candidate("A", high=5, avg_risk=3, duration_s=9000),
            candidate("B", high=5.1, avg_risk=0, duration_s=100),
        ),
        (
            candidate("A", avg_risk=0.5, duration_s=9000),
            candidate("B", avg_risk=0.6, duration_s=100),
        ),
        (candidate("A", duration_s=100), candidate("B", duration_s=101)),
    ],
    ids=["no_travel", "severe", "high", "average_risk", "duration"],
)
def test_each_criterion_decides_only_when_the_ones_before_it_tie(
    better: Candidate, worse: Candidate
) -> None:
    assert ranked_ids(worse, better) == ["A", "B"]
    assert ranked_ids(better, worse) == ["A", "B"]


def test_miles_are_compared_after_rounding_to_a_tenth() -> None:
    near_tie_slow = Candidate("A", summarize([(SEVERE, 4.04)]), 7200)
    near_tie_fast = Candidate("B", summarize([(SEVERE, 4.01)]), 3600)

    assert ranked_ids(near_tie_slow, near_tie_fast) == ["B", "A"]


def test_ranking_orders_all_routes_best_first() -> None:
    routes = [
        candidate("A", no_travel=30),
        candidate("B", severe=5),
        candidate("C", high=40),
    ]

    assert ranked_ids(*routes) == ["C", "B", "A"]


def test_explain_with_one_route() -> None:
    assert explain(rank_routes([candidate("A")])) == "Route A is the only route found."


def test_explain_names_the_deciding_severe_miles() -> None:
    ranked = rank_routes(
        [candidate("A", severe=38.5, duration_s=3600), candidate("B", duration_s=5100)]
    )

    assert explain(ranked) == (
        "Route B is recommended: 0.0 mi of severe weather versus 38.5 mi on Route A. "
        "It takes 25 min longer than the fastest route (A)."
    )


def test_explain_for_no_travel_miles() -> None:
    ranked = rank_routes(
        [candidate("A", no_travel=12, duration_s=3600), candidate("B", duration_s=3600)]
    )

    assert explain(ranked).startswith(
        "Route B is recommended: 0.0 mi of no-travel weather versus 12.0 mi on Route A."
    )


def test_explain_for_average_risk() -> None:
    ranked = rank_routes([candidate("A", avg_risk=0.9), candidate("B", avg_risk=0.4)])

    assert explain(ranked).startswith(
        "Route B is recommended: lower average risk (0.400 versus 0.900 on Route A)."
    )


def test_explain_shows_averages_that_differ_only_in_the_third_decimal() -> None:
    ranked = rank_routes(
        [
            candidate("A", avg_risk=0.062, duration_s=100),
            candidate("C", avg_risk=0.058, duration_s=900),
        ]
    )

    assert explain(ranked).startswith(
        "Route C is recommended: lower average risk (0.058 versus 0.062 on Route A)."
    )


def test_explain_for_a_tie_on_risk_is_about_speed() -> None:
    ranked = rank_routes([candidate("B", duration_s=7200), candidate("A", duration_s=3600)])

    assert explain(ranked) == "Route A is recommended: same weather risk as Route B, but faster."


def test_explain_formats_long_time_differences_in_hours() -> None:
    ranked = rank_routes(
        [candidate("A", severe=5, duration_s=3600), candidate("B", duration_s=3600 + 3900)]
    )

    assert explain(ranked).endswith("It takes 1h 05m longer than the fastest route (A).")


def test_no_warning_when_some_route_avoids_no_travel_weather() -> None:
    assert warnings_for([candidate("A", no_travel=5), candidate("B")]) == []


def test_warning_suggests_a_later_departure_when_every_route_has_no_travel_miles() -> None:
    warnings = warnings_for([candidate("A", no_travel=5), candidate("B", no_travel=0.1)])

    assert warnings == ["Every route has no-travel weather; consider departing later."]
