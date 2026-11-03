import { createContext, useContext, useSyncExternalStore } from 'react'
import type { HeatmapControls, HeatmapStore } from '../store/heatmapStore'

export const HeatmapStoreContext = createContext<HeatmapStore | null>(null)

/** The store itself, for setters. It never changes, so reading it never causes a re-render. */
export function useHeatmapStore(): HeatmapStore {
  const store = useContext(HeatmapStoreContext)
  if (!store) throw new Error('HeatmapControlsProvider is missing')
  return store
}

/** One control value; the component re-renders only when that value changes. */
export function useHeatmapControl<K extends keyof HeatmapControls>(key: K): HeatmapControls[K] {
  const store = useHeatmapStore()
  return useSyncExternalStore(store.subscribe, () => store.getState()[key])
}
