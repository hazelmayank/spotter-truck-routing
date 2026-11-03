import logging

from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response

from routing.services.geocoding import GeocodingError
from routing.services.heatmap import build_heatmap
from routing.services.planner import PlanRequest, plan_trip
from routing.services.routing import RoutingError
from routing.services.tomtom import TomTomError
from routing.services.weather import ForecastRangeError, WeatherError

from .serializers import (
    HeatmapRequestSerializer,
    PlanRequestSerializer,
    heatmap_response,
    plan_response,
    route_lines,
)

logger = logging.getLogger(__name__)


@api_view(["GET"])
@throttle_classes([])  # the platform's health checks must never be throttled
def health(request: Request) -> Response:
    return Response({"status": "ok"})


@api_view(["POST"])
def plan(request: Request) -> Response:
    serializer = PlanRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    body = serializer.validated_data

    try:
        trip = plan_trip(
            PlanRequest(
                origin=body["origin"],
                destination=body["destination"],
                departure_utc=body["departure"],
                load_lb=body["load_lb"],
                interval_miles=body["interval_miles"],
            )
        )
    except (GeocodingError, RoutingError, ForecastRangeError) as exc:
        return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    except TomTomError:
        logger.exception("routing service failed")
        return _upstream_failure("routing")
    except WeatherError:
        logger.exception("weather service failed")
        return _upstream_failure("weather")

    return Response(plan_response(trip))


def _upstream_failure(service: str) -> Response:
    message = f"The {service} service is not responding. Please try again in a moment."
    return Response({"error": message}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
def heatmap(request: Request) -> Response:
    serializer = HeatmapRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    body = serializer.validated_data

    try:
        grid = build_heatmap(route_lines(body["routes"]), body["departure"], body["load_lb"])
    except ForecastRangeError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    except WeatherError:
        logger.exception("weather service failed")
        return _upstream_failure("weather")

    return Response(heatmap_response(grid))
