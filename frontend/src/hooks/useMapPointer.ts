import { useCallback, useState } from 'react'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import { ROUTE_HIT_LAYER_ID, isCheckpointLayer } from '../lib/mapData'
import type { CheckpointTarget, PlanResponse } from '../types'

export interface TooltipTarget {
  plan: PlanResponse
  routeId: string
  index: number
}

interface MapPointerOptions {
  plan: PlanResponse | undefined
  onHover: (routeId: string | null) => void
  onSelect: (routeId: string | null) => void
  onCheckpoint: (target: CheckpointTarget | null) => void
}

/** Turns map clicks and mouse moves into hover, selection, pinned checkpoint and tooltip state. */
export function useMapPointer({ plan, onHover, onSelect, onCheckpoint }: MapPointerOptions) {
  const [cursor, setCursor] = useState('')
  const [tooltipTarget, setTooltipTarget] = useState<TooltipTarget | null>(null)

  // A tooltip belongs to the plan it was shown for, so a new plan drops it without an effect.
  const tooltip = tooltipTarget?.plan === plan ? tooltipTarget : null

  const onClick = useCallback(
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

  const onMouseMove = useCallback(
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

  const onMouseLeave = useCallback(() => {
    setCursor('')
    setTooltipTarget(null)
    onHover(null)
  }, [onHover])

  return { cursor, tooltip, onClick, onMouseMove, onMouseLeave }
}
