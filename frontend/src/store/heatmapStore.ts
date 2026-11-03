import type { HeatmapMetric } from '../types'

export interface HeatmapControls {
  hour: number
  metric: HeatmapMetric
  visible: boolean
  playing: boolean
}

export interface HeatmapStore {
  getState: () => HeatmapControls
  subscribe: (listener: () => void) => () => void
  setHour: (hour: number) => void
  setMetric: (metric: HeatmapMetric) => void
  setVisible: (visible: boolean) => void
  setPlaying: (playing: boolean) => void
}

/**
 * The heatmap controls live outside React state on purpose: only the components that read a
 * value re-render when it changes, so scrubbing the slider never reaches the map's route and
 * checkpoint layers.
 */
export function createHeatmapStore(): HeatmapStore {
  let state: HeatmapControls = { hour: 0, metric: 'risk', visible: true, playing: false }
  const listeners = new Set<() => void>()

  const update = (changes: Partial<HeatmapControls>) => {
    const unchanged = (Object.keys(changes) as (keyof HeatmapControls)[]).every(
      (key) => changes[key] === state[key],
    )
    if (unchanged) return
    state = { ...state, ...changes }
    listeners.forEach((listener) => listener())
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setHour: (hour) => update({ hour }),
    setMetric: (metric) => update({ metric }),
    setVisible: (visible) => update({ visible }),
    setPlaying: (playing) => update({ playing }),
  }
}
