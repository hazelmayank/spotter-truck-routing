import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { QueryWrapper } from './test/QueryWrapper'
import { jsonResponse, makePlan, stubFetch } from './test/helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function planSampleTrip() {
  const user = userEvent.setup()
  render(<App />, { wrapper: QueryWrapper })
  await user.click(screen.getByRole('button', { name: 'Use sample trip' }))
  await user.click(screen.getByRole('button', { name: 'Plan routes' }))
}

it('lays out the form and the map area', () => {
  render(<App />, { wrapper: QueryWrapper })

  expect(screen.getByRole('heading', { name: 'Weather-Aware Truck Routing' })).toBeInTheDocument()
  expect(screen.getByRole('complementary')).toContainElement(screen.getByLabelText('Origin'))
  expect(screen.getByRole('main', { name: 'Map' })).toBeInTheDocument()
})

it('shows the recommendation and warnings after planning', async () => {
  const plan = makePlan({ warnings: ['Weather data was missing at 2 checkpoint(s).'] })
  const fetchMock = stubFetch(jsonResponse(plan))

  await planSampleTrip()

  expect(await screen.findByText(plan.explanation)).toBeInTheDocument()
  expect(screen.getByText(plan.warnings[0])).toBeInTheDocument()
  const body = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  )
  expect(body).toMatchObject({ origin: 'Dallas, TX', destination: 'Denver, CO', load_lb: 40000 })
})

it('shows the backend message when the plan fails', async () => {
  stubFetch(jsonResponse({ error: "no match for 'Dallas, TX'" }, 422))

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent("no match for 'Dallas, TX'")
})

it('shows a service failure message from a 502', async () => {
  const message = 'The weather service is not responding. Please try again in a moment.'
  stubFetch(jsonResponse({ error: message }, 502))

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent(message)
})

it('shows field errors next to the field, not as a banner', async () => {
  stubFetch(
    jsonResponse({ departure: ['Include a timezone, for example 2026-11-03T08:00:00Z.'] }, 400),
  )

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent('Include a timezone')
  expect(screen.getByLabelText('Departure')).toHaveAttribute('aria-invalid', 'true')
})

it('disables the submit button while planning', async () => {
  const user = userEvent.setup()
  stubFetch(new Response(null))
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  render(<App />, { wrapper: QueryWrapper })
  await user.click(screen.getByRole('button', { name: 'Use sample trip' }))

  await user.click(screen.getByRole('button', { name: 'Plan routes' }))

  expect(await screen.findByRole('button', { name: 'Planning…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Planning routes')
})
