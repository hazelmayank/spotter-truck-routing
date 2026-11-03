import { RISK_COLORS, RISK_LABELS } from '../lib/risk'
import type { RiskLevel } from '../types'

export function LevelBadge({ level }: { level: RiskLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block size-3 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ backgroundColor: RISK_COLORS[level] }}
      />
      {RISK_LABELS[level]}
    </span>
  )
}
