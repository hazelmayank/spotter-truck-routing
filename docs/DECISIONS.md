# Decisions

One line per non-obvious decision.

## Geometry and sampling

- Distances use haversine with a 3958.8 mi earth radius; points within a segment are interpolated linearly in lat/lon, which is accurate for the short segments of a routing polyline.
- Checkpoints sit at 0, N, 2N, ... below the route length, then the destination; an exact multiple of N does not get a duplicate destination checkpoint.
- Each checkpoint's `segment_miles` is the distance back to the previous checkpoint (0 for the origin), so segment miles always sum to the polyline length.
- Instruction time-point offsets are rescaled so the last one equals the polyline length, because the routing service and the geometry measure slightly different distances and the destination must still get the full travel time.
- When time points are missing, ETAs fall back to distance-proportional time over a caller-supplied total duration (the same as a two-point `(0, 0)`, `(total, duration)` list); with neither, it is an error rather than a guess.
- Departure must be timezone-aware and is normalised to UTC so every ETA is UTC.

## TomTom and route alternatives

- All TomTom calls go through `TomTomClient.get_json`; services take an optional client so tests pass a fake and never touch the network.
- Network errors are re-raised without the original message because it contains the request URL, and with it the API key.
- Extra routes use a via point as a regular waypoint in the request path, because TomTom returns alternatives only for routes without waypoints.
- The via point is the midpoint of the fastest route moved sideways by 15% of the straight-line origin-destination distance, perpendicular to that straight line, using a flat local approximation (about 0.3% error at 100 mi, which does not matter for picking a detour).
- A via route is dropped when its travel time is more than 1.4 times the fastest route's, or when over 90% of its points (sampled every mile) lie within 0.5 mi of an existing route (sampled every 0.25 mi).
- If a via point cannot be routed, that side is skipped; the first request failing is never swallowed.
- The response polyline is simplified (Douglas-Peucker, 0.0005 deg); `RouteOption.coords` keeps the full line for checkpoint sampling and ETAs.
- Geocoding and suggestions are limited to the US and Canada, and a suggestion request with a blank query returns nothing without calling the API.
- The test fixtures follow TomTom's documented calculateRoute response shape but were generated, not recorded from the live API; `try_route` is the check against the real one.

## Risk engine

- Thresholds are half-open: a value exactly on a boundary takes the higher level (wind 25 mph is MODERATE, not LOW).
- Rain and snow top out inclusively: exactly 1.00 in/hr rain and exactly 3.0 in/hr snow are SEVERE; NO_TRAVEL starts strictly above.
- Wind NO_TRAVEL starts at 55 mph inclusive (55 is NO_TRAVEL, 54.9 is SEVERE).
- Rain input is rain + showers, summed by the caller; the risk functions take a single in/hr rate.
- Load rules only ever raise the level (`max`), never lower it; they apply on top of the worst of wind, rain and snow.
- Load limits are strict "greater than": 30,000 lb is not heavy for the 45–54.99 mph rule, 30,001 lb is; same for 40,000 vs 40,001 lb.
- Load rules use sustained `wind_speed_10m` only; gusts are display-only.
- Missing weather values are treated as 0 so one gap does not hide the other factors, and the checkpoint gets a "missing data" reason so the UI can flag it.
- Reasons list each factor above LOW, plus one load-rule line only when that rule actually raised the level.
