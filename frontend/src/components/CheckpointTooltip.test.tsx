import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCheckpoint } from '../test/helpers'
import { CheckpointTooltip } from './CheckpointTooltip'

describe('CheckpointTooltip', () => {
  it('shows the route, the mile and the ETA', () => {
    render(<CheckpointTooltip routeId="B" checkpoint={makeCheckpoint({ mile: 125 })} />)

    expect(screen.getByText('Route B · mile 125')).toBeInTheDocument()
    expect(screen.getByText(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\d:\d\d/)).toBeInTheDocument()
  })

  it('shows the level, wind and rain', () => {
    render(
      <CheckpointTooltip
        routeId="A"
        checkpoint={makeCheckpoint({ level: 'HIGH', wind_mph: 38.5, rain_in_hr: 0.15 })}
      />,
    )

    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText(/Wind 38.5 mph · Rain 0.15 in\/hr/)).toBeInTheDocument()
  })

  it('mentions snow only when there is some', () => {
    const { rerender } = render(
      <CheckpointTooltip routeId="A" checkpoint={makeCheckpoint({ snow_in_hr: 0 })} />,
    )
    expect(screen.queryByText(/Snow/)).not.toBeInTheDocument()

    rerender(<CheckpointTooltip routeId="A" checkpoint={makeCheckpoint({ snow_in_hr: 0.75 })} />)

    expect(screen.getByText(/Snow 0.75 in\/hr/)).toBeInTheDocument()
  })

  it('shows n/a for missing weather', () => {
    render(
      <CheckpointTooltip
        routeId="A"
        checkpoint={makeCheckpoint({ wind_mph: null, rain_in_hr: null })}
      />,
    )

    expect(screen.getByText(/Wind n\/a · Rain n\/a/)).toBeInTheDocument()
  })
})
