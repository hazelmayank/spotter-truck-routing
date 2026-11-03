import type { FeatureCollection, Point } from 'geojson'
import type { ExpressionSpecification, HeatmapLayerSpecification } from 'maplibre-gl'
import type { HeatmapMetric, HeatmapPoint, HeatmapResponse } from '../types'
import { RISK_COLORS } from './risk'

export const HEATMAP_SOURCE_ID = 'heatmap'
export const HEATMAP_LAYER_ID = 'heatmap'
export const DEFAULT_GRID_STEP_DEG = 0.25

const MS_PER_HOUR = 3_600_000

interface MetricSpec {
  label: string
  prefix: string // property names are this prefix plus the hour: r0 ... r48
  series: keyof Pick<HeatmapPoint, 'risk' | 'wind_mph' | 'rain_in_hr' | 'snow_in_hr'>
  max: number // the value drawn at full weight: the no-travel thresholds of the risk model
  scale: string
}

export const METRICS: Record<HeatmapMetric, MetricSpec> = {
  risk: {
    label: 'Risk',
    prefix: 'r',
    series: 'risk',
    max: 4,
    scale: 'Risk level 0 to 4; blank where risk is low',
  },
  wind: { label: 'Wind', prefix: 'w', series: 'wind_mph', max: 55, scale: 'Wind, up to 55 mph' },
  rain: { label: 'Rain', prefix: 'p', series: 'rain_in_hr', max: 1, scale: 'Rain, up to 1 in/hr' },
  snow: { label: 'Snow', prefix: 's', series: 'snow_in_hr', max: 3, scale: 'Snow, up to 3 in/hr' },
}

export const METRIC_ORDER: readonly HeatmapMetric[] = ['risk', 'wind', 'rain', 'snow']

type HourlyProperties = Record<string, number>

/** One point feature per grid point, with every hour of every metric as its own property. */
export function heatmapGeoJson(
  response: HeatmapResponse,
): FeatureCollection<Point, HourlyProperties> {
  return {
    type: 'FeatureCollection',
    features: response.points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: hourlyProperties(point, response.hours),
    })),
  }
}

function hourlyProperties(point: HeatmapPoint, hours: number): HourlyProperties {
  const properties: HourlyProperties = {}
  for (const { prefix, series } of Object.values(METRICS)) {
    for (let hour = 0; hour < hours; hour++) {
      properties[`${prefix}${hour}`] = point[series][hour]
    }
  }
  return properties
}

/** The point's value at `hour`, scaled to 0-1 and capped; missing values count as 0. */
export function heatmapWeight(metric: HeatmapMetric, hour: number): ExpressionSpecification {
  const { prefix, max } = METRICS[metric]
  return ['min', 1, ['/', ['to-number', ['get', `${prefix}${hour}`], 0], max]]
}

// MapLibre draws a point's glow as exp(-4.5 (d / radius)^2): about 1% one radius out. A radius
// of twice the grid spacing makes the neighbours' glows add up to a flat field whose density
// is about the weight itself, so the colors mean the same at every zoom.
const MAP_WORLD_PX = 512 // the size of the world at zoom 0
const GLOW_RADIUS_PER_SPACING = 2
const MAX_GLOW_RADIUS_PX = 300

function glowRadius(stepDeg: number, zoom: number): number {
  const spacingPx = (stepDeg * MAP_WORLD_PX * 2 ** zoom) / 360
  return Math.min(MAX_GLOW_RADIUS_PX, GLOW_RADIUS_PER_SPACING * spacingPx)
}

/** The glow radius in pixels, growing with the zoom so the corridor stays continuous. */
export function heatmapRadius(stepDeg: number): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    3,
    glowRadius(stepDeg, 3),
    4,
    glowRadius(stepDeg, 4),
    5,
    glowRadius(stepDeg, 5),
    6,
    glowRadius(stepDeg, 6),
    7,
    glowRadius(stepDeg, 7),
    8,
    glowRadius(stepDeg, 8),
    9,
    glowRadius(stepDeg, 9),
  ]
}

// The same green to red to purple ramp as the risk legend, starting fully transparent.
const HEATMAP_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(22, 163, 74, 0)',
  0.2,
  RISK_COLORS.LOW,
  0.4,
  RISK_COLORS.MODERATE,
  0.6,
  RISK_COLORS.HIGH,
  0.8,
  RISK_COLORS.SEVERE,
  1,
  RISK_COLORS.NO_TRAVEL,
]

export const HEATMAP_OPACITY = 0.6

/** The paint values that stay the same while the slider moves. */
export function heatmapStaticPaint(stepDeg: number): HeatmapLayerSpecification['paint'] {
  return {
    'heatmap-radius': heatmapRadius(stepDeg),
    'heatmap-intensity': 1,
    'heatmap-color': HEATMAP_COLOR,
    'heatmap-opacity': HEATMAP_OPACITY,
  }
}

/** Only `heatmap-weight` depends on the hour and metric; the rest is passed through as is. */
export function heatmapPaint(
  metric: HeatmapMetric,
  hour: number,
  staticPaint: HeatmapLayerSpecification['paint'],
): HeatmapLayerSpecification['paint'] {
  return { ...staticPaint, 'heatmap-weight': heatmapWeight(metric, hour) }
}

/** `+12h - Wed 8 PM`: hours after the start, and the local weekday and hour they fall on. */
export function formatHourLabel(
  startIso: string,
  hour: number,
  timeZone?: string,
  locale?: string,
): string {
  const moment = new Date(new Date(startIso).getTime() + hour * MS_PER_HOUR)
  // A 24-hour locale prints a bare "17" for 5 PM, so it also gets the minutes: "17:00".
  const twentyFourHour = !new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
    .hour12
  const when = moment.toLocaleString(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: twentyFourHour ? '2-digit' : undefined,
    timeZone,
  })
  return `+${hour}h - ${when.replace(',', '').replace(/\s/g, ' ')}`
}
