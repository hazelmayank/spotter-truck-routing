import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { QueryWrapper } from './test/QueryWrapper'
import { jsonResponse, makePlan, makeThreeRoutePlan, stubFetch } from './test/helpers'

// The real map needs WebGL; this stand-in exposes what App passes to it.
vi.mock('./components/MapView', () => ({
  default: (props: {
    plan?: { routes: unknown[] }
    hoveredId: string | null
    selectedId: string | null
    checkpoint: { routeId: string; index: number; source: string } | null
  }) => (
    <div
      data-testid="map"
      data-routes={props.plan?.routes.length ?? 0}
      data-hovered={props.hoveredId ?? ''}
      data-selected={props.selectedId ?? ''}
      data-checkpoint={
        props.checkpoint
          ? `${props.checkpoint.routeId}:${props.checkpoint.index}:${props.checkpoint.source}`
          : ''
      }
    />
  ),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

const plan = makeThreeRoutePlan()

function renderApp() {
  const user = userEvent.setup()
  render(<App />, { wrapper: QueryWrapper })
  return user
}

async function planSampleTrip(user = renderApp()) {
  await user.click(screen.getByRole('button', { name: 'Use sample trip' }))
  await user.click(screen.getByRole('button', { name: 'Plan routes' }))
  return user
}

const requestBody = (fetchMock: ReturnType<typeof stubFetch>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string)

it('lays out the form, the results area and the map', () => {
  renderApp()

  expect(screen.getByRole('heading', { name: 'Weather-Aware Truck Routing' })).toBeInTheDocument()
  expect(screen.getByRole('complementary')).toContainElement(screen.getByLabelText('Origin'))
  expect(screen.getByRole('main', { name: 'Map' })).toBeInTheDocument()
})

it('invites a first search with an empty state', () => {
  renderApp()

  expect(screen.getByText('No trip planned yet')).toBeInTheDocument()
})

it('shows progress and placeholder cards while planning', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  const user = renderApp()
  await user.click(screen.getByRole('button', { name: 'Use sample trip' }))

  await user.click(screen.getByRole('button', { name: 'Plan routes' }))

  expect(await screen.findByRole('button', { name: 'Planning…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Finding places…')
  expect(screen.queryByText('No trip planned yet')).not.toBeInTheDocument()
})

it('shows the recommendation and a card per route after planning', async () => {
  const fetchMock = stubFetch(jsonResponse(plan))

  await planSampleTrip()

  expect(await screen.findByRole('heading', { name: 'Route B' })).toBeInTheDocument()
  expect(screen.getByText(plan.explanation)).toBeInTheDocument()
  const routes = screen.getByRole('list', { name: 'Routes' })
  expect(routes.querySelectorAll(':scope > li')).toHaveLength(3)
  expect(requestBody(fetchMock)).toMatchObject({
    origin: 'Dallas, TX',
    destination: 'Denver, CO',
    load_lb: 40000,
  })
})

it('gives the plan to the map', async () => {
  stubFetch(jsonResponse(plan))

  await planSampleTrip()

  const map = await screen.findByTestId('map')
  await waitFor(() => expect(map).toHaveAttribute('data-routes', '3'))
})

it('shows warnings from the API', async () => {
  stubFetch(jsonResponse({ ...plan, warnings: ['Weather data was missing at 2 checkpoint(s).'] }))

  await planSampleTrip()

  expect(
    await screen.findByText('Weather data was missing at 2 checkpoint(s).'),
  ).toBeInTheDocument()
})

it('shows the backend message with a retry button when planning fails', async () => {
  stubFetch(jsonResponse({ error: "no match for 'Dallas, TX'" }, 422))

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent("no match for 'Dallas, TX'")
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

it('shows a service failure message from a 502', async () => {
  const message = 'The weather service is not responding. Please try again in a moment.'
  stubFetch(jsonResponse({ error: message }, 502))

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent(message)
})

it('retries the same request when Retry is chosen', async () => {
  const fetchMock = stubFetch(jsonResponse({ error: 'no route found' }, 422), jsonResponse(plan))
  const user = await planSampleTrip()

  await user.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('heading', { name: 'Route B' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(requestBody(fetchMock, 1)).toEqual(requestBody(fetchMock, 0))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows field errors next to the field, not as a results error', async () => {
  stubFetch(
    jsonResponse({ departure: ['Include a timezone, for example 2026-11-03T08:00:00Z.'] }, 400),
  )

  await planSampleTrip()

  expect(await screen.findByRole('alert')).toHaveTextContent('Include a timezone')
  expect(screen.getByLabelText('Departure')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
})

it('tells the map which route card is hovered or selected', async () => {
  stubFetch(jsonResponse(plan))
  const user = await planSampleTrip()
  const map = await screen.findByTestId('map')
  const cardA = await screen.findByRole('button', { name: /^Route A/ })

  await user.hover(cardA)
  expect(map).toHaveAttribute('data-hovered', 'A')
  await user.unhover(cardA)
  expect(map).toHaveAttribute('data-hovered', '')

  await user.click(cardA)
  expect(map).toHaveAttribute('data-selected', 'A')
})

it('opens a checkpoint on the map when a row of the selected route is chosen', async () => {
  stubFetch(jsonResponse(plan))
  const user = await planSampleTrip()
  await user.click(await screen.findByRole('button', { name: /^Route A/ }))
  await user.click(screen.getByRole('button', { name: /Checkpoints/ }))

  await user.click(screen.getByRole('button', { name: /Mile 25/ }))

  expect(screen.getByTestId('map')).toHaveAttribute('data-checkpoint', 'A:1:list')
})

it('clears the selection when a new plan is requested', async () => {
  stubFetch(jsonResponse(plan), jsonResponse(makeThreeRoutePlan()))
  const user = await planSampleTrip()
  await user.click(await screen.findByRole('button', { name: /^Route C/ }))
  expect(await screen.findByTestId('map')).toHaveAttribute('data-selected', 'C')

  await user.click(screen.getByRole('button', { name: 'Plan routes' }))

  await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-selected', ''))
})

it('hides the previous results while a new plan is being made', async () => {
  const user = await planSampleTrip((stubFetch(jsonResponse(plan)), renderApp()))
  await screen.findByRole('heading', { name: 'Route B' })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )

  await user.click(screen.getByRole('button', { name: 'Plan routes' }))

  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Route B' })).not.toBeInTheDocument()
})

it('keeps the form and the results after a page refresh', async () => {
  stubFetch(jsonResponse(plan))
  await planSampleTrip()
  await screen.findByRole('heading', { name: 'Route B' })
  cleanup() // the page is closed

  vi.unstubAllGlobals()
  const fetchMock = stubFetch()
  renderApp() // the page is opened again

  expect(screen.getByLabelText('Origin')).toHaveValue('Dallas, TX')
  expect(screen.getByLabelText('Destination')).toHaveValue('Denver, CO')
  expect(screen.getByRole('heading', { name: 'Route B' })).toBeInTheDocument()
  expect(screen.getByText(plan.explanation)).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'Routes' }).querySelectorAll(':scope > li')).toHaveLength(
    3,
  )
  expect(screen.getByText(/Showing the plan from/)).toBeInTheDocument()
  expect(await screen.findByTestId('map')).toHaveAttribute('data-routes', '3')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('replaces the restored plan, and its note, when a new plan is made', async () => {
  stubFetch(jsonResponse(plan))
  await planSampleTrip()
  await screen.findByRole('heading', { name: 'Route B' })
  cleanup()
  vi.unstubAllGlobals()
  const newer = makePlan({
    recommended_route_id: 'A',
    explanation: 'Route A is the only route found.',
  })
  stubFetch(jsonResponse(newer))
  const user = renderApp()
  expect(screen.getByText(/Showing the plan from/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Plan routes' }))

  expect(await screen.findByText('Route A is the only route found.')).toBeInTheDocument()
  expect(screen.queryByText(/Showing the plan from/)).not.toBeInTheDocument()
})

it('starts empty on a first visit', () => {
  renderApp()

  expect(screen.getByLabelText('Origin')).toHaveValue('')
  expect(screen.getByText('No trip planned yet')).toBeInTheDocument()
  expect(screen.queryByText(/Showing the plan from/)).not.toBeInTheDocument()
})
