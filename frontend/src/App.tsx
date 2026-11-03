import { Suspense, lazy, useMemo } from 'react'
import { useHeatmap, usePlan, useRestoredPlan } from './api/hooks'
import { HeatmapControlsProvider } from './components/HeatmapControlsProvider'
import { HeatmapPanel } from './components/HeatmapPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { TripForm } from './components/TripForm'
import { useRouteFocus } from './hooks/useRouteFocus'
import { heatmapGeoJson } from './lib/heatmap'

// The map library is large; load it after the form is usable.
const MapView = lazy(() => import('./components/MapView'))

export default function App() {
  const mutation = usePlan()
  const restored = useRestoredPlan()
  // Until a plan is requested in this session, show the one saved by the last session.
  const showingRestored = mutation.isIdle && restored !== null
  const plan = showingRestored ? restored.plan : mutation.data
  const focus = useRouteFocus(plan)

  // The heatmap starts once a plan exists, and routes stay usable while it loads.
  const heatmap = useHeatmap(plan?.routes, plan?.departure ?? '', plan?.load_lb ?? 0)
  const heatmapData = useMemo(
    () => (heatmap.data ? heatmapGeoJson(heatmap.data) : undefined),
    [heatmap.data],
  )

  return (
    <HeatmapControlsProvider>
      <div className="flex h-dvh flex-col md:flex-row">
        <aside className="flex max-h-[60dvh] shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-b border-slate-200 p-4 md:max-h-none md:w-[380px] md:border-r md:border-b-0">
          <h1 className="text-lg font-semibold">Weather-Aware Truck Routing</h1>
          <TripForm
            isPending={mutation.isPending}
            serverErrors={mutation.error?.fieldErrors}
            onSubmit={mutation.mutate}
          />
          <ResultsPanel
            plan={plan}
            error={mutation.error}
            isPending={mutation.isPending}
            restoredAt={showingRestored ? restored.savedAt : undefined}
            focus={focus}
            onRetry={() => mutation.variables && mutation.mutate(mutation.variables)}
          />
        </aside>
        <main aria-label="Map" className="relative min-h-[40dvh] flex-1 bg-slate-100">
          <Suspense fallback={<p className="p-4 text-sm text-slate-500">Loading map…</p>}>
            <MapView
              plan={plan}
              hoveredId={focus.hoveredId}
              selectedId={focus.selectedId}
              checkpoint={focus.checkpoint}
              heatmap={heatmapData}
              heatmapStepDeg={heatmap.data?.step_deg}
              onHover={focus.hover}
              onSelect={focus.select}
              onCheckpoint={focus.showCheckpoint}
            />
          </Suspense>
          <HeatmapPanel data={heatmap.data} isLoading={heatmap.isLoading} error={heatmap.error} />
        </main>
      </div>
    </HeatmapControlsProvider>
  )
}
