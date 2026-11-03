import { memo } from 'react'
import { formatLocalTime, formatMeasure } from '../lib/format'
import type { Checkpoint } from '../types'
import { LevelBadge } from './LevelBadge'

interface CheckpointPopupProps {
  routeId: string
  checkpoint: Checkpoint
}

export const CheckpointPopup = memo(function CheckpointPopup({
  routeId,
  checkpoint,
}: CheckpointPopupProps) {
  const { wind_mph, gust_mph, rain_in_hr, snow_in_hr } = checkpoint
  const wind =
    wind_mph !== null && gust_mph !== null
      ? `${wind_mph} mph (gusts ${gust_mph} mph)`
      : formatMeasure(wind_mph, 'mph')

  return (
    <div className="flex flex-col gap-1 text-sm text-slate-900">
      <p className="font-semibold">
        Route {routeId} · mile {checkpoint.mile}
      </p>
      <p>{formatLocalTime(checkpoint.eta)}</p>
      <p>
        <LevelBadge level={checkpoint.level} />
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt className="text-slate-500">Wind</dt>
        <dd>{wind}</dd>
        <dt className="text-slate-500">Rain</dt>
        <dd>{formatMeasure(rain_in_hr, 'in/hr')}</dd>
        <dt className="text-slate-500">Snow</dt>
        <dd>{formatMeasure(snow_in_hr, 'in/hr')}</dd>
      </dl>
      {checkpoint.reasons.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-slate-700">
          {checkpoint.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  )
})
