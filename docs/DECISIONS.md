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

## Weather

- Points are rounded to 2 decimals (about 1 km, finer than Open-Meteo's grid) and deduplicated before the request, so nearby checkpoints share one forecast.
- Rain and showers are summed into one in/hr rate; if only one of them is present it is used alone, and if both are missing the hour stays missing (the risk engine then counts it as 0 and adds "missing data").
- `snowfall` is used as reported with `precipitation_unit=inch`, which is snow depth, not water equivalent; the snow thresholds apply to it directly.
- The start is floored and the end is ceiled to whole hours so the nearest-hour lookup always has both neighbours of an ETA.
- `weather_at` rounds exactly half past the hour up, and raises `ForecastRangeError` for an ETA more than half an hour outside the series instead of silently reusing the edge hour.
- The forecast horizon is from 00:00 UTC today to 16 days after that; a window that leaves it is rejected before any request is made.
- Results are cached per point and hour range for 30 minutes in Django's local-memory cache, which is per process, so each gunicorn worker has its own copy.
- Batches of up to 100 points run on at most 4 threads; a 429 or 5xx response is retried once after 0.5 s, other errors are not retried.

## Recommendation and plan API

- Miles per level are summed per route and rounded to 0.1 mi before ranking, so 4.04 and 4.01 mi of severe weather tie and the next criterion decides.
- Average risk is the risk level weighted by segment miles, rounded to 3 decimals so float noise cannot break a tie that should fall through to travel time.
- A route's `max_level` is taken over all checkpoints, including the origin, even though the origin owns 0 miles.
- The explanation compares the recommended route with the runner-up and names the first criterion that differs, then adds how much slower it is than the fastest route.
- The 422 status covers input the services understood but cannot satisfy (unknown place, no route, forecast out of range); 502 is for a routing or weather service that failed, with a generic message and the detail only in the log.
- A departure without a timezone is rejected with 400, because DRF would otherwise silently read it in the server's timezone.
- Weather for risk is fetched once for every checkpoint of every route, from the departure to the latest ETA, so the request count does not grow with the number of routes.
- The geometry in the response is the simplified line; checkpoints, ETAs and weather are computed on the full-resolution line.
- Weather gaps are counted as low risk and reported in `warnings`, as is a result with fewer than three routes.

## Frontend data layer and form

- Form field names match the API field names, so a 400 from the backend maps straight onto the input it is about; a 400 is never shown as a banner, while 422 and 502 messages are.
- A server error is hidden as soon as its field is edited, since it described the value that was submitted.
- The departure input is a `datetime-local` value, read as the browser's local time and converted with `toISOString()` on submit, so the backend always receives UTC.
- Validation messages appear after a field is blurred or the form is submitted, not while the user is still typing the first time.
- There is no autocomplete yet because the backend has no `/api/geocode` endpoint; the `suggest` service exists and only needs a thin view.
- `HeatmapRequest` and `HeatmapResponse` in `types.ts` are a proposed contract, because `/api/heatmap` is not built yet; `useHeatmap` is not mounted in the app until it is.
- `useHeatmap` sets `staleTime: Infinity` and no retries, so the 49 hours are fetched once per plan and the slider never triggers a request.
- State stays in `App` (one mutation passed one level down), so no context or store is needed yet.

## Map

- Everything on the map is a GeoJSON source and layer, with no DOM markers, so cost stays flat with hundreds of checkpoints.
- Each route is its own line layer filtered by route id, so hover and selection only change that layer's paint and never rebuild the data; the GeoJSON is memoized on the plan alone.
- Routes are drawn worst rank first, so the recommended route is the last layer and sits on top.
- An invisible 16 px wide line layer carries the hover and click handling, because a 4 px line is hard to hit.
- Checkpoint features hold only the route id, the checkpoint index and the level; the popup looks the full checkpoint up in the plan, which keeps the map data small (array values in feature properties are also flattened to strings by the map library).
- Checkpoints of every route are shown, and those of the selected, hovered or else recommended route are larger and fully opaque.
- Origin and destination are circles that differ by shape (filled dot and ring) and not only by color, because text labels would depend on the style's font files.
- The fit padding is a uniform 48 px: the sidebar sits beside the map and does not overlap it, so there is no extra sidebar offset.
- Hover and selection reset when a new plan arrives, by tying them to the plan object instead of clearing them in an effect.
- The map module is loaded lazily so the form is usable before the map library (about 300 kB gzipped) has downloaded.

## Heatmap

- The heatmap grid uses 0.25 degree cells (about 17 mi) within one cell of each route, and falls back to 0.5 degrees above 400 points, because Open-Meteo's free tier counts every location as a call (600 a minute).
- Grid points sit on exact multiples of the cell size, so the weather client's 2-decimal rounding and its cache keys cannot move them.
- The heatmap range stops at the forecast horizon instead of failing, so `hours` can be below 49 and the slider follows it.
- Django's local-memory cache holds 10,000 entries, because the default of 300 is smaller than one heatmap and made repeat requests refetch and hit the rate limit.
- The heatmap response is gzipped, which shrinks its 49-hour series about 9 times.
- The plan response echoes `departure` and `load_lb`, so a heatmap can be requested for a plan restored after a refresh.
- Heatmap risk reuses the checkpoint classify functions and load rules, and missing weather counts as calm.
- The slider hour lives in an external store read only by the slider and the heatmap layer, so dragging never re-renders `MapView`, its route and checkpoint layers, or the sidebar.
- Each slider move causes one frame-throttled paint update with the same GeoJSON object, so only `heatmap-weight` changes and no data is re-sent to the map.
- Wind, rain and snow weights are scaled to the no-travel thresholds (55 mph, 1 in/hr, 3 in/hr) and risk to 4, each capped at 1, with missing values as 0.
- The heatmap layer is created before the route layers, so it sits below the route lines without a `beforeId`.
- Checkpoints always show the weather at their own ETA and never use the slider hour, so a checkpoint's color cannot change while the slider is scrubbed.
- Moving the slider by hand pauses playback, and Play stops at the last hour and restarts from +0h if pressed there.

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
