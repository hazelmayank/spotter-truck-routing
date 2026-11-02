import type { ApiError } from '../api/client'
import type { PlanResponse } from '../types'

interface PlanResultProps {
  plan?: PlanResponse
  error: ApiError | null
  isPending: boolean
}

export function PlanResult({ plan, error, isPending }: PlanResultProps) {
  if (isPending) {
    return (
      <p role="status" className="text-sm text-slate-600">
        Planning routes and checking the weather. This can take around 10 seconds.
      </p>
    )
  }
  // A 400 is shown next to the fields it is about.
  if (error && error.status !== 400) {
    return (
      <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
        {error.message}
      </p>
    )
  }
  if (!plan) return null

  return (
    <section className="flex flex-col gap-2 text-sm">
      <p>{plan.explanation}</p>
      {plan.warnings.map((warning) => (
        <p key={warning} className="rounded bg-amber-50 p-2 text-amber-900">
          {warning}
        </p>
      ))}
    </section>
  )
}
