import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RouteSummary } from '../types'
import { RiskBar } from './RiskBar'

const miles = (
  overrides: Partial<RouteSummary['miles_by_level']>,
): RouteSummary['miles_by_level'] => ({
  LOW: 0,
  MODERATE: 0,
  HIGH: 0,
  SEVERE: 0,
  NO_TRAVEL: 0,
  ...overrides,
})

describe('RiskBar', () => {
  it('describes only the levels that have miles', () => {
    render(<RiskBar milesByLevel={miles({ LOW: 90, SEVERE: 10.5 })} />)

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Miles by risk level: Low 90.0 mi, Severe 10.5 mi',
    )
  })

  it('sizes each segment by its share of the miles', () => {
    render(<RiskBar milesByLevel={miles({ LOW: 75, HIGH: 25 })} />)

    const widths = Array.from(screen.getByRole('img').children).map(
      (segment) => (segment as HTMLElement).style.width,
    )
    expect(widths).toEqual(['75%', '25%'])
  })

  it('draws no segments for a route without miles', () => {
    render(<RiskBar milesByLevel={miles({})} />)

    expect(screen.getByRole('img').children).toHaveLength(0)
  })
})
