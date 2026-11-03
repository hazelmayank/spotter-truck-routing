export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`
}

/** A UTC ISO time in the viewer's timezone, or in `timeZone` when given. */
export function formatLocalTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  })
}

export function formatMeasure(value: number | null, unit: string): string {
  return value === null ? 'n/a' : `${value} ${unit}`
}

/** Weekday and clock time, enough to tell days apart on a multi-day trip. */
export function formatClockTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}
