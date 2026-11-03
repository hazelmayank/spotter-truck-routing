import { describe, expect, it } from 'vitest'
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from './risk'

describe('risk levels', () => {
  it('are ordered from lowest to highest risk', () => {
    expect(RISK_LEVELS).toEqual(['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL'])
  })

  it('have the agreed colors', () => {
    expect(RISK_COLORS).toEqual({
      LOW: '#16a34a',
      MODERATE: '#facc15',
      HIGH: '#f97316',
      SEVERE: '#dc2626',
      NO_TRAVEL: '#3b0764',
    })
  })

  it('each have their own color and a readable label', () => {
    expect(new Set(Object.values(RISK_COLORS)).size).toBe(RISK_LEVELS.length)
    expect(RISK_LEVELS.map((level) => RISK_LABELS[level])).toEqual([
      'Low',
      'Moderate',
      'High',
      'Severe',
      'No travel',
    ])
  })
})
