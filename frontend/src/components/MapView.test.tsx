import { act, render as renderBare, screen, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapStoreContext } from '../hooks/useHeatmapControls'
import { heatmapGeoJson, heatmapRadius, heatmapWeight } from '../lib/heatmap'
import { LEVEL_COLOR_EXPRESSION, planBounds } from '../lib/mapData'
import { createHeatmapStore, type HeatmapStore } from '../store/heatmapStore'
import { makeHeatmapResponse, makePlan, makeThreeRoutePlan } from '../test/helpers'
import type { CheckpointTarget, PlanResponse } from '../types'
import MapView from './MapView'

interface MapEvent {
  features?: unknown[]
}

interface MapProps {
  children?: ReactNode
  mapStyle: string
  interactiveLayerIds: string[]
  cursor: string
  onLoad?: () => void
  onClick: (event: MapEvent) => void
  onMouseMove: (event: MapEvent) => void
  onMouseLeave: () => void
}

interface FeatureCollectionData {
  features: { properties: Record<string, unknown> }[]
}

interface LayerProps {
  id: string
  type: string
  filter?: unknown
  layout?: Record<string, unknown>
  paint: Record<string, unknown>
}

interface PopupProps {
  children: ReactNode
  onClose?: () => void
  className?: string
  longitude: number
  latitude: number
}

// jsdom has no WebGL, so the map library is replaced by components that record their props.
const mock = vi.hoisted(() => ({
  mapProps: null as MapProps | null,
  layers: {} as Record<string, LayerProps>,
  sources: {} as Record<string, FeatureCollectionData>,
  mapRenders: 0,
  layerRenders: {} as Record<string, number>,
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  getZoom: vi.fn(() => 5),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({ setWorkerUrl: mock.setWorkerUrl }))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  const MapGL = React.forwardRef<unknown, MapProps>((props, ref) => {
    const { onLoad } = props
    const loadedOnce = React.useRef(false)
    React.useImperativeHandle(ref, () => ({
      fitBounds: mock.fitBounds,
      flyTo: mock.flyTo,
      getZoom: mock.getZoom,
    }))
    React.useEffect(() => {
      if (loadedOnce.current) return
      loadedOnce.current = true
      onLoad?.()
    })
    mock.mapProps = props
    mock.mapRenders += 1
    return <div data-testid="map">{props.children}</div>
  })
  return {
    default: MapGL,
    NavigationControl: () => null,
    Source: ({
      id,
      data,
      children,
    }: {
      id: string
      data: FeatureCollectionData
      children?: ReactNode
    }) => {
      mock.sources[id] = data
      // Like the real Source: only direct children get the source id injected.
      const withSource = React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { source: id } as object) : child,
      )
      return <div data-testid={`source-${id}`}>{withSource}</div>
    },
    Layer: (props: LayerProps & { source?: string }) => {
      if (!props.source) throw new Error(`layer ${props.id} has no source`)
      mock.layers[props.id] = props
      mock.layerRenders[props.id] = (mock.layerRenders[props.id] ?? 0) + 1
      return <div data-testid={`layer-${props.id}`} />
    },
    Popup: ({ children, onClose, className, longitude, latitude }: PopupProps) => (
      <div
        data-testid={className?.includes('pointer-events-none') ? 'tooltip' : 'popup'}
        data-lon={longitude}
        data-lat={latitude}
      >
        <button onClick={onClose}>close popup</button>
        {children}
      </div>
    ),
  }
})

const plan = makeThreeRoutePlan()
const heatmapData = heatmapGeoJson(makeHeatmapResponse())

let store: HeatmapStore
const render = (ui: ReactElement) =>
  renderBare(ui, {
    wrapper: ({ children }) => <HeatmapStoreContext value={store}>{children}</HeatmapStoreContext>,
  })

const noop = () => {}
const baseProps = {
  plan: undefined as PlanResponse | undefined,
  hoveredId: null as string | null,
  selectedId: null as string | null,
  checkpoint: null as CheckpointTarget | null,
  onHover: noop,
  onSelect: noop,
  onCheckpoint: noop,
}

beforeEach(() => {
  store = createHeatmapStore()
  mock.mapRenders = 0
  mock.layerRenders = {}
  mock.mapProps = null
  mock.layers = {}
  mock.sources = {}
  mock.fitBounds.mockClear()
  mock.flyTo.mockClear()
  mock.getZoom.mockReturnValue(5)
})

const routeLayerIds = () =>
  screen
    .queryAllByTestId(/^layer-route-[A-Z]$/)
    .map((element) => element.dataset.testid!.replace('layer-', ''))
const click = (...features: unknown[]) => act(() => mock.mapProps!.onClick({ features }))
const move = (...features: unknown[]) => act(() => mock.mapProps!.onMouseMove({ features }))
const checkpointFeature = (routeId: string, index: number, layerId = 'checkpoints') => ({
  layer: { id: layerId },
  properties: { routeId, index, level: 'LOW' },
})
const routeFeature = (id: string) => ({ layer: { id: 'route-hit' }, properties: { id } })

describe('map setup', () => {
  it('points maplibre at the bundled worker file when the module loads', async () => {
    vi.resetModules()
    mock.setWorkerUrl.mockClear()

    await import('./MapView')

    expect(mock.setWorkerUrl).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('maplibre-gl-worker'),
    )
  })

  it('uses the OpenFreeMap liberty style', () => {
    render(<MapView {...baseProps} />)

    expect(mock.mapProps?.mapStyle).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('mounts the map once and keeps it when a plan arrives', () => {
    const { rerender } = render(<MapView {...baseProps} />)
    const map = screen.getByTestId('map')

    rerender(<MapView {...baseProps} plan={plan} />)

    expect(screen.getAllByTestId('map')).toHaveLength(1)
    expect(screen.getByTestId('map')).toBe(map)
  })

  it('makes the route hit layer and the checkpoints clickable', () => {
    render(<MapView {...baseProps} />)

    expect(mock.mapProps?.interactiveLayerIds).toEqual([
      'route-hit',
      'checkpoint-hit',
      'checkpoints',
    ])
  })

  it('is empty before there is a plan', () => {
    render(<MapView {...baseProps} />)

    expect(mock.sources.routes.features).toEqual([])
    expect(mock.sources.checkpoints.features).toEqual([])
    expect(routeLayerIds()).toEqual([])
  })

  it('shows the legend', () => {
    render(<MapView {...baseProps} />)

    expect(screen.getByRole('group', { name: 'Legend' })).toBeInTheDocument()
  })
})

describe('route lines', () => {
  it('has one line layer per route, filtered to that route', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(routeLayerIds().sort()).toEqual(['route-A', 'route-B', 'route-C'])
    for (const id of ['A', 'B', 'C']) {
      expect(mock.layers[`route-${id}`].filter).toEqual(['==', ['get', 'id'], id])
      expect(mock.layers[`route-${id}`].type).toBe('line')
    }
  })

  it('draws the recommended route last, so on top, and thicker', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(routeLayerIds().at(-1)).toBe('route-B')
    expect(mock.layers['route-B'].paint['line-width']).toBe(6)
    expect(mock.layers['route-A'].paint['line-width']).toBe(4)
    expect(mock.layers['route-C'].paint['line-width']).toBe(4)
  })

  it('highlights a hovered route', () => {
    render(<MapView {...baseProps} plan={plan} hoveredId="C" />)

    expect(mock.layers['route-C'].paint['line-width']).toBe(6)
    expect(mock.layers['route-A'].paint['line-width']).toBe(4)
  })

  it('highlights the selected route and fades the others', () => {
    render(<MapView {...baseProps} plan={plan} selectedId="A" />)

    expect(mock.layers['route-A'].paint['line-width']).toBe(6)
    expect(mock.layers['route-A'].paint['line-opacity']).toBe(1)
    expect(mock.layers['route-B'].paint['line-opacity']).toBe(0.4)
    expect(mock.layers['route-C'].paint['line-opacity']).toBe(0.4)
  })

  it('has a wide invisible layer for easy hovering', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.layers['route-hit'].paint).toEqual({ 'line-width': 16, 'line-opacity': 0 })
  })
})

describe('checkpoints and endpoints', () => {
  it('uses a single visible circle layer for all checkpoints, colored by level', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.layers.checkpoints.type).toBe('circle')
    expect(mock.layers.checkpoints.paint['circle-color']).toBe(LEVEL_COLOR_EXPRESSION)
    expect(mock.sources.checkpoints.features).toHaveLength(5)
  })

  it('adds a larger invisible layer so small dots are easy to hit', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.layers['checkpoint-hit'].type).toBe('circle')
    expect(mock.layers['checkpoint-hit'].paint).toEqual({
      'circle-radius': 12,
      'circle-opacity': 0,
    })
  })

  it('emphasizes the recommended route checkpoints by default, then the selected route', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    expect(mock.layers.checkpoints.paint['circle-opacity']).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'B'],
      1,
      0.55,
    ])

    rerender(<MapView {...baseProps} plan={plan} selectedId="A" />)

    expect(mock.layers.checkpoints.paint['circle-opacity']).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'A'],
      1,
      0.55,
    ])
  })

  it('marks the origin and the destination', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.sources.endpoints.features.map((feature) => feature.properties.kind)).toEqual([
      'origin',
      'destination',
    ])
  })
})

describe('memoized data', () => {
  it('keeps the same GeoJSON objects when only hover or selection changes', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = { ...mock.sources }

    rerender(<MapView {...baseProps} plan={plan} hoveredId="A" />)
    rerender(<MapView {...baseProps} plan={plan} hoveredId="A" selectedId="C" />)

    expect(mock.sources.routes).toBe(before.routes)
    expect(mock.sources.checkpoints).toBe(before.checkpoints)
    expect(mock.sources.endpoints).toBe(before.endpoints)
  })

  it('keeps the same GeoJSON objects when a popup opens or closes', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = mock.sources.checkpoints

    rerender(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    expect(mock.sources.checkpoints).toBe(before)
  })

  it('builds new GeoJSON for a new plan', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = mock.sources.routes

    rerender(<MapView {...baseProps} plan={makeThreeRoutePlan()} />)

    expect(mock.sources.routes).not.toBe(before)
  })
})

describe('fitting the view', () => {
  it('does nothing without a plan', () => {
    render(<MapView {...baseProps} />)

    expect(mock.fitBounds).not.toHaveBeenCalled()
  })

  it('fits all routes with padding once the map is loaded and a plan exists', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.fitBounds).toHaveBeenCalledExactlyOnceWith(planBounds(plan.routes), {
      padding: 48,
      duration: 800,
    })
  })

  it('fits again for each new plan but not when the focus changes', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)

    rerender(<MapView {...baseProps} plan={plan} hoveredId="A" />)
    expect(mock.fitBounds).toHaveBeenCalledTimes(1)

    rerender(<MapView {...baseProps} plan={makePlan()} />)
    expect(mock.fitBounds).toHaveBeenCalledTimes(2)
  })
})

describe('the open checkpoint popup', () => {
  it('shows the details of the checkpoint it is told to open', () => {
    render(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    const popup = screen.getByTestId('popup')
    expect(within(popup).getByText('Route A · mile 25')).toBeInTheDocument()
    expect(within(popup).getByText('50 mph (gusts 12 mph)')).toBeInTheDocument()
    expect(within(popup).getByText('Severe')).toBeInTheDocument()
    expect(popup).toHaveAttribute('data-lat', '33.5')
    expect(popup).toHaveAttribute('data-lon', '-98')
  })

  it('is absent when no checkpoint is open', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(screen.queryByTestId('popup')).not.toBeInTheDocument()
  })

  it('asks to close when its close button is used', () => {
    const onCheckpoint = vi.fn()
    render(
      <MapView
        {...baseProps}
        plan={plan}
        checkpoint={{ routeId: 'B', index: 0, source: 'map' }}
        onCheckpoint={onCheckpoint}
      />,
    )

    act(() => screen.getByText('close popup').click())

    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith(null)
  })
})

describe('flying to a checkpoint from the list', () => {
  it('centres the map on it and zooms in', () => {
    render(
      <MapView
        {...baseProps}
        plan={plan}
        checkpoint={{ routeId: 'A', index: 1, source: 'list' }}
      />,
    )

    expect(mock.flyTo).toHaveBeenCalledExactlyOnceWith({
      center: [-98, 33.5],
      zoom: 9,
      duration: 1200,
    })
  })

  it('keeps the current zoom when it is already closer', () => {
    mock.getZoom.mockReturnValue(12)

    render(
      <MapView
        {...baseProps}
        plan={plan}
        checkpoint={{ routeId: 'A', index: 1, source: 'list' }}
      />,
    )

    expect(mock.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 12 }))
  })

  it('does not move the map for a checkpoint clicked on the map itself', () => {
    render(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    expect(mock.flyTo).not.toHaveBeenCalled()
  })

  it('does not move the map when nothing is open', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.flyTo).not.toHaveBeenCalled()
  })

  it('flies again when another checkpoint is picked', () => {
    const { rerender } = render(
      <MapView
        {...baseProps}
        plan={plan}
        checkpoint={{ routeId: 'A', index: 0, source: 'list' }}
      />,
    )

    rerender(
      <MapView
        {...baseProps}
        plan={plan}
        checkpoint={{ routeId: 'B', index: 1, source: 'list' }}
      />,
    )

    expect(mock.flyTo).toHaveBeenCalledTimes(2)
    expect(mock.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-97, 34] }))
  })
})

describe('clicking', () => {
  it('opens a clicked checkpoint, marked as picked on the map', () => {
    const onCheckpoint = vi.fn()
    render(<MapView {...baseProps} plan={plan} onCheckpoint={onCheckpoint} />)

    click(checkpointFeature('A', 1))

    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith({ routeId: 'A', index: 1, source: 'map' })
  })

  it('also opens a checkpoint hit through its larger invisible layer', () => {
    const onCheckpoint = vi.fn()
    render(<MapView {...baseProps} plan={plan} onCheckpoint={onCheckpoint} />)

    click(checkpointFeature('B', 0, 'checkpoint-hit'))

    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith({ routeId: 'B', index: 0, source: 'map' })
  })

  it('prefers a checkpoint over the route line under it', () => {
    const onSelect = vi.fn()
    const onCheckpoint = vi.fn()
    render(<MapView {...baseProps} plan={plan} onSelect={onSelect} onCheckpoint={onCheckpoint} />)

    click(routeFeature('A'), checkpointFeature('A', 0))

    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith({ routeId: 'A', index: 0, source: 'map' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects a clicked route and closes any popup', () => {
    const onSelect = vi.fn()
    const onCheckpoint = vi.fn()
    render(<MapView {...baseProps} plan={plan} onSelect={onSelect} onCheckpoint={onCheckpoint} />)

    click(routeFeature('C'))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('C')
    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('clears the selection and the popup when the empty map is clicked', () => {
    const onSelect = vi.fn()
    const onCheckpoint = vi.fn()
    render(<MapView {...baseProps} plan={plan} onSelect={onSelect} onCheckpoint={onCheckpoint} />)

    click()

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
    expect(onCheckpoint).toHaveBeenCalledExactlyOnceWith(null)
  })
})

describe('hovering a route', () => {
  it('hovers the route under the pointer and shows a pointer cursor', () => {
    const onHover = vi.fn()
    render(<MapView {...baseProps} plan={plan} onHover={onHover} />)

    move(routeFeature('A'))

    expect(onHover).toHaveBeenLastCalledWith('A')
    expect(mock.mapProps?.cursor).toBe('pointer')
  })

  it('clears the hover and the cursor over empty map and when the pointer leaves', () => {
    const onHover = vi.fn()
    render(<MapView {...baseProps} plan={plan} onHover={onHover} />)
    move(routeFeature('A'))

    move()
    expect(onHover).toHaveBeenLastCalledWith(null)
    expect(mock.mapProps?.cursor).toBe('')

    move(routeFeature('B'))
    act(() => mock.mapProps!.onMouseLeave())
    expect(onHover).toHaveBeenLastCalledWith(null)
    expect(mock.mapProps?.cursor).toBe('')
  })
})

describe('hovering a checkpoint', () => {
  it('shows a tooltip with the ETA and weather', () => {
    render(<MapView {...baseProps} plan={plan} />)

    move(checkpointFeature('A', 1))

    const tooltip = screen.getByTestId('tooltip')
    expect(within(tooltip).getByText('Route A · mile 25')).toBeInTheDocument()
    expect(within(tooltip).getByText(/Wind 50 mph · Rain 0 in\/hr/)).toBeInTheDocument()
    expect(
      within(tooltip).getByText(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\d:\d\d/),
    ).toBeInTheDocument()
    expect(tooltip).toHaveAttribute('data-lat', '33.5')
  })

  it('can be triggered through the larger invisible layer', () => {
    render(<MapView {...baseProps} plan={plan} />)

    move(checkpointFeature('B', 1, 'checkpoint-hit'))

    expect(screen.getByTestId('tooltip')).toHaveTextContent('Route B · mile 25')
  })

  it('ignores mouse events, so it cannot flicker under the pointer', () => {
    render(<MapView {...baseProps} plan={plan} />)

    move(checkpointFeature('A', 1))

    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
    expect(mock.mapProps?.cursor).toBe('pointer')
  })

  it('does not also hover a route', () => {
    const onHover = vi.fn()
    render(<MapView {...baseProps} plan={plan} onHover={onHover} />)

    move(routeFeature('A'), checkpointFeature('A', 0))

    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('goes away over empty map and when the pointer leaves the map', () => {
    render(<MapView {...baseProps} plan={plan} />)
    move(checkpointFeature('A', 1))

    move()
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()

    move(checkpointFeature('A', 1))
    act(() => mock.mapProps!.onMouseLeave())
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })

  it('moves to the next checkpoint when the pointer does', () => {
    render(<MapView {...baseProps} plan={plan} />)
    move(checkpointFeature('A', 0))

    move(checkpointFeature('A', 1))

    expect(screen.getAllByTestId('tooltip')).toHaveLength(1)
    expect(screen.getByTestId('tooltip')).toHaveTextContent('mile 25')
  })

  it('gives way to the full popup of the same checkpoint', () => {
    render(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    move(checkpointFeature('A', 1))

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(screen.getByTestId('popup')).toBeInTheDocument()
  })

  it('still shows for a different checkpoint while another popup is open', () => {
    render(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    move(checkpointFeature('B', 0))

    expect(screen.getByTestId('tooltip')).toHaveTextContent('Route B · mile 0')
    expect(screen.getByTestId('popup')).toBeInTheDocument()
  })

  it('is dropped when a new plan arrives', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    move(checkpointFeature('A', 1))

    rerender(<MapView {...baseProps} plan={makeThreeRoutePlan()} />)

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })
})

describe('the heatmap layer', () => {
  it('is drawn below the route lines and the checkpoints', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)

    const order = screen.getAllByTestId(/^layer-/).map((element) => element.dataset.testid)

    expect(order[0]).toBe('layer-heatmap')
    expect(order.indexOf('layer-heatmap')).toBeLessThan(order.indexOf('layer-route-hit'))
    expect(order.indexOf('layer-heatmap')).toBeLessThan(order.indexOf('layer-checkpoints'))
  })

  it('is a heatmap layer over the data it is given', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)

    expect(mock.layers.heatmap.type).toBe('heatmap')
    expect(mock.sources.heatmap).toBe(heatmapData)
  })

  it('sizes the glow from the grid step it is given', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} heatmapStepDeg={0.5} />)

    expect(mock.layers.heatmap.paint['heatmap-radius']).toEqual(heatmapRadius(0.5))
  })

  it('assumes a quarter degree grid until it knows better', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.layers.heatmap.paint['heatmap-radius']).toEqual(heatmapRadius(0.25))
  })

  it('is there but empty before a heatmap has loaded', () => {
    render(<MapView {...baseProps} plan={plan} />)

    expect(mock.sources.heatmap.features).toEqual([])
  })

  it('shows the risk of the first hour at first', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)

    expect(mock.layers.heatmap.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 0))
  })
})

describe('moving the heatmap slider', () => {
  const FRAME_MS = 16
  const OTHER_LAYERS = [
    'route-hit',
    'route-A',
    'route-B',
    'route-C',
    'checkpoint-hit',
    'checkpoints',
    'endpoints',
  ]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const settle = () => act(() => vi.advanceTimersByTime(FRAME_MS))

  it('re-renders only the heatmap layer, through all 48 hours', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)
    settle()
    const layerRenders = { ...mock.layerRenders }
    const mapRenders = mock.mapRenders

    for (let hour = 1; hour <= 48; hour++) {
      act(() => store.setHour(hour))
      settle()
    }

    expect(mock.mapRenders).toBe(mapRenders) // MapView itself did not re-render
    for (const id of OTHER_LAYERS) {
      expect(mock.layerRenders[id]).toBe(layerRenders[id]) // no route or checkpoint layer did
    }
    expect(mock.layerRenders.heatmap).toBeGreaterThan(layerRenders.heatmap)
    expect(mock.layers.heatmap.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 48))
  })

  it('never hands the map new data: every source object stays the same', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)
    settle()
    const sources = { ...mock.sources }

    for (const hour of [4, 17, 33, 48]) {
      act(() => store.setHour(hour))
      settle()
    }

    for (const id of ['heatmap', 'routes', 'checkpoints', 'endpoints']) {
      expect(mock.sources[id]).toBe(sources[id])
    }
  })

  it('updates the heatmap once per frame however fast the slider moves', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)
    settle()
    const before = mock.layerRenders.heatmap

    act(() => {
      for (let hour = 1; hour <= 40; hour++) store.setHour(hour)
    })
    settle()

    expect(mock.layerRenders.heatmap - before).toBeLessThanOrEqual(2)
    expect(mock.layers.heatmap.paint['heatmap-weight']).toEqual(heatmapWeight('risk', 40))
  })

  it('changes only the weight of the heatmap paint', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)
    settle()
    const first = mock.layers.heatmap.paint

    act(() => store.setHour(20))
    settle()

    for (const key of ['heatmap-radius', 'heatmap-intensity', 'heatmap-color', 'heatmap-opacity']) {
      expect(mock.layers.heatmap.paint[key]).toBe(first[key])
    }
  })

  it('switching the metric or hiding the heatmap does not re-render the other layers either', () => {
    render(<MapView {...baseProps} plan={plan} heatmap={heatmapData} />)
    settle()
    const layerRenders = { ...mock.layerRenders }
    const mapRenders = mock.mapRenders

    act(() => store.setMetric('wind'))
    act(() => store.setVisible(false))
    settle()

    expect(mock.mapRenders).toBe(mapRenders)
    for (const id of OTHER_LAYERS) expect(mock.layerRenders[id]).toBe(layerRenders[id])
    expect(mock.layers.heatmap.paint['heatmap-weight']).toEqual(heatmapWeight('wind', 0))
    expect(mock.layers.heatmap.layout).toEqual({ visibility: 'none' })
  })
})

describe('re-rendering the route lines', () => {
  it('hovering a route re-renders only its own line', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = { ...mock.layerRenders }

    rerender(<MapView {...baseProps} plan={plan} hoveredId="A" />)

    expect(mock.layerRenders['route-A']).toBeGreaterThan(before['route-A'])
    expect(mock.layerRenders['route-B']).toBe(before['route-B'])
    expect(mock.layerRenders['route-C']).toBe(before['route-C'])
  })

  it('opening a popup re-renders no route line', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = { ...mock.layerRenders }

    rerender(
      <MapView {...baseProps} plan={plan} checkpoint={{ routeId: 'A', index: 1, source: 'map' }} />,
    )

    for (const id of ['route-A', 'route-B', 'route-C']) {
      expect(mock.layerRenders[id]).toBe(before[id])
    }
  })

  it('selecting a route re-renders every line, since the others fade', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const before = { ...mock.layerRenders }

    rerender(<MapView {...baseProps} plan={plan} selectedId="A" />)

    for (const id of ['route-A', 'route-B', 'route-C']) {
      expect(mock.layerRenders[id]).toBeGreaterThan(before[id])
    }
  })

  it('hands the map the same list of clickable layers every time', () => {
    const { rerender } = render(<MapView {...baseProps} plan={plan} />)
    const first = mock.mapProps!.interactiveLayerIds

    rerender(<MapView {...baseProps} plan={plan} hoveredId="B" />)

    expect(mock.mapProps!.interactiveLayerIds).toBe(first)
  })

  it('hands the map the same event handlers while the callbacks it got stay the same', () => {
    const handlers = { onHover: vi.fn(), onSelect: vi.fn(), onCheckpoint: vi.fn() }
    const { rerender } = render(<MapView {...baseProps} {...handlers} plan={plan} />)
    const first = { ...mock.mapProps! }

    rerender(<MapView {...baseProps} {...handlers} plan={plan} hoveredId="B" />)

    expect(mock.mapProps!.onClick).toBe(first.onClick)
    expect(mock.mapProps!.onMouseMove).toBe(first.onMouseMove)
    expect(mock.mapProps!.onMouseLeave).toBe(first.onMouseLeave)
  })
})
