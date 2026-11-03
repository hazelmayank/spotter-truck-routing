import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { PlanResponse, RiskLevel, Route } from '../types'
import { RISK_COLORS } from './risk'

export type Bounds = [[west: number, south: number], [east: number, north: number]]

export const ROUTE_HIT_LAYER_ID = 'route-hit'
export const CHECKPOINT_LAYER_ID = 'checkpoints'
export const CHECKPOINT_HIT_LAYER_ID = 'checkpoint-hit'
export const CHECKPOINT_HIT_RADIUS_PX = 12

const RECOMMENDED_COLOR = '#1d4ed8'
const EMPHASIZED_COLOR = '#2563eb'
const OTHER_COLOR = '#93c5fd'
const RECOMMENDED_WIDTH_PX = 6
const OTHER_WIDTH_PX = 4
const EMPHASIS_EXTRA_WIDTH_PX = 2
const DIMMED_OPACITY = 0.4
const OTHER_OPACITY = 0.75

const ACTIVE_CHECKPOINT_RADIUS_PX = 6
const OTHER_CHECKPOINT_RADIUS_PX = 4
const OTHER_CHECKPOINT_OPACITY = 0.55

export const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] }

// Routes are drawn worst rank first so the recommended route ends up on top.
const worstRankFirst = (routes: Route[]) => [...routes].sort((a, b) => b.rank - a.rank)

export function routesGeoJson(routes: Route[]): FeatureCollection<LineString, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: worstRankFirst(routes).map((route) => ({
      type: 'Feature',
      properties: { id: route.id },
      geometry: route.geometry,
    })),
  }
}

export interface CheckpointProperties {
  routeId: string
  index: number // position in the route's checkpoints array
  level: RiskLevel
}

export function checkpointsGeoJson(
  routes: Route[],
): FeatureCollection<Point, CheckpointProperties> {
  return {
    type: 'FeatureCollection',
    features: worstRankFirst(routes).flatMap((route) =>
      route.checkpoints.map((checkpoint, index) => ({
        type: 'Feature' as const,
        properties: { routeId: route.id, index, level: checkpoint.level },
        geometry: { type: 'Point' as const, coordinates: [checkpoint.lon, checkpoint.lat] },
      })),
    ),
  }
}

export function endpointsGeoJson(
  plan: PlanResponse,
): FeatureCollection<Point, { kind: 'origin' | 'destination' }> {
  const point = (place: PlanResponse['origin'], kind: 'origin' | 'destination') => ({
    type: 'Feature' as const,
    properties: { kind },
    geometry: { type: 'Point' as const, coordinates: [place.lon, place.lat] },
  })
  return {
    type: 'FeatureCollection',
    features: [point(plan.origin, 'origin'), point(plan.destination, 'destination')],
  }
}

export function planBounds(routes: Route[]): Bounds | null {
  const coordinates = routes.flatMap((route) => route.geometry.coordinates)
  if (coordinates.length === 0) return null
  const lons = coordinates.map(([lon]) => lon)
  const lats = coordinates.map(([, lat]) => lat)
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}

export interface RouteLineState {
  recommended: boolean
  hovered: boolean
  selected: boolean
  dimmed: boolean // another route is selected
}

export function routeLinePaint(state: RouteLineState): LineLayerSpecification['paint'] {
  const emphasized = state.hovered || state.selected
  const baseWidth = state.recommended ? RECOMMENDED_WIDTH_PX : OTHER_WIDTH_PX
  const baseColor = state.recommended
    ? RECOMMENDED_COLOR
    : emphasized
      ? EMPHASIZED_COLOR
      : OTHER_COLOR
  const opacity = state.dimmed
    ? DIMMED_OPACITY
    : state.recommended || emphasized
      ? 1
      : OTHER_OPACITY
  return {
    'line-color': baseColor,
    'line-width': baseWidth + (emphasized ? EMPHASIS_EXTRA_WIDTH_PX : 0),
    'line-opacity': opacity,
  }
}

export const LEVEL_COLOR_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'level'],
  'LOW',
  RISK_COLORS.LOW,
  'MODERATE',
  RISK_COLORS.MODERATE,
  'HIGH',
  RISK_COLORS.HIGH,
  'SEVERE',
  RISK_COLORS.SEVERE,
  'NO_TRAVEL',
  RISK_COLORS.NO_TRAVEL,
  '#6b7280',
]

export function checkpointPaint(activeRouteId: string): CircleLayerSpecification['paint'] {
  const isActive: ExpressionSpecification = ['==', ['get', 'routeId'], activeRouteId]
  return {
    'circle-color': LEVEL_COLOR_EXPRESSION,
    'circle-radius': ['case', isActive, ACTIVE_CHECKPOINT_RADIUS_PX, OTHER_CHECKPOINT_RADIUS_PX],
    'circle-opacity': ['case', isActive, 1, OTHER_CHECKPOINT_OPACITY],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.5,
    'circle-stroke-opacity': ['case', isActive, 1, OTHER_CHECKPOINT_OPACITY],
  }
}

// Origin is a filled dot, destination a ring, so they differ by shape and not only by color.
export const ENDPOINT_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': 8,
  'circle-color': ['match', ['get', 'kind'], 'origin', '#0f172a', '#ffffff'],
  'circle-stroke-color': ['match', ['get', 'kind'], 'origin', '#ffffff', '#0f172a'],
  'circle-stroke-width': 4,
}

export const isCheckpointLayer = (layerId: string) =>
  layerId === CHECKPOINT_LAYER_ID || layerId === CHECKPOINT_HIT_LAYER_ID
