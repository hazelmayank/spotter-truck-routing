import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { makeFocus } from '../test/focus'
import { makeThreeRoutePlan } from '../test/fixtures'
import { ResultsPanel } from './ResultsPanel'

// Each route card renders exactly one RiskBar, so its renders count the card's renders.
const riskBarRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock('./RiskBar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./RiskBar')>()
  return {
    RiskBar: (props: Parameters<typeof actual.RiskBar>[0]) => {
      riskBarRenders.count += 1
      return actual.RiskBar(props)
    },
  }
})

const plan = makeThreeRoutePlan()

function setup(props: Partial<Parameters<typeof ResultsPanel>[0]> = {}) {
  const onRetry = vi.fn()
  const focus = props.focus ?? makeFocus()
  render(
    <ResultsPanel
      plan={plan}
      error={null}
      isPending={false}
      focus={focus}
      onRetry={onRetry}
      {...props}
    />,
  )
  return { onRetry, focus, user: userEvent.setup() }
}

describe('empty state', () => {
  it('explains what to do before the first search', () => {
    setup({ plan: undefined })

    expect(screen.getByText('No trip planned yet')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Routes' })).not.toBeInTheDocument()
  })

  it('is also shown when the only error is about form fields', () => {
    setup({
      plan: undefined,
      error: new ApiError('Some fields need attention.', 400, { load_lb: ['x'] }),
    })

    expect(screen.getByText('No trip planned yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('loading state', () => {
  it('shows the step text and placeholder cards instead of results', () => {
    setup({ isPending: true })

    expect(screen.getByRole('status')).toHaveTextContent('Finding places…')
    expect(screen.queryByRole('list', { name: 'Routes' })).not.toBeInTheDocument()
  })

  it('takes priority over an earlier plan', () => {
    setup({ isPending: true, plan })

    expect(screen.queryByRole('heading', { name: 'Route B' })).not.toBeInTheDocument()
  })
})

describe('error state', () => {
  const error = new ApiError(
    'The routing service is not responding. Please try again in a moment.',
    502,
  )

  it('shows the API message with a retry button', async () => {
    const { user, onRetry } = setup({ plan: undefined, error })

    expect(screen.getByRole('alert')).toHaveTextContent('The routing service is not responding.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows a 422 message from the API', () => {
    setup({ plan: undefined, error: new ApiError("no match for 'Nowhereville'", 422) })

    expect(screen.getByRole('alert')).toHaveTextContent("no match for 'Nowhereville'")
  })

  it('shows a network failure', () => {
    setup({ plan: undefined, error: new ApiError('Could not reach the server.', 0) })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.')
  })
})

describe('results', () => {
  it('shows the recommendation above the routes', () => {
    setup()

    expect(screen.getByRole('heading', { name: 'Route B' })).toBeInTheDocument()
    expect(screen.getByText(plan.explanation)).toBeInTheDocument()
  })

  it('lists the routes in rank order', () => {
    setup()

    const cards = within(screen.getByRole('list', { name: 'Routes' })).getAllByRole('button', {
      name: /^Route/,
    })

    expect(cards.map((card) => card.textContent?.slice(0, 7))).toEqual([
      'Route B',
      'Route C',
      'Route A',
    ])
  })

  it('badges only the recommended route', () => {
    setup()

    const badges = within(screen.getByRole('list', { name: 'Routes' })).getAllByText('Recommended')

    expect(badges).toHaveLength(1)
    expect(badges[0].closest('li')).toHaveTextContent('Route B')
  })

  it('passes selection and hover to the cards', () => {
    setup({ focus: makeFocus({ selectedId: 'C', hoveredId: 'A' }) })

    expect(screen.getByRole('button', { name: /^Route C/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Route A/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('selects a route when its card is clicked', async () => {
    const { user, focus } = setup()

    await user.click(screen.getByRole('button', { name: /^Route A/ }))

    expect(focus.select).toHaveBeenCalledExactlyOnceWith('A')
  })

  it('opens a checkpoint from the list as a list pick, so the map flies to it', async () => {
    const { user, focus } = setup({ focus: makeFocus({ selectedId: 'A' }) })
    await user.click(screen.getByRole('button', { name: /Checkpoints/ }))

    await user.click(screen.getByRole('button', { name: /Mile 25/ }))

    expect(focus.showCheckpoint).toHaveBeenCalledExactlyOnceWith({
      routeId: 'A',
      index: 1,
      source: 'list',
    })
  })

  it('marks the open checkpoint in its route list', async () => {
    const { user } = setup({
      focus: makeFocus({ selectedId: 'A', checkpoint: { routeId: 'A', index: 1, source: 'map' } }),
    })
    await user.click(screen.getByRole('button', { name: /Checkpoints/ }))

    expect(screen.getByRole('button', { name: /Mile 25/ })).toHaveAttribute('aria-current', 'true')
  })

  it('mentions when the plan is from an earlier visit', () => {
    setup({ restoredAt: '2026-11-03T14:20:00Z' })

    expect(screen.getByText(/Showing the plan from/)).toBeInTheDocument()
  })
})

describe('re-rendering', () => {
  const panel = (focus: ReturnType<typeof makeFocus>) => (
    <ResultsPanel plan={plan} error={null} isPending={false} focus={focus} onRetry={() => {}} />
  )

  it('hovering a route re-renders only that route card', () => {
    const focus = makeFocus()
    const { rerender } = render(panel(focus))
    const before = riskBarRenders.count

    rerender(panel({ ...focus, hoveredId: 'A' }))

    expect(riskBarRenders.count - before).toBe(1)
  })

  it('moving the hover from one route to another re-renders just those two cards', () => {
    const focus = makeFocus({ hoveredId: 'A' })
    const { rerender } = render(panel(focus))
    const before = riskBarRenders.count

    rerender(panel({ ...focus, hoveredId: 'B' }))

    expect(riskBarRenders.count - before).toBe(2)
  })

  it('re-rendering the panel with unchanged focus re-renders no route card', () => {
    const focus = makeFocus({ selectedId: 'C' })
    const { rerender } = render(panel(focus))
    const before = riskBarRenders.count

    rerender(panel({ ...focus }))

    expect(riskBarRenders.count).toBe(before)
  })

  it('opening a checkpoint re-renders only the card of its route', () => {
    const focus = makeFocus({ selectedId: 'A' })
    const { rerender } = render(panel(focus))
    const before = riskBarRenders.count

    rerender(panel({ ...focus, checkpoint: { routeId: 'A', index: 1, source: 'map' } }))

    expect(riskBarRenders.count - before).toBe(1)
  })
})
