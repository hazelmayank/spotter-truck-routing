import { describe, expect, it } from 'vitest'
import { makeHeatmapResponse } from '../test/helpers'
import {
  HEATMAP_OPACITY,
  METRIC_ORDER,
  METRICS,
  formatHourLabel,
  heatmapGeoJson,
  heatmapPaint,
  heatmapRadius,
  heatmapStaticPaint,
  heatmapWeight,
} from './heatmap'
import { RISK_COLORS } from './risk'

describe('heatmapGeoJson', () => {
  const geojson = heatmapGeoJson(makeHeatmapResponse())

  it('has one point feature per grid point, as [lon, lat]', () => {
    expect(geojson.features).toHaveLength(2)
    expect(geojson.features[0].geometry).toEqual({ type: 'Point', coordinates: [-100, 35] })
    expect(geojson.features[1].geometry.coordinates).toEqual([-101, 36])
  })

  it('has every hour of every metric as a property: r, w, p and s for hours 0 to 48', () => {
    const properties = geojson.features[0].properties

    expect(Object.keys(properties)).toHaveLength(4 * 49)
    for (const prefix of ['r', 'w', 'p', 's']) {
      expect(properties).toHaveProperty(`${prefix}0`)
      expect(properties).toHaveProperty(`${prefix}48`)
      expect(properties).not.toHaveProperty(`${prefix}49`)
    }
  })

  it('maps each property to the matching value in the response', () => {
    const properties = geojson.features[0].properties

    expect(properties.r0).toBe(0)
    expect(properties.r30).toBe(3)
    expect(properties.r48).toBe(4)
    expect(properties.w12).toBe(12)
    expect(properties.p10).toBeCloseTo(0.2)
    expect(properties.s20).toBeCloseTo(1)
  })

  it('has only the hourly values, nothing else', () => {
    const names = Object.keys(geojson.features[0].properties)

    expect(names.every((name) => /^[rwps]\d+$/.test(name))).toBe(true)
  })

  it('stops at the last hour the response has', () => {
    const { features } = heatmapGeoJson(makeHeatmapResponse(11))

    expect(features[0].properties).toHaveProperty('r10')
    expect(features[0].properties).not.toHaveProperty('r11')
    expect(Object.keys(features[0].properties)).toHaveLength(4 * 11)
  })

  it('is empty for a response without points', () => {
    expect(
      heatmapGeoJson({ start: '2026-11-03T12:00:00Z', hours: 49, step_deg: 0.25, points: [] })
        .features,
    ).toEqual([])
  })
})

describe('metrics', () => {
  it('lists risk first, then wind, rain and snow', () => {
    expect(METRIC_ORDER).toEqual(['risk', 'wind', 'rain', 'snow'])
  })

  it('scales each metric to its no-travel threshold', () => {
    expect(METRICS.risk.max).toBe(4)
    expect(METRICS.wind.max).toBe(55)
    expect(METRICS.rain.max).toBe(1)
    expect(METRICS.snow.max).toBe(3)
  })

  it('has a distinct property prefix per metric', () => {
    expect(new Set(METRIC_ORDER.map((metric) => METRICS[metric].prefix)).size).toBe(4)
  })
})

describe('heatmapWeight', () => {
  it.each([
    ['risk', 12, 'r12', 4],
    ['wind', 30, 'w30', 55],
    ['rain', 0, 'p0', 1],
    ['snow', 48, 's48', 3],
  ] as const)(
    'reads the %s property of hour %i and divides it by %i-scale max',
    (metric, hour, property, max) => {
      expect(heatmapWeight(metric, hour)).toEqual([
        'min',
        1,
        ['/', ['to-number', ['get', property], 0], max],
      ])
    },
  )

  it('differs between hours only in the property name', () => {
    expect(JSON.stringify(heatmapWeight('wind', 5))).toBe(
      JSON.stringify(heatmapWeight('wind', 6)).replace('w6', 'w5'),
    )
  })
})

describe('heatmapPaint', () => {
  const staticPaint = heatmapStaticPaint(0.25)

  it('uses the weight expression for the hour and metric', () => {
    expect(heatmapPaint('wind', 7, staticPaint)?.['heatmap-weight']).toEqual(
      heatmapWeight('wind', 7),
    )
  })

  it('draws at 0.6 opacity', () => {
    expect(HEATMAP_OPACITY).toBe(0.6)
    expect(heatmapPaint('risk', 0, staticPaint)?.['heatmap-opacity']).toBe(0.6)
  })

  it('keeps the glow brightness the same at every zoom', () => {
    expect(staticPaint?.['heatmap-intensity']).toBe(1)
  })

  it('changes nothing but the weight from one hour to the next', () => {
    const first = heatmapPaint('risk', 3, staticPaint)!
    const second = heatmapPaint('risk', 4, staticPaint)!

    for (const key of [
      'heatmap-radius',
      'heatmap-intensity',
      'heatmap-color',
      'heatmap-opacity',
    ] as const) {
      expect(second[key]).toBe(first[key]) // the same object, so nothing is re-sent to the map
    }
    expect(second['heatmap-weight']).not.toEqual(first['heatmap-weight'])
  })

  it('colors the density with the risk legend ramp, from transparent green to purple', () => {
    const ramp = staticPaint?.['heatmap-color'] as unknown[]

    expect(ramp.slice(0, 3)).toEqual(['interpolate', ['linear'], ['heatmap-density']])
    const stops = ramp.slice(3)
    expect(stops[0]).toBe(0)
    expect(stops[1]).toBe('rgba(22, 163, 74, 0)')
    expect(stops.filter((_, index) => index % 2 === 1).slice(1)).toEqual([
      RISK_COLORS.LOW,
      RISK_COLORS.MODERATE,
      RISK_COLORS.HIGH,
      RISK_COLORS.SEVERE,
      RISK_COLORS.NO_TRAVEL,
    ])
  })

  it('starts the ramp from the same green as the LOW level', () => {
    expect(RISK_COLORS.LOW).toBe('#16a34a') // rgb(22, 163, 74)
  })
})

describe('heatmapRadius', () => {
  const stops = (stepDeg: number) => {
    const expression = heatmapRadius(stepDeg) as unknown[]
    expect(expression.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']])
    const pairs = expression.slice(3) as number[]
    return Object.fromEntries(
      pairs.flatMap((value, index) => (index % 2 === 0 ? [[value, pairs[index + 1]]] : [])),
    )
  }

  it('is twice the grid spacing in pixels, so neighbouring glows blend', () => {
    const spacingAtZoom6 = (0.25 * 512 * 2 ** 6) / 360

    expect(stops(0.25)[6]).toBeCloseTo(2 * spacingAtZoom6)
  })

  it('grows with the zoom level', () => {
    const radii = Object.entries(stops(0.25)).map(([zoom, radius]) => [Number(zoom), radius])

    expect(radii.map(([zoom]) => zoom)).toEqual([3, 4, 5, 6, 7, 8, 9])
    const pixels = radii.map(([, radius]) => radius)
    expect(pixels).toEqual([...pixels].sort((a, b) => a - b))
  })

  it('is twice as large for a grid twice as coarse', () => {
    expect(stops(0.5)[5]).toBeCloseTo(2 * stops(0.25)[5])
  })

  it('stops growing at 300 pixels', () => {
    expect(stops(0.5)[9]).toBe(300)
    expect(Math.max(...Object.values(stops(0.25)))).toBeLessThanOrEqual(300)
  })
})

describe('formatHourLabel', () => {
  const start = '2026-11-03T12:00:00Z'

  it.each([
    [0, '+0h - Tue 6 AM'],
    [12, '+12h - Tue 6 PM'],
    [24, '+24h - Wed 6 AM'],
    [48, '+48h - Thu 6 AM'],
  ])('hour %i reads "%s" in Chicago time', (hour, label) => {
    expect(formatHourLabel(start, hour, 'America/Chicago')).toBe(label)
  })

  it('moves to the next weekday when the timezone is ahead of UTC', () => {
    expect(formatHourLabel(start, 12, 'Asia/Kolkata')).toBe('+12h - Wed 5 AM')
  })

  it('adds the minutes in a 24-hour locale, where a bare hour reads "Wed 17"', () => {
    expect(formatHourLabel(start, 12, 'Europe/London', 'en-GB')).toBe('+12h - Wed 00:00')
    expect(formatHourLabel(start, 5, 'Europe/London', 'en-GB')).toBe('+5h - Tue 17:00')
  })

  it('keeps the plain hour in a 12-hour locale', () => {
    expect(formatHourLabel(start, 5, 'America/Chicago', 'en-US')).toBe('+5h - Tue 11 AM')
  })
})
