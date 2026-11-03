import { render, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHeatmapStore } from '../hooks/useHeatmapControls'
import { HeatmapControlsProvider } from './HeatmapControlsProvider'

function collectStores() {
  const stores: unknown[] = []
  function Probe() {
    stores.push(useHeatmapStore())
    return null
  }
  return { stores, Probe }
}

describe('HeatmapControlsProvider', () => {
  it('gives every consumer under it the same store', () => {
    const { stores, Probe } = collectStores()

    render(
      <HeatmapControlsProvider>
        <Probe />
        <Probe />
      </HeatmapControlsProvider>,
    )

    expect(stores).toHaveLength(2)
    expect(stores[1]).toBe(stores[0])
  })

  it('keeps its store when it re-renders', () => {
    const { stores, Probe } = collectStores()
    const tree = (
      <HeatmapControlsProvider>
        <Probe />
      </HeatmapControlsProvider>
    )

    const { rerender } = render(tree)
    rerender(tree)

    expect(stores[stores.length - 1]).toBe(stores[0])
  })

  it('creates a separate store for each provider', () => {
    const first = renderHook(() => useHeatmapStore(), { wrapper: HeatmapControlsProvider })
    const second = renderHook(() => useHeatmapStore(), { wrapper: HeatmapControlsProvider })

    expect(second.result.current).not.toBe(first.result.current)
  })
})
