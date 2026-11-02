from datetime import UTC, datetime
from typing import Any

from rest_framework import serializers

from routing.services.geocoding import Place
from routing.services.planner import PlannedCheckpoint, PlannedRoute, TripPlan

MAX_LOAD_LB = 80_000
INTERVAL_CHOICES = (10, 25, 50)
DEFAULT_INTERVAL_MILES = 25


class AwareDateTimeField(serializers.DateTimeField):
    """A datetime that must carry a UTC offset; DRF would otherwise assume the server zone."""

    def enforce_timezone(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise serializers.ValidationError(
                "Include a timezone, for example 2026-11-03T08:00:00Z."
            )
        return value.astimezone(UTC)


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = AwareDateTimeField()
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)
    interval_miles = serializers.ChoiceField(
        choices=INTERVAL_CHOICES, default=DEFAULT_INTERVAL_MILES
    )


def plan_response(plan: TripPlan) -> dict[str, Any]:
    return {
        "origin": _place(plan.origin),
        "destination": _place(plan.destination),
        "recommended_route_id": plan.recommended_route_id,
        "explanation": plan.explanation,
        "warnings": plan.warnings,
        "routes": [_route(route) for route in plan.routes],
    }


def _place(place: Place) -> dict[str, Any]:
    return {"label": place.label, "lat": place.lat, "lon": place.lon}


def _route(route: PlannedRoute) -> dict[str, Any]:
    option = route.option
    return {
        "id": option.id,
        "rank": route.rank,
        "geometry": {
            "type": "LineString",
            "coordinates": [[round(lon, 5), round(lat, 5)] for lat, lon in option.display_coords],
        },
        "distance_mi": round(option.distance_miles, 1),
        "duration_s": round(option.duration_s),
        "departure": _iso(route.departure_utc),
        "arrival": _iso(route.arrival_utc),
        "checkpoints": [_checkpoint(checkpoint) for checkpoint in route.checkpoints],
        "summary": {
            "miles_by_level": {
                level.name: miles for level, miles in route.summary.miles_by_level.items()
            },
            "avg_risk": route.summary.avg_risk,
            "max_level": route.summary.max_level.name,
        },
    }


def _checkpoint(planned: PlannedCheckpoint) -> dict[str, Any]:
    checkpoint, weather, risk = planned.checkpoint, planned.weather, planned.risk
    return {
        "mile": round(checkpoint.mile, 1),
        "lat": round(checkpoint.lat, 5),
        "lon": round(checkpoint.lon, 5),
        "eta": _iso(checkpoint.eta_utc),
        "wind_mph": _rounded(weather.wind_mph),
        "gust_mph": _rounded(weather.gust_mph),
        "rain_in_hr": _rounded(weather.rain_in_hr),
        "snow_in_hr": _rounded(weather.snow_in_hr),
        "level": risk.level.name,
        "reasons": risk.reasons,
    }


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 3)
