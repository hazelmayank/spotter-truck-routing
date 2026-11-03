import type { FeatureCollection } from 'geojson'
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapGL, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import { DEFAULT_GRID_STEP_DEG } from '../lib/heatmap'
import {
  CHECKPOINT_HIT_LAYER_ID,
  CHECKPOINT_HIT_RADIUS_PX,
  CHECKPOINT_LAYER_ID,
  EMPTY_COLLECTION,
  ENDPOINT_PAINT,
  ROUTE_HIT_LAYER_ID,
  checkpointPaint,
  checkpointsGeoJson,
  endpointsGeoJson,
  isCheckpointLayer,
  planBounds,
  routeLinePaint,
  routesGeoJson,
} from '../lib/mapData'
import type { Checkpoint, CheckpointTarget, PlanResponse, Route } from '../types'
import { CheckpointPopup } from './CheckpointPopup'
import { CheckpointTooltip } from './CheckpointTooltip'
import { HeatmapLayer } from './HeatmapLayer'
import { Legend } from './Legend'

// maplibre finds its worker file by name at runtime, which Vite neither emits in a build nor
// serves cleanly in dev, so the worker is imported as an asset and handed over explicitly.
setWorkerUrl(workerUrl)

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const INITIAL_VIEW = { longitude: -98, latitude: 39, zoom: 3.5 }
const FIT_PADDING_PX = 48
const FIT_DURATION_MS = 800
const FLY_TO_MIN_ZOOM = 9
const FLY_DURATION_MS = 1200
const ROUTE_HIT_WIDTH_PX = 16
const ROUTES_SOURCE_ID = 'routes'
// A module constant, so the map is handed the same array on every render.
const INTERACTIVE_LAYER_IDS = [ROUTE_HIT_LAYER_ID, CHECKPOINT_HIT_LAYER_ID, CHECKPOINT_LAYER_ID]

interface MapViewProps {
  plan: PlanResponse | undefined
  hoveredId: string | null
  selectedId: string | null
  checkpoint: CheckpointTarget | null
  heatmap?: FeatureCollection // built once per heatmap response; never rebuilt for the slider
  heatmapStepDeg?: number
  onHover: (routeId: string | null) => void
  onSelect: (routeId: string | null) => void
  onCheckpoint: (target: CheckpointTarget | null) => void
}

interface TooltipTarget {
  plan: PlanResponse
  routeId: string
  index: number
}

export default function MapView({
  plan,
  hoveredId,
  selectedId,
  checkpoint,
  heatmap,
  heatmapStepDeg = DEFAULT_GRID_STEP_DEG,
  onHover,
  onSelect,
  onCheckpoint,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState('')
  const [tooltipTarget, setTooltipTarget] = useState<TooltipTarget | null>(null)

  const routesData = useMemo(() => (plan ? routesGeoJson(plan.routes) : EMPTY_COLLECTION), [plan])
  const checkpointsData = useMemo(
    () => (plan ? checkpointsGeoJson(plan.routes) : EMPTY_COLLECTION),
    [plan],
  )
  const endpointsData = useMemo(() => (plan ? endpointsGeoJson(plan) : EMPTY_COLLECTION), [plan])
  const bounds = useMemo(() => (plan ? planBounds(plan.routes) : null), [plan])
  const routesBestLast = useMemo(
    () => (plan ? [...plan.routes].sort((a, b) => b.rank - a.rank) : []),
    [plan],
  )

  useEffect(() => {
    if (loaded && bounds) {
      mapRef.current?.fitBounds(bounds, { padding: FIT_PADDING_PX, duration: FIT_DURATION_MS })
    }
  }, [loaded, bounds])

  const checkpointAt = (
    target: { routeId: string; index: number } | null,
  ): Checkpoint | undefined =>
    target
      ? plan?.routes.find((route) => route.id === target.routeId)?.checkpoints[target.index]
      : undefined

  const pinned = checkpointAt(checkpoint)
  const tooltip = tooltipTarget?.plan === plan ? tooltipTarget : null
  const tooltipCheckpoint = checkpointAt(tooltip)
  const tooltipIsPinned =
    tooltip && checkpoint?.routeId === tooltip.routeId && checkpoint.index === tooltip.index

  // Checkpoints picked from the sidebar list are off screen or small, so the map goes to them.
  useEffect(() => {
    if (checkpoint?.source !== 'list' || !pinned) return
    const map = mapRef.current
    map?.flyTo({
      center: [pinned.lon, pinned.lat],
      zoom: Math.max(map.getZoom(), FLY_TO_MIN_ZOOM),
      duration: FLY_DURATION_MS,
    })
  }, [checkpoint, pinned])

  const activeRouteId = selectedId ?? hoveredId ?? plan?.recommended_route_id ?? ''

  const handleLoad = useCallback(() => setLoaded(true), [])

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const features = event.features ?? []
      const checkpointHit = features.find((feature) => isCheckpointLayer(feature.layer.id))
      if (checkpointHit) {
        const { routeId, index } = checkpointHit.properties
        onCheckpoint({ routeId, index, source: 'map' })
        return
      }
      const routeHit = features.find((feature) => feature.layer.id === ROUTE_HIT_LAYER_ID)
      onSelect(routeHit ? routeHit.properties.id : null)
      onCheckpoint(null)
    },
    [onSelect, onCheckpoint],
  )

  const handleMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const features = event.features ?? []
      const checkpointHit = features.find((feature) => isCheckpointLayer(feature.layer.id))
      const routeHit = features.find((feature) => feature.layer.id === ROUTE_HIT_LAYER_ID)
      setCursor(features.length > 0 ? 'pointer' : '')

      if (plan && checkpointHit) {
        const { routeId, index } = checkpointHit.properties
        setTooltipTarget((previous) =>
          previous?.plan === plan && previous.routeId === routeId && previous.index === index
            ? previous
            : { plan, routeId, index },
        )
        onHover(null)
        return
      }
      setTooltipTarget(null)
      onHover(routeHit ? routeHit.properties.id : null)
    },
    [plan, onHover],
  )

  const handleMouseLeave = useCallback(() => {
    setCursor('')
    setTooltipTarget(null)
    onHover(null)
  }, [onHover])

  const closePopup = useCallback(() => onCheckpoint(null), [onCheckpoint])

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        cursor={cursor}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Declared first so it is created first and so sits below the route lines. */}
        <HeatmapLayer data={heatmap ?? EMPTY_COLLECTION} stepDeg={heatmapStepDeg} />

        <Source id={ROUTES_SOURCE_ID} type="geojson" data={routesData}>
          <Layer
            id={ROUTE_HIT_LAYER_ID}
            type="line"
            paint={{ 'line-width': ROUTE_HIT_WIDTH_PX, 'line-opacity': 0 }}
          />
          {routesBestLast.map((route) => (
            <RouteLine
              key={route.id}
              route={route}
              recommended={route.id === plan?.recommended_route_id}
              hovered={route.id === hoveredId}
              selectedId={selectedId}
            />
          ))}
        </Source>

        <Source id="checkpoints" type="geojson" data={checkpointsData}>
          <Layer
            id={CHECKPOINT_HIT_LAYER_ID}
            type="circle"
            paint={{ 'circle-radius': CHECKPOINT_HIT_RADIUS_PX, 'circle-opacity': 0 }}
          />
          <Layer id={CHECKPOINT_LAYER_ID} type="circle" paint={checkpointPaint(activeRouteId)} />
        </Source>

        <Source id="endpoints" type="geojson" data={endpointsData}>
          <Layer id="endpoints" type="circle" paint={ENDPOINT_PAINT} />
        </Source>

        {tooltip && tooltipCheckpoint && !tooltipIsPinned && (
          <Popup
            longitude={tooltipCheckpoint.lon}
            latitude={tooltipCheckpoint.lat}
            anchor="bottom"
            offset={14}
            maxWidth="240px"
            closeButton={false}
            closeOnClick={false}
            focusAfterOpen={false}
            className="pointer-events-none"
          >
            <CheckpointTooltip routeId={tooltip.routeId} checkpoint={tooltipCheckpoint} />
          </Popup>
        )}

        {checkpoint && pinned && (
          <Popup
            longitude={pinned.lon}
            latitude={pinned.lat}
            anchor="bottom"
            offset={10}
            maxWidth="300px"
            closeOnClick={false}
            onClose={closePopup}
          >
            <CheckpointPopup routeId={checkpoint.routeId} checkpoint={pinned} />
          </Popup>
        )}
      </MapGL>
      <Legend />
    </div>
  )
}

interface RouteLineProps {
  route: Route
  recommended: boolean
  hovered: boolean
  selectedId: string | null
}

// Memoized: hovering one route changes the props of that route's line only, so the others skip
// recomputing their paint and diffing it against the map.
const RouteLine = memo(function RouteLine({
  route,
  recommended,
  hovered,
  selectedId,
}: RouteLineProps) {
  const selected = route.id === selectedId
  return (
    // Source only injects its id into direct <Layer> children, and this layer sits in a wrapper.
    <Layer
      id={`route-${route.id}`}
      source={ROUTES_SOURCE_ID}
      type="line"
      filter={['==', ['get', 'id'], route.id]}
      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={routeLinePaint({
        recommended,
        hovered,
        selected,
        dimmed: selectedId !== null && !selected,
      })}
    />
  )
})
