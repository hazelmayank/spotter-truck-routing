import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapStoreContext } from '../hooks/useHeatmapControls'
import { createHeatmapStore } from '../store/heatmapStore'
import { HeatmapSlider } from './HeatmapSlider'

const START = '2026-11-03T12:00:00Z'
const TICK_MS = 500

function setup(hours = 49) {
  const store = createHeatmapStore()
  const view = render(
    <HeatmapStoreContext value={store}>
      <HeatmapSlider start={START} hours={hours} />
    </HeatmapStoreContext>,
  )
  const update = (nextHours: number) =>
    view.rerender(
      <HeatmapStoreContext value={store}>
        <HeatmapSlider start={START} hours={nextHours} />
      </HeatmapStoreContext>,
    )
  return { store, update, ...view }
}

const slider = () => screen.getByRole('slider', { name: 'Forecast hour' })
const label = () => screen.getByRole('status')
const move = (hour: number) => fireEvent.change(slider(), { target: { value: String(hour) } })
const tick = (times = 1) => act(() => vi.advanceTimersByTime(times * TICK_MS))

describe('the slider', () => {
  it('ranges over 0 to 48 hours in steps of one', () => {
    setup()

    expect(slider()).toHaveAttribute('min', '0')
    expect(slider()).toHaveAttribute('max', '48')
    expect(slider()).toHaveAttribute('step', '1')
  })

  it('ends at the last hour the heatmap has', () => {
    setup(11)

    expect(slider()).toHaveAttribute('max', '10')
  })

  it('starts at hour 0 and says which hour and local day and time that is', () => {
    setup()

    expect(slider()).toHaveValue('0')
    expect(label()).toHaveTextContent(/^\+0h - (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (AM|PM)$/)
  })

  it('moves the stored hour and the label when dragged', () => {
    const { store } = setup()

    move(12)

    expect(store.getState().hour).toBe(12)
    expect(label()).toHaveTextContent(/^\+12h - /)
  })

  it('moves one hour at a time, as arrow keys do on a range input', () => {
    const { store } = setup()

    move(1)
    move(2)
    move(1)

    expect(store.getState().hour).toBe(1)
  })

  it('reads the label out as the value text', () => {
    setup()

    move(30)

    expect(slider()).toHaveAttribute('aria-valuetext', label().textContent)
  })

  it('follows the stored hour', () => {
    const { store } = setup()

    act(() => store.setHour(20))

    expect(slider()).toHaveValue('20')
  })

  it('shows the last hour when the heatmap shrinks below the stored hour', () => {
    const { store, update } = setup()
    act(() => store.setHour(30))

    update(11)

    expect(slider()).toHaveValue('10')
    expect(label()).toHaveTextContent(/^\+10h - /)
  })
})

describe('play and pause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const playButton = () => screen.getByRole('button', { name: 'Play' })
  const pauseButton = () => screen.getByRole('button', { name: 'Pause' })

  it('starts paused', () => {
    const { store } = setup()

    expect(playButton()).toBeInTheDocument()
    expect(store.getState().playing).toBe(false)
  })

  it('advances one hour every 500 ms once playing', () => {
    const { store } = setup()

    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(TICK_MS - 1))
    expect(store.getState().hour).toBe(0)

    act(() => vi.advanceTimersByTime(1))
    expect(store.getState().hour).toBe(1)
    tick(2)
    expect(store.getState().hour).toBe(3)
    expect(label()).toHaveTextContent(/^\+3h - /)
  })

  it('shows Pause while playing', () => {
    setup()

    fireEvent.click(playButton())

    expect(pauseButton()).toBeInTheDocument()
  })

  it('stops advancing when paused', () => {
    const { store } = setup()
    fireEvent.click(playButton())
    tick(2)

    fireEvent.click(pauseButton())
    tick(5)

    expect(store.getState().hour).toBe(2)
    expect(playButton()).toBeInTheDocument()
  })

  it('stops by itself on the last hour', () => {
    const { store } = setup()
    act(() => store.setHour(47))

    fireEvent.click(playButton())
    tick()

    expect(store.getState().hour).toBe(48)
    expect(store.getState().playing).toBe(false)
    expect(playButton()).toBeInTheDocument()
    tick(3)
    expect(store.getState().hour).toBe(48)
  })

  it('restarts from the first hour when played from the last', () => {
    const { store } = setup()
    act(() => store.setHour(48))

    fireEvent.click(playButton())

    expect(store.getState().hour).toBe(0)
    expect(store.getState().playing).toBe(true)
  })

  it('pauses when the slider is moved by hand', () => {
    const { store } = setup()
    fireEvent.click(playButton())
    tick()

    move(30)
    tick(3)

    expect(store.getState().playing).toBe(false)
    expect(store.getState().hour).toBe(30)
  })

  it('stops its timer when paused or removed', () => {
    const { unmount } = setup()
    fireEvent.click(playButton())
    expect(vi.getTimerCount()).toBe(1)

    fireEvent.click(pauseButton())
    expect(vi.getTimerCount()).toBe(0)

    fireEvent.click(playButton())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stays on the last hour of a shorter heatmap', () => {
    const { store } = setup(4)
    fireEvent.click(playButton())

    tick(10)

    expect(store.getState().hour).toBe(3)
    expect(store.getState().playing).toBe(false)
  })
})
