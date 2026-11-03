import { vi } from 'vitest'
import type { Checkpoint, HeatmapResponse, PlanResponse, Route } from '../types'

export function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    mile: 0,
    lat: 32.7767,
    lon: -96.797,
    eta: '2026-11-03T12:00:00Z',
    wind_mph: 5,
    gust_mph: 12,
    rain_in_hr: 0,
    snow_in_hr: 0,
    level: 'LOW',
    reasons: [],
    ...overrides,
  }
}

export function makeRoute(id = 'A', rank = 1, overrides: Partial<Route> = {}): Route {
  return {
    id,
    rank,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-96.797, 32.7767],
        [-104.9903, 39.7392],
      ],
    },
    distance_mi: 796.6,
    duration_s: 47160,
    departure: '2026-11-03T12:00:00Z',
    arrival: '2026-11-04T01:06:00Z',
    checkpoints: [makeCheckpoint()],
    summary: {
      miles_by_level: { LOW: 796.5, MODERATE: 0, HIGH: 0, SEVERE: 0, NO_TRAVEL: 0 },
      avg_risk: 0,
      max_level: 'LOW',
    },
    ...overrides,
  }
}

export function makePlan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    origin: { label: 'Dallas, TX', lat: 32.7767, lon: -96.797 },
    destination: { label: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
    recommended_route_id: 'A',
    explanation: 'Route A is recommended: same weather risk as Route B, but faster.',
    warnings: [],
    routes: [makeRoute()],
    departure: '2026-11-03T12:00:00Z',
    load_lb: 42_000,
    ...overrides,
  }
}

/** Three routes where B is recommended: A is fastest but has severe weather, C is slowest. */
export function makeThreeRoutePlan(): PlanResponse {
  const line = (lonShift: number): Route['geometry'] => ({
    type: 'LineString',
    coordinates: [
      [-96.797, 32.7767],
      [-100 + lonShift, 36],
      [-104.9903, 39.7392],
    ],
  })
  return makePlan({
    recommended_route_id: 'B',
    routes: [
      makeRoute('A', 3, {
        geometry: line(0),
        checkpoints: [
          makeCheckpoint({ mile: 0 }),
          makeCheckpoint({ mile: 25, lat: 33.5, lon: -98, level: 'SEVERE', wind_mph: 50 }),
        ],
        summary: {
          miles_by_level: { LOW: 700, MODERATE: 0, HIGH: 0, SEVERE: 96.6, NO_TRAVEL: 0 },
          avg_risk: 0.36,
          max_level: 'SEVERE',
        },
      }),
      makeRoute('B', 1, {
        geometry: line(-2),
        distance_mi: 930.5,
        duration_s: 48000,
        checkpoints: [makeCheckpoint({ mile: 0 }), makeCheckpoint({ mile: 25, lat: 34, lon: -97 })],
      }),
      makeRoute('C', 2, {
        geometry: line(2),
        distance_mi: 987.6,
        duration_s: 55000,
        checkpoints: [makeCheckpoint({ mile: 0 })],
      }),
    ],
  })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function stubFetch(...responses: (Response | Error)[]) {
  const queue = [...responses]
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next ?? jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Points at (35, -100) and (36, -101); risk, wind, rain and snow rise by one step per hour. */
export function makeHeatmapResponse(hours = 49): HeatmapResponse {
  const series = (scale: number) => Array.from({ length: hours }, (_, hour) => hour * scale)
  const point = (lat: number, lon: number) => ({
    lat,
    lon,
    risk: Array.from({ length: hours }, (_, hour) => Math.min(4, Math.floor(hour / 10))),
    wind_mph: series(1),
    rain_in_hr: series(0.02),
    snow_in_hr: series(0.05),
  })
  return {
    start: '2026-11-03T12:00:00Z',
    hours,
    step_deg: 0.25,
    points: [point(35, -100), point(36, -101)],
  }
}
