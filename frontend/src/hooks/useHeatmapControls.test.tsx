import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createHeatmapStore, type HeatmapStore } from '../store/heatmapStore'
import { HeatmapStoreContext, useHeatmapControl, useHeatmapStore } from './useHeatmapControls'

function provider(store: HeatmapStore) {
  return ({ children }: { children: ReactNode }) => (
    <HeatmapStoreContext value={store}>{children}</HeatmapStoreContext>
  )
}

describe('useHeatmapControl', () => {
  it('returns the current value of the control', () => {
    const store = createHeatmapStore()
    store.setHour(8)

    const { result } = renderHook(() => useHeatmapControl('hour'), { wrapper: provider(store) })

    expect(result.current).toBe(8)
  })

  it('follows changes of that control', () => {
    const store = createHeatmapStore()
    const { result } = renderHook(() => useHeatmapControl('metric'), { wrapper: provider(store) })

    act(() => store.setMetric('rain'))

    expect(result.current).toBe('rain')
  })

  it('does not re-render for a change of another control', () => {
    const store = createHeatmapStore()
    let renders = 0
    renderHook(
      () => {
        renders += 1
        return useHeatmapControl('metric')
      },
      { wrapper: provider(store) },
    )
    const before = renders

    act(() => store.setHour(20))
    act(() => store.setVisible(false))

    expect(renders).toBe(before)
  })

  it('gives each control its own re-renders when several components read the store', () => {
    const store = createHeatmapStore()
    const renders = { hour: 0, metric: 0 }
    function HourReader() {
      renders.hour += 1
      return <p>hour {useHeatmapControl('hour')}</p>
    }
    function MetricReader() {
      renders.metric += 1
      return <p>metric {useHeatmapControl('metric')}</p>
    }
    render(
      <HeatmapStoreContext value={store}>
        <HourReader />
        <MetricReader />
      </HeatmapStoreContext>,
    )
    const metricRendersBefore = renders.metric

    for (const hour of [1, 2, 3, 4, 5]) act(() => store.setHour(hour))

    expect(screen.getByText('hour 5')).toBeInTheDocument()
    expect(renders.metric).toBe(metricRendersBefore)
  })

  it('fails with a clear message outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useHeatmapControl('hour'))).toThrow(
      'HeatmapControlsProvider is missing',
    )
  })
})

describe('useHeatmapStore', () => {
  it('returns the same store every time and never causes a re-render', () => {
    const store = createHeatmapStore()
    let renders = 0
    const { result } = renderHook(
      () => {
        renders += 1
        return useHeatmapStore()
      },
      { wrapper: provider(store) },
    )

    act(() => store.setHour(10))
    act(() => store.setMetric('snow'))

    expect(result.current).toBe(store)
    expect(renders).toBe(1)
  })
})
