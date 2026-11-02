"""Per-route risk summaries, ranking and the recommendation text."""

from collections.abc import Sequence
from dataclasses import dataclass

from .risk import RiskLevel

MILES_DECIMALS = 1
AVG_RISK_DECIMALS = 3

NO_TRAVEL_WARNING = "Every route has no-travel weather; consider departing later."

# The ranking criteria that are miles at a level, most important first.
MILES_CRITERIA: tuple[tuple[RiskLevel, str], ...] = (
    (RiskLevel.NO_TRAVEL, "no-travel"),
    (RiskLevel.SEVERE, "severe"),
    (RiskLevel.HIGH, "high-risk"),
)


@dataclass(frozen=True)
class RouteSummary:
    miles_by_level: dict[RiskLevel, float]  # rounded to 0.1 mi
    avg_risk: float  # risk level averaged over segment miles
    max_level: RiskLevel


@dataclass(frozen=True)
class Candidate:
    id: str
    summary: RouteSummary
    duration_s: float


def summarize(segments: Sequence[tuple[RiskLevel, float]]) -> RouteSummary:
    """Summary of (risk level, segment miles) pairs, one per checkpoint."""
    miles = dict.fromkeys(RiskLevel, 0.0)
    for level, segment_miles in segments:
        miles[level] += segment_miles
    total_miles = sum(miles.values())
    weighted_risk = sum(level * level_miles for level, level_miles in miles.items())
    return RouteSummary(
        miles_by_level={level: round(m, MILES_DECIMALS) for level, m in miles.items()},
        avg_risk=round(weighted_risk / total_miles, AVG_RISK_DECIMALS) if total_miles else 0.0,
        max_level=max(level for level, _ in segments),
    )


def rank_routes(candidates: Sequence[Candidate]) -> list[Candidate]:
    """Best first: fewest no-travel, severe, then high-risk miles, then lowest average risk."""
    return sorted(candidates, key=_sort_key)


def explain(ranked: Sequence[Candidate]) -> str:
    best = ranked[0]
    if len(ranked) == 1:
        return f"Route {best.id} is the only route found."

    sentence = f"Route {best.id} is recommended: {_deciding_reason(best, ranked[1])}."
    fastest = min(ranked, key=lambda candidate: candidate.duration_s)
    if fastest is not best:
        extra_s = best.duration_s - fastest.duration_s
        sentence += (
            f" It takes {_format_duration(extra_s)} longer than the fastest route ({fastest.id})."
        )
    return sentence


def warnings_for(ranked: Sequence[Candidate]) -> list[str]:
    if all(c.summary.miles_by_level[RiskLevel.NO_TRAVEL] > 0 for c in ranked):
        return [NO_TRAVEL_WARNING]
    return []


def _sort_key(candidate: Candidate) -> tuple[float, ...]:
    miles = candidate.summary.miles_by_level
    return (
        *(miles[level] for level, _ in MILES_CRITERIA),
        candidate.summary.avg_risk,
        candidate.duration_s,
    )


def _deciding_reason(best: Candidate, runner_up: Candidate) -> str:
    for level, label in MILES_CRITERIA:
        best_miles = best.summary.miles_by_level[level]
        other_miles = runner_up.summary.miles_by_level[level]
        if best_miles != other_miles:
            return (
                f"{best_miles:.1f} mi of {label} weather "
                f"versus {other_miles:.1f} mi on Route {runner_up.id}"
            )
    if best.summary.avg_risk != runner_up.summary.avg_risk:
        return (
            f"lower average risk ({best.summary.avg_risk:.2f} versus "
            f"{runner_up.summary.avg_risk:.2f} on Route {runner_up.id})"
        )
    if best.duration_s < runner_up.duration_s:
        return f"same weather risk as Route {runner_up.id}, but faster"
    return f"it ties with Route {runner_up.id} on weather risk and travel time"


def _format_duration(seconds: float) -> str:
    hours, minutes = divmod(round(seconds / 60), 60)
    return f"{hours}h {minutes:02d}m" if hours else f"{minutes} min"
