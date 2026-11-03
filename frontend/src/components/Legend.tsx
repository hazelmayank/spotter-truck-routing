import { memo } from 'react'
import { RISK_LEVELS } from '../lib/risk'
import { LevelBadge } from './LevelBadge'

/** Risk colors with their names, and the origin and destination symbols. Compact on phones. */
export const Legend = memo(function Legend() {
  return (
    <div
      aria-label="Legend"
      role="group"
      className="pointer-events-none absolute right-3 bottom-14 left-3 rounded bg-white/90 p-2 text-xs shadow md:right-auto md:bottom-6"
    >
      <p className="mb-1 hidden font-medium text-slate-700 md:block">Checkpoint risk</p>
      <ul aria-label="Checkpoint risk" className="flex flex-wrap gap-x-3 gap-y-0.5 md:flex-col">
        {RISK_LEVELS.map((level) => (
          <li key={level}>
            <LevelBadge level={level} />
          </li>
        ))}
      </ul>
      <ul className="mt-1 flex gap-x-3 border-t border-slate-200 pt-1 md:mt-2 md:flex-col md:gap-y-0.5">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-full bg-slate-900" />
          Origin
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full border-[3px] border-slate-900 bg-white"
          />
          Destination
        </li>
      </ul>
    </div>
  )
})
