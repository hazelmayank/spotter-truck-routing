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

describe('risk colors and labels', () => {
  it('cover exactly the five levels', () => {
    expect(Object.keys(RISK_COLORS).sort()).toEqual([...RISK_LEVELS].sort())
    expect(Object.keys(RISK_LABELS).sort()).toEqual([...RISK_LEVELS].sort())
  })

  it.each(RISK_LEVELS)('give %s a six-digit hex color', (level) => {
    expect(RISK_COLORS[level]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(RISK_LEVELS)('give %s a readable name that is not the raw enum value', (level) => {
    expect(RISK_LABELS[level]).toMatch(/^[A-Z][a-z]+( [a-z]+)?$/)
  })

  it('make a worse level darker or hotter than a calmer one in the order green, yellow, orange, red', () => {
    const [red, green] = [RISK_COLORS.SEVERE, RISK_COLORS.LOW].map((hex) =>
      parseInt(hex.slice(1, 3), 16),
    )

    expect(red).toBeGreaterThan(green) // severe has more red than low
  })
})
