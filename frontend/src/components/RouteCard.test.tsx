import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeRoute, makeThreeRoutePlan } from '../test/fixtures'
import type { Route } from '../types'
import { RouteCard } from './RouteCard'

const [severeRoute, recommendedRoute] = makeThreeRoutePlan().routes // A (severe miles) and B

type CardProps = Partial<Parameters<typeof RouteCard>[0]>

function setup(props: CardProps = {}, route: Route = severeRoute) {
  const handlers = { onHover: vi.fn(), onSelect: vi.fn(), onShowCheckpoint: vi.fn() }
  const element = (overrides: CardProps) => (
    <ul>
      <RouteCard
        route={route}
        recommended={false}
        selected={false}
        hovered={false}
        activeCheckpointIndex={null}
        {...handlers}
        {...overrides}
      />
    </ul>
  )
  const view = render(element(props))
  return {
    ...handlers,
    user: userEvent.setup(),
    update: (overrides: CardProps) => view.rerender(element(overrides)),
  }
}

const card = () => screen.getByRole('button', { name: /^Route/ })

describe('RouteCard summary', () => {
  it('shows the route name and its rank', () => {
    setup()

    expect(card()).toHaveTextContent('Route A')
    expect(card()).toHaveTextContent('#3')
  })

  it('shows the Recommended badge for the recommended route', () => {
    setup({ recommended: true }, recommendedRoute)

    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('has no badge for other routes', () => {
    setup()

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
  })

  it('shows distance, drive time and local arrival', () => {
    setup({}, makeRoute('A', 1, { distance_mi: 798.1, duration_s: 45_360 }))

    expect(card()).toHaveTextContent('798.1 mi · 12 h 36 min')
    expect(card()).toHaveTextContent(/Arrives .*\d/)
  })

  it('shows severe and high miles as numbers', () => {
    setup()

    expect(card()).toHaveTextContent('Severe 96.6 mi · High 0.0 mi')
  })

  it('mentions no-travel miles only when there are some', () => {
    const route = makeRoute('A', 1, {
      summary: {
        miles_by_level: { LOW: 700, MODERATE: 0, HIGH: 10, SEVERE: 20, NO_TRAVEL: 5 },
        avg_risk: 0.5,
        max_level: 'NO_TRAVEL',
      },
    })
    setup({}, route)

    expect(card()).toHaveTextContent('Severe 20.0 mi · High 10.0 mi · No travel 5.0 mi')
  })

  it('shows the average risk and the highest level', () => {
    setup()

    expect(card()).toHaveTextContent('Average risk 0.360')
    expect(card()).toHaveTextContent('Max Severe')
  })

  it('draws a bar of the miles per risk level', () => {
    setup()

    expect(within(card()).getByRole('img')).toHaveAccessibleName(
      'Miles by risk level: Low 700.0 mi, Severe 96.6 mi',
    )
  })
})

describe('RouteCard interaction', () => {
  it('selects the route when clicked', async () => {
    const { user, onSelect } = setup()

    await user.click(card())

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('A')
  })

  it('reports hover and keyboard focus', async () => {
    const { user, onHover } = setup()

    await user.hover(card())
    await user.unhover(card())
    await user.tab()

    expect(onHover.mock.calls).toEqual([['A'], [null], ['A']])
  })

  it('shows whether it is selected', () => {
    setup({ selected: true })

    expect(card()).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('RouteCard checkpoint list', () => {
  const listName = 'Route A checkpoints'

  it('is not offered until the route is selected', () => {
    setup()

    expect(screen.queryByRole('button', { name: /Checkpoints/ })).not.toBeInTheDocument()
  })

  it('is offered collapsed for the selected route, with the checkpoint count', () => {
    setup({ selected: true })

    const toggle = screen.getByRole('button', { name: /Checkpoints \(2\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: listName })).not.toBeInTheDocument()
  })

  it('expands to a row per checkpoint and collapses again', async () => {
    const { user } = setup({ selected: true })
    const toggle = screen.getByRole('button', { name: /Checkpoints/ })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const rows = within(screen.getByRole('list', { name: listName })).getAllByRole('button')
    expect(rows).toHaveLength(2)

    await user.click(toggle)
    expect(screen.queryByRole('list', { name: listName })).not.toBeInTheDocument()
  })

  it('reports the route and index of a clicked row', async () => {
    const { user, onShowCheckpoint } = setup({ selected: true })
    await user.click(screen.getByRole('button', { name: /Checkpoints/ }))

    await user.click(screen.getByRole('button', { name: /Mile 25/ }))

    expect(onShowCheckpoint).toHaveBeenCalledExactlyOnceWith('A', 1)
  })

  it('marks the row whose popup is open', async () => {
    const { user } = setup({ selected: true, activeCheckpointIndex: 1 })
    await user.click(screen.getByRole('button', { name: /Checkpoints/ }))

    expect(screen.getByRole('button', { name: /Mile 25/ })).toHaveAttribute('aria-current', 'true')
  })

  it('is hidden when the route is deselected', async () => {
    const { user, update } = setup({ selected: true })
    await user.click(screen.getByRole('button', { name: /Checkpoints/ }))
    expect(screen.getByRole('list', { name: listName })).toBeInTheDocument()

    update({ selected: false })

    expect(screen.queryByRole('list', { name: listName })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Checkpoints/ })).not.toBeInTheDocument()
  })
})
