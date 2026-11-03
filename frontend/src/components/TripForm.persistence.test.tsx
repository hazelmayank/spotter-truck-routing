import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { loadTripValues, saveTripValues } from '../lib/saved'
import { TripForm } from './TripForm'

const field = (label: string) => screen.getByLabelText(label)

describe('TripForm across a refresh', () => {
  it('shows the values saved before the refresh', () => {
    saveTripValues({
      origin: 'Dallas, TX',
      destination: 'Denver, CO',
      departure: '2026-11-03T15:00',
      load_lb: '42000',
      interval_miles: '50',
    })

    render(<TripForm isPending={false} onSubmit={vi.fn()} />)

    expect(field('Origin')).toHaveValue('Dallas, TX')
    expect(field('Destination')).toHaveValue('Denver, CO')
    expect(field('Departure')).toHaveValue('2026-11-03T15:00')
    expect(field('Load weight (lb)')).toHaveValue(42000)
    expect(field('Checkpoint interval')).toHaveValue('50')
  })

  it('saves what is typed', async () => {
    const user = userEvent.setup()
    render(<TripForm isPending={false} onSubmit={vi.fn()} />)

    await user.type(field('Origin'), 'Austin, TX')
    await user.selectOptions(field('Checkpoint interval'), '10')

    expect(loadTripValues()).toMatchObject({ origin: 'Austin, TX', interval_miles: '10' })
  })

  it('saves the sample trip', async () => {
    const user = userEvent.setup()
    render(<TripForm isPending={false} onSubmit={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Use sample trip' }))

    expect(loadTripValues()).toMatchObject({ origin: 'Dallas, TX', destination: 'Denver, CO' })
  })

  it('starts from the defaults when the saved entry is unusable', () => {
    sessionStorage.setItem('trip-form', JSON.stringify({ origin: 5 }))

    render(<TripForm isPending={false} onSubmit={vi.fn()} />)

    expect(field('Origin')).toHaveValue('')
    expect(field('Load weight (lb)')).toHaveValue(40000)
    expect(field('Checkpoint interval')).toHaveValue('25')
  })
})
