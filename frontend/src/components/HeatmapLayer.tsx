import type { FeatureCollection } from 'geojson'
import { memo, useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { useAnimationFrameValue } from '../hooks/useAnimationFrameValue'
import { useHeatmapControl } from '../hooks/useHeatmapControls'
import {
  HEATMAP_LAYER_ID,
  HEATMAP_SOURCE_ID,
  heatmapPaint,
  heatmapStaticPaint,
} from '../lib/heatmap'

interface HeatmapLayerProps {
  data: FeatureCollection
  stepDeg: number // grid spacing, which sizes each point's glow
}

/**
 * The only map component that reads the slider hour. The map re-renders it at most once per
 * frame, and react-map-gl then calls setPaintProperty for `heatmap-weight` alone: the source
 * data is the same object every time and is never re-uploaded.
 */
export const HeatmapLayer = memo(function HeatmapLayer({ data, stepDeg }: HeatmapLayerProps) {
  const metric = useHeatmapControl('metric')
  const visible = useHeatmapControl('visible')
  const hour = useAnimationFrameValue(useHeatmapControl('hour'))
  const staticPaint = useMemo(() => heatmapStaticPaint(stepDeg), [stepDeg])

  return (
    <Source id={HEATMAP_SOURCE_ID} type="geojson" data={data}>
      <Layer
        id={HEATMAP_LAYER_ID}
        type="heatmap"
        paint={heatmapPaint(metric, hour, staticPaint)}
        layout={{ visibility: visible ? 'visible' : 'none' }}
      />
    </Source>
  )
})
