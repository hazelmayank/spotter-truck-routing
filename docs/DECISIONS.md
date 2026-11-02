# Decisions

One line per non-obvious decision.

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
