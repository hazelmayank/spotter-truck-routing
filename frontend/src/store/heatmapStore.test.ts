import { describe, expect, it, vi } from 'vitest'
import { createHeatmapStore } from './heatmapStore'

describe('createHeatmapStore', () => {
  it('starts at hour 0 showing risk, visible and paused', () => {
    expect(createHeatmapStore().getState()).toEqual({
      hour: 0,
      metric: 'risk',
      visible: true,
      playing: false,
    })
  })

  it('applies each setter', () => {
    const store = createHeatmapStore()

    store.setHour(12)
    store.setMetric('wind')
    store.setVisible(false)
    store.setPlaying(true)

    expect(store.getState()).toEqual({ hour: 12, metric: 'wind', visible: false, playing: true })
  })

  it('tells subscribers when something changed', () => {
    const store = createHeatmapStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.setHour(5)
    store.setMetric('snow')

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stays quiet when a setter does not change anything', () => {
    const store = createHeatmapStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getState()

    store.setHour(0)
    store.setMetric('risk')
    store.setVisible(true)
    store.setPlaying(false)

    expect(listener).not.toHaveBeenCalled()
    expect(store.getState()).toBe(before)
  })

  it('replaces the state object on a change, so selectors can compare by identity', () => {
    const store = createHeatmapStore()
    const before = store.getState()

    store.setHour(1)

    expect(store.getState()).not.toBe(before)
  })

  it('stops telling a listener once it unsubscribes', () => {
    const store = createHeatmapStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.setHour(3)

    expect(listener).not.toHaveBeenCalled()
  })

  it('tells every listener', () => {
    const store = createHeatmapStore()
    const [first, second] = [vi.fn(), vi.fn()]
    store.subscribe(first)
    store.subscribe(second)

    store.setVisible(false)

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('keeps separate state per store', () => {
    const [one, two] = [createHeatmapStore(), createHeatmapStore()]

    one.setHour(9)

    expect(two.getState().hour).toBe(0)
  })
})
