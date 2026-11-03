import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../lib/risk'
import type { RouteSummary } from '../types'

/** A stacked bar of the route's miles per risk level. */
export function RiskBar({ milesByLevel }: { milesByLevel: RouteSummary['miles_by_level'] }) {
  const total = RISK_LEVELS.reduce((sum, level) => sum + milesByLevel[level], 0)
  const description = RISK_LEVELS.filter((level) => milesByLevel[level] > 0)
    .map((level) => `${RISK_LABELS[level]} ${milesByLevel[level].toFixed(1)} mi`)
    .join(', ')

  return (
    <div
      role="img"
      aria-label={`Miles by risk level: ${description}`}
      className="flex h-2 w-full overflow-hidden rounded bg-slate-200"
    >
      {RISK_LEVELS.filter((level) => milesByLevel[level] > 0).map((level) => (
        <div
          key={level}
          style={{
            width: `${(milesByLevel[level] / total) * 100}%`,
            backgroundColor: RISK_COLORS[level],
          }}
        />
      ))}
    </div>
  )
}
