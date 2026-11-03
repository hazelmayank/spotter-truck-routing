import { useHeatmapControl, useHeatmapStore } from '../hooks/useHeatmapControls'
import { METRICS, METRIC_ORDER } from '../lib/heatmap'
import type { HeatmapResponse } from '../types'
import { HeatmapSlider } from './HeatmapSlider'

interface HeatmapPanelProps {
  data: HeatmapResponse | undefined
  isLoading: boolean
  error: Error | null
}

const CHIP_CLASS = 'w-fit rounded-full bg-white/95 px-3 py-1 text-xs text-slate-700 shadow'

export function HeatmapPanel({ data, isLoading, error }: HeatmapPanelProps) {
  if (isLoading) {
    return (
      <div className="absolute top-3 left-3">
        <p role="status" className={CHIP_CLASS}>
          Loading weather heatmap…
        </p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="absolute top-3 left-3">
        <p role="status" className={CHIP_CLASS}>
          Weather heatmap unavailable: {error.message}
        </p>
      </div>
    )
  }
  if (!data) return null

  return (
    <section
      aria-label="Weather heatmap"
      className="absolute top-3 left-3 flex w-[min(26rem,calc(100%-6rem))] flex-col gap-2 rounded bg-white/95 p-3 shadow"
    >
      <HeatmapOptions />
      <HeatmapSlider start={data.start} hours={data.hours} />
    </section>
  )
}

/** Metric and visibility; it never reads the hour, so scrubbing does not re-render it. */
function HeatmapOptions() {
  const store = useHeatmapStore()
  const metric = useHeatmapControl('metric')
  const visible = useHeatmapControl('visible')

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Heatmap metric" className="flex gap-1">
          {METRIC_ORDER.map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded border px-2 py-0.5 text-xs ${
                option === metric
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="heatmap-metric"
                value={option}
                checked={option === metric}
                onChange={() => store.setMetric(option)}
                className="sr-only"
              />
              {METRICS[option].label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => store.setVisible(event.target.checked)}
          />
          Show
        </label>
      </div>
      <p className="text-xs text-slate-500">{METRICS[metric].scale}</p>
    </div>
  )
}
