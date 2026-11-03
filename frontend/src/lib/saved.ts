import type { PlanResponse } from '../types'
import type { TripValues } from './trip'

const TRIP_KEY = 'trip-form'
const PLAN_KEY = 'last-plan'

export interface SavedPlan {
  plan: PlanResponse
  savedAt: string // ISO 8601
}

export function loadTripValues(): TripValues | null {
  const value = read(TRIP_KEY)
  return isTripValues(value) ? value : null
}

export function saveTripValues(values: TripValues): void {
  write(TRIP_KEY, values)
}

export function loadLastPlan(): SavedPlan | null {
  const value = read(PLAN_KEY)
  return isSavedPlan(value) ? value : null
}

export function saveLastPlan(plan: PlanResponse): void {
  const saved: SavedPlan = { plan, savedAt: new Date().toISOString() }
  write(PLAN_KEY, saved)
}

function read(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    // Storage can be blocked, and an old or hand-edited entry can be invalid JSON.
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Blocked or full storage only means the next refresh starts empty.
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function isTripValues(value: unknown): value is TripValues {
  return (
    isObject(value) &&
    ['origin', 'destination', 'departure', 'load_lb', 'interval_miles'].every(
      (field) => typeof value[field] === 'string',
    )
  )
}

function isSavedPlan(value: unknown): value is SavedPlan {
  if (!isObject(value) || typeof value.savedAt !== 'string' || !isObject(value.plan)) return false
  const plan = value.plan
  return (
    Array.isArray(plan.routes) &&
    Array.isArray(plan.warnings) &&
    typeof plan.recommended_route_id === 'string' &&
    typeof plan.explanation === 'string' &&
    isObject(plan.origin) &&
    isObject(plan.destination)
  )
}
