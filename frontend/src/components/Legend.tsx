import { RISK_LEVELS } from '../lib/risk'
import { LevelBadge } from './LevelBadge'

export function Legend() {
  return (
    <div
      aria-label="Legend"
      role="group"
      className="pointer-events-none absolute bottom-6 left-3 rounded bg-white/90 p-2 text-xs shadow"
    >
      <p className="mb-1 font-medium text-slate-700">Checkpoint risk</p>
      <ul className="flex flex-col gap-0.5">
        {RISK_LEVELS.map((level) => (
          <li key={level}>
            <LevelBadge level={level} />
          </li>
        ))}
      </ul>
      <ul className="mt-2 flex flex-col gap-0.5 border-t border-slate-200 pt-1">
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
}
