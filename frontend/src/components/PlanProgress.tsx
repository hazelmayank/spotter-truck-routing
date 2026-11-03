import { useEffect, useState } from 'react'
import { progressStep } from '../lib/progress'

const TICK_MS = 500
const PLACEHOLDER_CARDS = [0, 1, 2]

export function PlanProgress() {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <section aria-label="Planning" className="flex flex-col gap-3">
      <div>
        <p role="status" className="text-sm font-medium text-slate-700">
          {progressStep(elapsedMs)}
        </p>
        <p className="text-xs text-slate-500">This usually takes around 10 seconds.</p>
      </div>
      <ul aria-hidden="true" className="flex flex-col gap-2">
        {PLACEHOLDER_CARDS.map((placeholder) => (
          <li
            key={placeholder}
            className="h-36 animate-pulse rounded border border-slate-200 bg-slate-100"
          />
        ))}
      </ul>
    </section>
  )
}
