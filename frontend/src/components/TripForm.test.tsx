import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanRequest } from '../types'
import { TripForm } from './TripForm'

beforeEach(() => {
  // Only Date is faked: user-event and testing-library still need real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 14, 20))
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(props: Partial<Parameters<typeof TripForm>[0]> = {}) {
  const onSubmit = vi.fn<(request: PlanRequest) => void>()
  const user = userEvent.setup()
  render(<TripForm isPending={false} onSubmit={onSubmit} {...props} />)
  return { user, onSubmit }
}

const field = (label: string) => screen.getByLabelText(label)

describe('defaults', () => {
  it('starts at the next full hour, 40,000 lb and every 25 miles', () => {
    setup()

    expect(field('Departure')).toHaveValue('2026-11-03T15:00')
    expect(field('Load weight (lb)')).toHaveValue(40000)
    expect(field('Checkpoint interval')).toHaveValue('25')
  })

  it('offers 10, 25 and 50 mile intervals', () => {
    setup()

    const options = screen.getAllByRole('option').map((option) => option.textContent)

    expect(options).toEqual(['Every 10 miles', 'Every 25 miles', 'Every 50 miles'])
  })
})

describe('validation', () => {
  it('shows nothing until a field is touched', () => {
    setup()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('validates a field when it loses focus', async () => {
    const { user } = setup()

    await user.clear(field('Load weight (lb)'))
    await user.type(field('Load weight (lb)'), '90000')
    await user.tab()

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 80,000.')
    expect(field('Load weight (lb)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the message as soon as the value is fixed', async () => {
    const { user } = setup()
    await user.clear(field('Load weight (lb)'))
    await user.tab()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(field('Load weight (lb)'), '40000')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('blocks the submit and lists every problem', async () => {
    const { user, onSubmit } = setup()

    await user.click(screen.getByRole('button', { name: 'Plan routes' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Enter an origin.',
      'Enter a destination.',
    ])
  })
})

describe('submit', () => {
  it('sends trimmed places, a UTC departure and numeric load and interval', async () => {
    const { user, onSubmit } = setup()
    await user.type(field('Origin'), '  Dallas, TX ')
    await user.type(field('Destination'), 'Denver, CO')
    await user.clear(field('Load weight (lb)'))
    await user.type(field('Load weight (lb)'), '42000')
    await user.selectOptions(field('Checkpoint interval'), '50')

    await user.click(screen.getByRole('button', { name: 'Plan routes' }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      origin: 'Dallas, TX',
      destination: 'Denver, CO',
      departure: new Date(2026, 10, 3, 15, 0).toISOString(),
      load_lb: 42000,
      interval_miles: 50,
    })
  })

  it('disables the submit button while a plan is loading', () => {
    setup({ isPending: true })

    expect(screen.getByRole('button', { name: 'Planning…' })).toBeDisabled()
  })
})

describe('sample trip', () => {
  it('fills Dallas, TX to Denver, CO and keeps the other settings', async () => {
    const { user, onSubmit } = setup()
    await user.selectOptions(field('Checkpoint interval'), '10')

    await user.click(screen.getByRole('button', { name: 'Use sample trip' }))

    expect(field('Origin')).toHaveValue('Dallas, TX')
    expect(field('Destination')).toHaveValue('Denver, CO')
    expect(field('Checkpoint interval')).toHaveValue('10')
    await user.click(screen.getByRole('button', { name: 'Plan routes' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})

describe('server errors', () => {
  const serverErrors = { departure: ['Include a timezone, for example 2026-11-03T08:00:00Z.'] }

  it('shows the message under the field after a submit', async () => {
    const { user } = setup({ serverErrors })
    await user.click(screen.getByRole('button', { name: 'Use sample trip' }))

    await user.click(screen.getByRole('button', { name: 'Plan routes' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Include a timezone')
  })

  it('hides the message once the field is edited', async () => {
    const { user } = setup({ serverErrors })
    await user.click(screen.getByRole('button', { name: 'Use sample trip' }))
    await user.click(screen.getByRole('button', { name: 'Plan routes' }))

    fireEvent.change(field('Departure'), { target: { value: '2026-11-04T08:00' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
