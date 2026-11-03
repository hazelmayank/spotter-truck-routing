import { useState, type ReactNode } from 'react'
import { HeatmapStoreContext } from '../hooks/useHeatmapControls'
import { createHeatmapStore } from '../store/heatmapStore'

export function HeatmapControlsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createHeatmapStore)
  return <HeatmapStoreContext value={store}>{children}</HeatmapStoreContext>
}
