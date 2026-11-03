import type { ApiError } from '../api/client'
import type { RouteFocus } from '../hooks/useRouteFocus'
import type { PlanResponse } from '../types'
import { PlanProgress } from './PlanProgress'
import { RecommendationBanner } from './RecommendationBanner'
import { RouteCard } from './RouteCard'

interface ResultsPanelProps {
  plan: PlanResponse | undefined
  error: ApiError | null
  isPending: boolean
  restoredAt?: string
  focus: RouteFocus
  onRetry: () => void
}

export function ResultsPanel({
  plan,
  error,
  isPending,
  restoredAt,
  focus,
  onRetry,
}: ResultsPanelProps) {
  if (isPending) return <PlanProgress />
  // A 400 is shown next to the form fields it is about.
  if (error && error.status !== 400) return <ErrorState message={error.message} onRetry={onRetry} />
  if (!plan) return <EmptyState />

  const byRank = [...plan.routes].sort((a, b) => a.rank - b.rank)
  return (
    <div className="flex flex-col gap-3">
      <RecommendationBanner plan={plan} restoredAt={restoredAt} />
      <ul aria-label="Routes" className="flex flex-col gap-2">
        {byRank.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            recommended={route.id === plan.recommended_route_id}
            selected={route.id === focus.selectedId}
            hovered={route.id === focus.hoveredId}
            activeCheckpointIndex={
              focus.checkpoint?.routeId === route.id ? focus.checkpoint.index : null
            }
            onHover={focus.hover}
            onSelect={focus.select}
            onShowCheckpoint={(routeId, index) =>
              focus.showCheckpoint({ routeId, index, source: 'list' })
            }
          />
        ))}
      </ul>
    </div>
  )
}

function EmptyState() {
  return (
    <section
      aria-label="No results yet"
      className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-600"
    >
      <p className="font-medium text-slate-700">No trip planned yet</p>
      <p>
        Enter an origin and a destination, then choose Plan routes to compare the weather risk on up
        to three routes. Use the sample trip to try it.
      </p>
    </section>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded bg-red-50 p-3 text-sm text-red-800"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-800"
      >
        Retry
      </button>
    </div>
  )
}
