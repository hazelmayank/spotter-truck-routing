import { formatClockTime } from '../lib/format'
import type { Checkpoint } from '../types'
import { LevelBadge } from './LevelBadge'

interface CheckpointListProps {
  routeId: string
  checkpoints: Checkpoint[]
  activeIndex: number | null
  onShow: (routeId: string, index: number) => void
}

export function CheckpointList({ routeId, checkpoints, activeIndex, onShow }: CheckpointListProps) {
  return (
    <ul
      aria-label={`Route ${routeId} checkpoints`}
      className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 bg-white"
    >
      {checkpoints.map((checkpoint, index) => (
        <li key={checkpoint.mile}>
          <button
            type="button"
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => onShow(routeId, index)}
            className={`grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${
              index === activeIndex ? 'bg-blue-50' : ''
            }`}
          >
            <span className="font-medium">Mile {checkpoint.mile}</span>
            <span className="text-slate-600">{formatClockTime(checkpoint.eta)}</span>
            <LevelBadge level={checkpoint.level} />
          </button>
        </li>
      ))}
    </ul>
  )
}
