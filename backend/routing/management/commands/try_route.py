from datetime import UTC, datetime

from django.core.management.base import BaseCommand, CommandError

from routing.services.geocoding import GeocodingError, geocode
from routing.services.routing import RoutingError, get_routes
from routing.services.tomtom import TomTomError

DEFAULT_LOAD_LB = 40_000


class Command(BaseCommand):
    help = "Call the real TomTom API for a route and print a summary; checks that the key works."

    def add_arguments(self, parser):
        parser.add_argument("origin")
        parser.add_argument("destination")
        parser.add_argument("--load-lb", type=float, default=DEFAULT_LOAD_LB)

    def handle(self, *args, origin, destination, load_lb, **options):
        departure_utc = datetime.now(UTC)
        try:
            start, end = geocode(origin), geocode(destination)
            routes = get_routes((start.lat, start.lon), (end.lat, end.lon), departure_utc, load_lb)
        except (GeocodingError, RoutingError, TomTomError) as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            f"{start.label} ({start.lat:.4f}, {start.lon:.4f}) -> "
            f"{end.label} ({end.lat:.4f}, {end.lon:.4f})"
        )
        self.stdout.write(f"Departing {departure_utc:%Y-%m-%d %H:%M} UTC with {load_lb:,.0f} lb")
        for route in routes:
            hours, minutes = divmod(round(route.duration_s / 60), 60)
            self.stdout.write(
                f"{route.id}: {route.distance_miles:.1f} mi, {hours}h {minutes:02d}m, "
                f"{len(route.coords)} points ({len(route.display_coords)} simplified), "
                f"{len(route.time_points)} time points"
            )
