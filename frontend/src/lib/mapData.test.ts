import { describe, expect, it } from 'vitest'
import { makePlan, makeRoute, makeThreeRoutePlan } from '../test/fixtures'
import {
  ENDPOINT_PAINT,
  LEVEL_COLOR_EXPRESSION,
  checkpointPaint,
  checkpointsGeoJson,
  endpointsGeoJson,
  planBounds,
  routeLinePaint,
  routesGeoJson,
} from './mapData'
import { RISK_COLORS } from './risk'

const plan = makeThreeRoutePlan()

describe('routesGeoJson', () => {
  it('has one line per route carrying its id, with the best route last so it draws on top', () => {
    const { features } = routesGeoJson(plan.routes)

    expect(features.map((feature) => feature.properties.id)).toEqual(['A', 'C', 'B'])
    expect(features.every((feature) => feature.geometry.type === 'LineString')).toBe(true)
    expect(features[2].geometry).toEqual(plan.routes[1].geometry)
  })
})

describe('checkpointsGeoJson', () => {
  const { features } = checkpointsGeoJson(plan.routes)

  it('has a point per checkpoint of every route, as [lon, lat]', () => {
    expect(features).toHaveLength(5)
    expect(features[0].geometry.coordinates).toEqual([-96.797, 32.7767])
  })

  it('carries the route id, the checkpoint index and the level, and nothing bulky', () => {
    const severe = features.find((feature) => feature.properties.level === 'SEVERE')

    expect(severe?.properties).toEqual({ routeId: 'A', index: 1, level: 'SEVERE' })
  })

  it('lists the recommended route last', () => {
    expect(features.at(-1)?.properties.routeId).toBe('B')
  })
})

describe('endpointsGeoJson', () => {
  it('has the origin and the destination as [lon, lat]', () => {
    const { features } = endpointsGeoJson(makePlan())

    expect(features.map((feature) => feature.properties.kind)).toEqual(['origin', 'destination'])
    expect(features[0].geometry.coordinates).toEqual([-96.797, 32.7767])
    expect(features[1].geometry.coordinates).toEqual([-104.9903, 39.7392])
  })
})

describe('planBounds', () => {
  it('covers every route', () => {
    const wide = makeRoute('A', 1, {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-110, 30],
          [-90, 45],
        ],
      },
    })

    expect(planBounds([makeRoute('B', 2), wide])).toEqual([
      [-110, 30],
      [-90, 45],
    ])
  })

  it('is null when there is nothing to fit', () => {
    expect(planBounds([])).toBeNull()
  })
})

describe('routeLinePaint', () => {
  const base = { recommended: false, hovered: false, selected: false, dimmed: false }

  it('draws the recommended route 6 px wide and the others 4 px', () => {
    expect(routeLinePaint({ ...base, recommended: true })?.['line-width']).toBe(6)
    expect(routeLinePaint(base)?.['line-width']).toBe(4)
  })

  it('makes other routes lighter than the recommended one', () => {
    const recommended = routeLinePaint({ ...base, recommended: true })
    const other = routeLinePaint(base)

    expect(recommended?.['line-color']).not.toBe(other?.['line-color'])
    expect(recommended?.['line-opacity']).toBe(1)
    expect(other?.['line-opacity']).toBeLessThan(1)
  })

  it.each(['hovered', 'selected'] as const)('thickens and solidifies a %s route', (state) => {
    const paint = routeLinePaint({ ...base, [state]: true })

    expect(paint?.['line-width']).toBe(6)
    expect(paint?.['line-opacity']).toBe(1)
    expect(paint?.['line-color']).not.toBe(routeLinePaint(base)?.['line-color'])
  })

  it('thickens an emphasized recommended route further', () => {
    expect(routeLinePaint({ ...base, recommended: true, hovered: true })?.['line-width']).toBe(8)
  })

  it('fades routes while another one is selected', () => {
    expect(routeLinePaint({ ...base, dimmed: true })?.['line-opacity']).toBe(0.4)
    expect(routeLinePaint({ ...base, recommended: true, dimmed: true })?.['line-opacity']).toBe(0.4)
  })
})

describe('checkpoint styling', () => {
  it('colors by level with a match expression built from the risk colors', () => {
    const expression: unknown[] = LEVEL_COLOR_EXPRESSION

    expect(expression.slice(0, 2)).toEqual(['match', ['get', 'level']])
    for (const [level, color] of Object.entries(RISK_COLORS)) {
      expect(expression[expression.indexOf(level) + 1]).toBe(color)
    }
  })

  it('uses the match expression with a white stroke', () => {
    const paint = checkpointPaint('B')

    expect(paint?.['circle-color']).toBe(LEVEL_COLOR_EXPRESSION)
    expect(paint?.['circle-stroke-color']).toBe('#ffffff')
  })

  it('enlarges and solidifies checkpoints of the active route only', () => {
    const paint = checkpointPaint('B')

    expect(paint?.['circle-radius']).toEqual(['case', ['==', ['get', 'routeId'], 'B'], 6, 4])
    expect(paint?.['circle-opacity']).toEqual(['case', ['==', ['get', 'routeId'], 'B'], 1, 0.55])
  })

  it('draws the origin as a filled dot and the destination as a ring', () => {
    expect(ENDPOINT_PAINT?.['circle-color']).toEqual([
      'match',
      ['get', 'kind'],
      'origin',
      '#0f172a',
      '#ffffff',
    ])
    expect(ENDPOINT_PAINT?.['circle-stroke-color']).toEqual([
      'match',
      ['get', 'kind'],
      'origin',
      '#ffffff',
      '#0f172a',
    ])
  })
})
