import { usePlan } from './api/hooks'
import { PlanResult } from './components/PlanResult'
import { TripForm } from './components/TripForm'

export default function App() {
  const plan = usePlan()

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="flex max-h-[60dvh] shrink-0 flex-col gap-4 overflow-y-auto border-b border-slate-200 p-4 md:max-h-none md:w-[380px] md:border-r md:border-b-0">
        <h1 className="text-lg font-semibold">Weather-Aware Truck Routing</h1>
        <TripForm
          isPending={plan.isPending}
          serverErrors={plan.error?.fieldErrors}
          onSubmit={plan.mutate}
        />
        <PlanResult plan={plan.data} error={plan.error} isPending={plan.isPending} />
      </aside>
      <main
        aria-label="Map"
        className="flex min-h-[40dvh] flex-1 items-center justify-center bg-slate-100 text-sm text-slate-500"
      >
        The map appears here.
      </main>
    </div>
  )
}
