import { memo } from 'react'
import { formatClockTime, formatMeasure } from '../lib/format'
import type { Checkpoint } from '../types'
import { LevelBadge } from './LevelBadge'

interface CheckpointTooltipProps {
  routeId: string
  checkpoint: Checkpoint
}

/** The short version of the checkpoint popup, shown while hovering a checkpoint. */
export const CheckpointTooltip = memo(function CheckpointTooltip({
  routeId,
  checkpoint,
}: CheckpointTooltipProps) {
  const { wind_mph, rain_in_hr, snow_in_hr } = checkpoint

  return (
    <div className="flex flex-col gap-0.5 text-xs text-slate-900">
      <p className="font-semibold">
        Route {routeId} · mile {checkpoint.mile}
      </p>
      <p>
        {formatClockTime(checkpoint.eta)} · <LevelBadge level={checkpoint.level} />
      </p>
      <p>
        Wind {formatMeasure(wind_mph, 'mph')} · Rain {formatMeasure(rain_in_hr, 'in/hr')}
        {snow_in_hr ? ` · Snow ${snow_in_hr} in/hr` : ''}
      </p>
    </div>
  )
})
