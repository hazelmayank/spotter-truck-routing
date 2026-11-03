export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL'

export type IntervalMiles = 10 | 25 | 50

export interface PlanRequest {
  origin: string
  destination: string
  departure: string // ISO 8601 with a timezone
  load_lb: number
  interval_miles: IntervalMiles
}

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface LineStringGeometry {
  type: 'LineString'
  coordinates: [lon: number, lat: number][]
}

export interface Checkpoint {
  mile: number
  lat: number
  lon: number
  eta: string // UTC ISO 8601
  wind_mph: number | null
  gust_mph: number | null
  rain_in_hr: number | null
  snow_in_hr: number | null
  level: RiskLevel
  reasons: string[]
}

export interface RouteSummary {
  miles_by_level: Record<RiskLevel, number>
  avg_risk: number
  max_level: RiskLevel
}

export interface Route {
  id: string
  rank: number
  geometry: LineStringGeometry
  distance_mi: number
  duration_s: number
  departure: string
  arrival: string
  checkpoints: Checkpoint[]
  summary: RouteSummary
}

export interface PlanResponse {
  origin: Place
  destination: Place
  recommended_route_id: string
  explanation: string
  warnings: string[]
  routes: Route[]
}

// Proposed contract: POST /api/heatmap does not exist on the backend yet.
export interface HeatmapRequest {
  routes: { id: string; geometry: LineStringGeometry }[]
  departure: string
  load_lb: number
}

export interface HeatmapPoint {
  lat: number
  lon: number
  level: RiskLevel[] // one entry per forecast hour, 0 to 48 hours after `start`
}

export interface HeatmapResponse {
  start: string // UTC ISO 8601, the first forecast hour
  points: HeatmapPoint[]
}

export type FieldErrors = Record<string, string[]>

export interface CheckpointTarget {
  routeId: string
  index: number // position in the route's checkpoints array
  source: 'map' | 'list' // the map only flies to checkpoints picked from the list
}
