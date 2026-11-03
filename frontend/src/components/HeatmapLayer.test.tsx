import { act, fireEvent, render as renderBare, screen } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapStoreContext } from '../hooks/useHeatmapControls'
import { heatmapGeoJson, heatmapRadius, heatmapWeight } from '../lib/heatmap'
import { createHeatmapStore, type HeatmapStore } from '../store/heatmapStore'
import { makeHeatmapResponse } from '../test/helpers'
import { HeatmapLayer } from './HeatmapLayer'

interface LayerProps {
  id: string
  type: string
  source?: string
  paint: Record<string, unknown>
  layout: { visibility: string }
}

const mock = vi.hoisted(() => ({
  layer: null as LayerProps | null,
  layerRenders: 0,
  sourceData: null as unknown,
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    Source: ({ data, children }: { id: string; data: unknown; children?: ReactNode }) => {
      mock.sourceData = data
      return React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { source: 'heatmap' } as object)
          : child,
      )
    },
    Layer: (props: LayerProps) => {
      mock.layer = props
      mock.layerRenders += 1
      return null
    },
  }
})

const data = heatmapGeoJson(makeHeatmapResponse())
const FRAME_MS = 16

let store: HeatmapStore
const render = (ui: ReactElement) =>
  renderBare(ui, {
    wrapper: ({ children }) => <HeatmapStoreContext value={store}>{children}</HeatmapStoreContext>,
  })
const frame = () => act(() => vi.advanceTimersByTime(FRAME_MS))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  store = createHeatmapStore()
  mock.layer = null
  mock.layerRenders = 0
  mock.sourceData = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HeatmapLayer', () => {
  it('sizes the glow from the grid step', () => {
    const { rerender } = render(<HeatmapLayer data={data} stepDeg={0.25} />)
    const fine = mock.layer!.paint['heatmap-radius']

    rerender(<HeatmapLayer data={data} stepDeg={0.5} />)

    expect(fine).toEqual(heatmapRadius(0.25))
    expect(mock.layer!.paint['heatmap-radius']).toEqual(heatmapRadius(0.5))
  })

  it('draws the data as a heatmap layer', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)

    expect(mock.sourceData).toBe(data)
    expect(mock.layer).toMatchObject({ id: 'heatmap', type: 'heatmap', source: 'heatmap' })
  })

  it('starts with the risk of hour 0', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)

    expect(mock.layer?.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 0))
  })

  it('moves the weight to the new hour on the next frame, not before', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)

    act(() => store.setHour(12))
    expect(mock.layer?.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 0))

    frame()
    expect(mock.layer?.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 12))
  })

  it('updates once for many hour changes within a frame', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)
    frame()
    const rendersBefore = mock.layerRenders

    act(() => {
      for (let hour = 1; hour <= 30; hour++) store.setHour(hour)
    })
    frame()

    expect(mock.layerRenders).toBe(rendersBefore + 1 + 1) // the store change and the frame
    expect(mock.layer?.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 30))
  })

  it('switches to the property and scale of the chosen metric', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)

    act(() => store.setMetric('wind'))

    expect(mock.layer?.paint['heatmap-weight']).toEqual(heatmapWeight('wind', 0))
    expect(JSON.stringify(mock.layer?.paint['heatmap-weight'])).toContain('"w0"')
  })

  it('keeps every paint value except the weight as the very same object', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)
    const first = mock.layer!.paint

    act(() => store.setHour(20))
    frame()

    for (const key of ['heatmap-radius', 'heatmap-intensity', 'heatmap-color', 'heatmap-opacity']) {
      expect(mock.layer!.paint[key]).toBe(first[key])
    }
  })

  it('hands the map the same data object however the slider moves', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)

    for (const hour of [3, 9, 27, 48]) {
      act(() => store.setHour(hour))
      frame()
      expect(mock.sourceData).toBe(data)
    }
  })

  it('hides and shows the layer through its visibility', () => {
    render(<HeatmapLayer data={data} stepDeg={0.25} />)
    expect(mock.layer?.layout.visibility).toBe('visible')

    act(() => store.setVisible(false))
    expect(mock.layer?.layout.visibility).toBe('none')

    act(() => store.setVisible(true))
    expect(mock.layer?.layout.visibility).toBe('visible')
  })

  it('does not re-render when its parent does and the data is unchanged', () => {
    function Parent() {
      const [, setCount] = useState(0)
      return (
        <>
          <button onClick={() => setCount((count) => count + 1)}>again</button>
          <HeatmapLayer data={data} stepDeg={0.25} />
        </>
      )
    }
    render(<Parent />)
    const rendersBefore = mock.layerRenders

    fireEvent.click(screen.getByText('again'))
    fireEvent.click(screen.getByText('again'))

    expect(mock.layerRenders).toBe(rendersBefore)
  })

  it('re-renders for a new data object', () => {
    const { rerender } = render(<HeatmapLayer data={data} stepDeg={0.25} />)
    const other = heatmapGeoJson(makeHeatmapResponse())

    rerender(<HeatmapLayer data={other} stepDeg={0.25} />)

    expect(mock.sourceData).toBe(other)
  })

  it('stops listening to the frame when it goes away', () => {
    const { unmount } = render(<HeatmapLayer data={data} stepDeg={0.25} />)
    act(() => store.setHour(5))
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
