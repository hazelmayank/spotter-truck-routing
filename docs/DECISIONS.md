# Decisions

One line per non-obvious decision.

## Geometry and sampling

- Distances use haversine with a 3958.8 mi earth radius; points within a segment are interpolated linearly in lat/lon, which is accurate for the short segments of a routing polyline.
- Checkpoints sit at 0, N, 2N, ... below the route length, then the destination; an exact multiple of N does not get a duplicate destination checkpoint.
- Each checkpoint's `segment_miles` is the distance back to the previous checkpoint (0 for the origin), so segment miles always sum to the polyline length.
- Instruction time-point offsets are rescaled so the last one equals the polyline length, because the routing service and the geometry measure slightly different distances and the destination must still get the full travel time.
- When time points are missing, ETAs fall back to distance-proportional time over a caller-supplied total duration (the same as a two-point `(0, 0)`, `(total, duration)` list); with neither, it is an error rather than a guess.
- Departure must be timezone-aware and is normalised to UTC so every ETA is UTC.

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
