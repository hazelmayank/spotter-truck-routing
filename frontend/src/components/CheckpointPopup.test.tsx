import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCheckpoint } from '../test/helpers'
import { CheckpointPopup } from './CheckpointPopup'

describe('CheckpointPopup', () => {
  it('shows the route, the mile and the local ETA', () => {
    render(<CheckpointPopup routeId="B" checkpoint={makeCheckpoint({ mile: 125 })} />)

    expect(screen.getByText('Route B · mile 125')).toBeInTheDocument()
    expect(screen.getByText(/Nov \d+/)).toBeInTheDocument()
  })

  it('shows wind with gusts, rain and snow', () => {
    render(
      <CheckpointPopup
        routeId="A"
        checkpoint={makeCheckpoint({
          wind_mph: 38.5,
          gust_mph: 51,
          rain_in_hr: 0.15,
          snow_in_hr: 0.5,
        })}
      />,
    )

    expect(screen.getByText('38.5 mph (gusts 51 mph)')).toBeInTheDocument()
    expect(screen.getByText('0.15 in/hr')).toBeInTheDocument()
    expect(screen.getByText('0.5 in/hr')).toBeInTheDocument()
  })

  it('shows the level by name', () => {
    render(<CheckpointPopup routeId="A" checkpoint={makeCheckpoint({ level: 'NO_TRAVEL' })} />)

    expect(screen.getByText('No travel')).toBeInTheDocument()
  })

  it('lists the reasons', () => {
    const reasons = [
      'wind 47 mph: Severe',
      'wind 47 mph with 35,000 lb load: No Travel (load rule)',
    ]
    render(<CheckpointPopup routeId="A" checkpoint={makeCheckpoint({ reasons })} />)

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(reasons)
  })

  it('has no reasons list when there are none', () => {
    render(<CheckpointPopup routeId="A" checkpoint={makeCheckpoint({ reasons: [] })} />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows wind without gusts when the gust is missing, and n/a for missing values', () => {
    render(
      <CheckpointPopup
        routeId="A"
        checkpoint={makeCheckpoint({
          wind_mph: 12,
          gust_mph: null,
          rain_in_hr: null,
          snow_in_hr: null,
        })}
      />,
    )

    expect(screen.getByText('12 mph')).toBeInTheDocument()
    expect(screen.getAllByText('n/a')).toHaveLength(2)
  })

  it('shows n/a for wind when it is missing', () => {
    render(
      <CheckpointPopup routeId="A" checkpoint={makeCheckpoint({ wind_mph: null, gust_mph: 20 })} />,
    )

    expect(screen.getAllByText('n/a')).toHaveLength(1)
  })
})
