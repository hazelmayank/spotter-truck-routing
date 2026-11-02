import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from routing.services.geocoding import GeocodingError
from routing.services.planner import PlanRequest, plan_trip
from routing.services.routing import RoutingError
from routing.services.tomtom import TomTomError
from routing.services.weather import ForecastRangeError, WeatherError

from .serializers import PlanRequestSerializer, plan_response

logger = logging.getLogger(__name__)


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


@api_view(["POST"])
def plan(request: Request) -> Response:
    serializer = PlanRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        trip = plan_trip(
            PlanRequest(
                origin=data["origin"],
                destination=data["destination"],
                departure_utc=data["departure"],
                load_lb=data["load_lb"],
                interval_miles=data["interval_miles"],
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
