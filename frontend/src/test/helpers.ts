import { vi } from 'vitest'
import type { PlanResponse } from '../types'

export function makePlan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    origin: { label: 'Dallas, TX', lat: 32.7767, lon: -96.797 },
    destination: { label: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
    recommended_route_id: 'A',
    explanation: 'Route A is recommended: same weather risk as Route B, but faster.',
    warnings: [],
    routes: [
      {
        id: 'A',
        rank: 1,
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
        checkpoints: [
          {
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
          },
        ],
        summary: {
          miles_by_level: { LOW: 796.5, MODERATE: 0, HIGH: 0, SEVERE: 0, NO_TRAVEL: 0 },
          avg_risk: 0,
          max_level: 'LOW',
        },
      },
    ],
    ...overrides,
  }
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
