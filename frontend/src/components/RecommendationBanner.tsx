import { formatClockTime } from '../lib/format'
import type { PlanResponse } from '../types'

interface RecommendationBannerProps {
  plan: PlanResponse
  restoredAt?: string // set when the plan was loaded from the last session
}

export function RecommendationBanner({ plan, restoredAt }: RecommendationBannerProps) {
  // Every route crossing no-travel weather is the one case worth a red alert.
  const noRouteIsClear = plan.routes.every((route) => route.summary.miles_by_level.NO_TRAVEL > 0)

  return (
    <section aria-label="Recommendation" className="flex flex-col gap-2 text-sm">
      <div>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Recommended</p>
        <h2 className="text-base font-semibold">Route {plan.recommended_route_id}</h2>
      </div>
      <p>{plan.explanation}</p>
      {plan.warnings.map((warning) =>
        noRouteIsClear ? (
          <p key={warning} role="alert" className="rounded bg-red-50 p-2 text-red-800">
            {warning}
          </p>
        ) : (
          <p key={warning} className="rounded bg-amber-50 p-2 text-amber-900">
            {warning}
          </p>
        ),
      )}
      {restoredAt && (
        <p className="text-xs text-slate-500">
          Showing the plan from {formatClockTime(restoredAt)}. Plan again for current weather.
        </p>
      )}
    </section>
  )
}
