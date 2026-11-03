import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makePlan, makeRoute, makeThreeRoutePlan } from '../test/fixtures'
import type { Route } from '../types'
import { RecommendationBanner } from './RecommendationBanner'

const withNoTravelMiles = (id: string): Route =>
  makeRoute(id, 1, {
    summary: {
      miles_by_level: { LOW: 700, MODERATE: 0, HIGH: 0, SEVERE: 0, NO_TRAVEL: 50 },
      avg_risk: 0.5,
      max_level: 'NO_TRAVEL',
    },
  })

describe('RecommendationBanner', () => {
  it('names the recommended route and gives the explanation from the API', () => {
    const plan = makeThreeRoutePlan()

    render(<RecommendationBanner plan={plan} />)

    expect(screen.getByRole('heading', { name: 'Route B' })).toBeInTheDocument()
    expect(screen.getByText(plan.explanation)).toBeInTheDocument()
  })

  it('has no alert when there are no warnings', () => {
    render(<RecommendationBanner plan={makeThreeRoutePlan()} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows warnings in amber when some route is clear of no-travel weather', () => {
    const plan = {
      ...makeThreeRoutePlan(),
      warnings: ['Weather data was missing at 2 checkpoint(s).'],
    }

    render(<RecommendationBanner plan={plan} />)

    const warning = screen.getByText('Weather data was missing at 2 checkpoint(s).')
    expect(warning).toHaveClass('bg-amber-50')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows warnings as a red alert when every route has no-travel miles', () => {
    const plan = makePlan({
      routes: [withNoTravelMiles('A'), withNoTravelMiles('B')],
      warnings: ['Every route has no-travel weather; consider departing later.'],
    })

    render(<RecommendationBanner plan={plan} />)

    expect(screen.getByRole('alert')).toHaveTextContent('consider departing later')
    expect(screen.getByRole('alert')).toHaveClass('bg-red-50')
  })

  it('lists every warning', () => {
    const plan = makePlan({ warnings: ['First warning.', 'Second warning.'] })

    render(<RecommendationBanner plan={plan} />)

    expect(screen.getByText('First warning.')).toBeInTheDocument()
    expect(screen.getByText('Second warning.')).toBeInTheDocument()
  })

  it('says when the plan was loaded from an earlier visit', () => {
    render(<RecommendationBanner plan={makePlan()} restoredAt="2026-11-03T14:20:00Z" />)

    expect(
      screen.getByText(/Showing the plan from .*Plan again for current weather\./),
    ).toBeInTheDocument()
  })

  it('does not mention an earlier visit for a fresh plan', () => {
    render(<RecommendationBanner plan={makePlan()} />)

    expect(screen.queryByText(/Showing the plan from/)).not.toBeInTheDocument()
  })
})
