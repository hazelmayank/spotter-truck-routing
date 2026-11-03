import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeCheckpoint } from '../test/fixtures'
import { CheckpointList } from './CheckpointList'

const checkpoints = [
  makeCheckpoint({ mile: 0 }),
  makeCheckpoint({ mile: 25, level: 'SEVERE' }),
  makeCheckpoint({ mile: 50, level: 'NO_TRAVEL' }),
]

function setup(activeIndex: number | null = null) {
  const onShow = vi.fn()
  render(
    <CheckpointList
      routeId="A"
      checkpoints={checkpoints}
      activeIndex={activeIndex}
      onShow={onShow}
    />,
  )
  return { onShow, user: userEvent.setup() }
}

describe('CheckpointList', () => {
  it('has a row per checkpoint with its mile and level', () => {
    setup()

    const rows = within(screen.getByRole('list', { name: 'Route A checkpoints' })).getAllByRole(
      'button',
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Mile 0')
    expect(rows[1]).toHaveTextContent('Mile 25')
    expect(rows[1]).toHaveTextContent('Severe')
    expect(rows[2]).toHaveTextContent('No travel')
  })

  it('shows an ETA on every row', () => {
    setup()

    for (const row of screen.getAllByRole('button')) {
      expect(row.textContent).toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d{2}/)
    }
  })

  it('reports the route and index of a clicked row', async () => {
    const { user, onShow } = setup()

    await user.click(screen.getByRole('button', { name: /Mile 25/ }))

    expect(onShow).toHaveBeenCalledExactlyOnceWith('A', 1)
  })

  it('marks the row whose popup is open', () => {
    setup(2)

    expect(screen.getByRole('button', { name: /Mile 50/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /Mile 0/ })).not.toHaveAttribute('aria-current')
  })

  it('marks no row when no popup is open', () => {
    setup(null)

    expect(document.querySelector('[aria-current]')).toBeNull()
  })
})
