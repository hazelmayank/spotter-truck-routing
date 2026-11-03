import { useEffect } from 'react'
import { useHeatmapControl, useHeatmapStore } from '../hooks/useHeatmapControls'
import { formatHourLabel } from '../lib/heatmap'

const PLAY_INTERVAL_MS = 500

interface HeatmapSliderProps {
  start: string // UTC ISO 8601 time of hour 0
  hours: number
}

export function HeatmapSlider({ start, hours }: HeatmapSliderProps) {
  const store = useHeatmapStore()
  const storedHour = useHeatmapControl('hour')
  const playing = useHeatmapControl('playing')
  const lastHour = hours - 1
  const hour = Math.min(storedHour, lastHour)
  const label = formatHourLabel(start, hour)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const next = Math.min(store.getState().hour + 1, lastHour)
      store.setHour(next)
      if (next === lastHour) store.setPlaying(false)
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, lastHour, store])

  const togglePlaying = () => {
    if (!playing && hour === lastHour) store.setHour(0)
    store.setPlaying(!playing)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={togglePlaying}
        aria-label={playing ? 'Pause' : 'Play'}
        className="w-8 shrink-0 rounded border border-slate-300 bg-white py-1 text-sm"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={lastHour}
        step={1}
        value={hour}
        onChange={(event) => {
          store.setPlaying(false)
          store.setHour(Number(event.target.value))
        }}
        aria-label="Forecast hour"
        aria-valuetext={label}
        className="min-w-0 flex-1"
      />
      <output className="w-36 shrink-0 text-xs font-medium text-slate-700">{label}</output>
    </div>
  )
}
