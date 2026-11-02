import type { IntervalMiles, PlanRequest } from '../types'

export const MAX_LOAD_LB = 80_000
export const DEFAULT_LOAD_LB = 40_000
export const INTERVAL_OPTIONS: readonly IntervalMiles[] = [10, 25, 50]
export const DEFAULT_INTERVAL_MILES: IntervalMiles = 25
export const SAMPLE_TRIP = { origin: 'Dallas, TX', destination: 'Denver, CO' }

const MAX_PLACE_LENGTH = 200

// Field names match the API so server-side errors map straight onto inputs.
export interface TripValues {
  origin: string
  destination: string
  departure: string // datetime-local value, in the browser's timezone
  load_lb: string
  interval_miles: string
}

export type TripField = keyof TripValues
export type TripErrors = Partial<Record<TripField, string>>

export function initialTripValues(now = new Date()): TripValues {
  return {
    origin: '',
    destination: '',
    departure: nextFullHour(now),
    load_lb: String(DEFAULT_LOAD_LB),
    interval_miles: String(DEFAULT_INTERVAL_MILES),
  }
}

export function nextFullHour(now: Date): string {
  const next = new Date(now)
  next.setHours(now.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
  return `${date}T${pad(next.getHours())}:${pad(next.getMinutes())}`
}

/** A datetime-local value is read as local time, so this is the matching UTC instant. */
export function toUtcIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString()
}

export function validateTrip(values: TripValues): TripErrors {
  const errors: TripErrors = {}

  for (const field of ['origin', 'destination'] as const) {
    const place = values[field].trim()
    if (!place) errors[field] = `Enter ${field === 'origin' ? 'an origin' : 'a destination'}.`
    else if (place.length > MAX_PLACE_LENGTH)
      errors[field] = `Use at most ${MAX_PLACE_LENGTH} characters.`
  }

  if (!values.departure || Number.isNaN(new Date(values.departure).getTime())) {
    errors.departure = 'Choose a departure date and time.'
  }

  const load = Number(values.load_lb)
  if (values.load_lb.trim() === '' || !Number.isInteger(load) || load < 1 || load > MAX_LOAD_LB) {
    errors.load_lb = `Enter a whole number from 1 to ${MAX_LOAD_LB.toLocaleString('en-US')}.`
  }

  if (!INTERVAL_OPTIONS.includes(Number(values.interval_miles) as IntervalMiles)) {
    errors.interval_miles = 'Choose 10, 25 or 50 miles.'
  }
  return errors
}

export function toPlanRequest(values: TripValues): PlanRequest {
  return {
    origin: values.origin.trim(),
    destination: values.destination.trim(),
    departure: toUtcIso(values.departure),
    load_lb: Number(values.load_lb),
    interval_miles: Number(values.interval_miles) as IntervalMiles,
  }
}
