import { memo, useState } from 'react'
import { formatDuration, formatLocalTime, formatMiles } from '../lib/format'
import type { Route } from '../types'
import { CheckpointList } from './CheckpointList'
import { LevelBadge } from './LevelBadge'
import { RiskBar } from './RiskBar'

// The decimals the backend ranks routes by, so close routes do not read as equal.
const AVG_RISK_DECIMALS = 3

interface RouteCardProps {
  route: Route
  recommended: boolean
  selected: boolean
  hovered: boolean
  activeCheckpointIndex: number | null // the checkpoint of this route whose popup is open
  onHover: (routeId: string | null) => void
  onSelect: (routeId: string) => void
  onShowCheckpoint: (routeId: string, index: number) => void
}

export const RouteCard = memo(function RouteCard({
  route,
  recommended,
  selected,
  hovered,
  activeCheckpointIndex,
  onHover,
  onSelect,
  onShowCheckpoint,
}: RouteCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { miles_by_level: miles, avg_risk, max_level } = route.summary

  return (
    <li
      className={`rounded border ${
        selected || hovered ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(route.id)}
        onMouseEnter={() => onHover(route.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(route.id)}
        onBlur={() => onHover(null)}
        className="flex w-full flex-col gap-1.5 p-3 text-left text-sm"
      >
        <span className="flex items-center justify-between">
          <span className="font-semibold">
            Route {route.id}{' '}
            <span className="text-xs font-normal text-slate-600">#{route.rank}</span>
          </span>
          {recommended && (
            <span className="rounded bg-blue-700 px-1.5 py-0.5 text-xs text-white">
              Recommended
            </span>
          )}
        </span>
        <span>
          {formatMiles(route.distance_mi)} · {formatDuration(route.duration_s)}
        </span>
        <span className="text-xs text-slate-600">Arrives {formatLocalTime(route.arrival)}</span>
        <RiskBar milesByLevel={miles} />
        <span className="text-xs text-slate-700">
          Severe {formatMiles(miles.SEVERE)} · High {formatMiles(miles.HIGH)}
          {miles.NO_TRAVEL > 0 && ` · No travel ${formatMiles(miles.NO_TRAVEL)}`}
        </span>
        <span className="flex items-center justify-between text-xs text-slate-700">
          <span>Average risk {avg_risk.toFixed(AVG_RISK_DECIMALS)}</span>
          <span className="flex items-center gap-1.5">
            Max <LevelBadge level={max_level} />
          </span>
        </span>
      </button>

      {selected && (
        <div className="flex flex-col gap-2 border-t border-slate-200 p-2">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between text-left text-xs font-medium text-blue-800"
          >
            Checkpoints ({route.checkpoints.length})
            <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
          </button>
          {expanded && (
            <CheckpointList
              routeId={route.id}
              checkpoints={route.checkpoints}
              activeIndex={activeCheckpointIndex}
              onShow={onShowCheckpoint}
            />
          )}
        </div>
      )}
    </li>
  )
})
