import { afterEach, describe, expect, it, vi } from 'vitest'
import { makePlan } from '../test/fixtures'
import { loadLastPlan, loadTripValues, saveLastPlan, saveTripValues } from './saved'
import type { TripValues } from './trip'

const values: TripValues = {
  origin: 'Dallas, TX',
  destination: 'Denver, CO',
  departure: '2026-11-03T15:00',
  load_lb: '42000',
  interval_miles: '50',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('trip values', () => {
  it('are loaded as they were saved', () => {
    saveTripValues(values)

    expect(loadTripValues()).toEqual(values)
  })

  it('are null when nothing was saved', () => {
    expect(loadTripValues()).toBeNull()
  })

  it.each([
    ['not JSON', '{oops'],
    ['not an object', '"Dallas"'],
    ['a missing field', JSON.stringify({ ...values, load_lb: undefined })],
    ['a number where text is expected', JSON.stringify({ ...values, load_lb: 42000 })],
  ])('are ignored when the saved entry is %s', (_, raw) => {
    sessionStorage.setItem('trip-form', raw)

    expect(loadTripValues()).toBeNull()
  })
})

describe('last plan', () => {
  it('is loaded with the time it was saved', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T14:20:00Z'))
    const plan = makePlan()

    saveLastPlan(plan)

    expect(loadLastPlan()).toEqual({ plan, savedAt: '2026-11-03T14:20:00.000Z' })
  })

  it('is null when nothing was saved', () => {
    expect(loadLastPlan()).toBeNull()
  })

  it.each([
    ['not JSON', 'garbage'],
    ['an array', '[]'],
    ['without a time', JSON.stringify({ plan: makePlan() })],
    [
      'without routes',
      JSON.stringify({ savedAt: 'x', plan: { ...makePlan(), routes: undefined } }),
    ],
    [
      'without an explanation',
      JSON.stringify({ savedAt: 'x', plan: { ...makePlan(), explanation: 1 } }),
    ],
    [
      'without a departure',
      JSON.stringify({ savedAt: 'x', plan: { ...makePlan(), departure: 1 } }),
    ],
    ['without a load', JSON.stringify({ savedAt: 'x', plan: { ...makePlan(), load_lb: '42000' } })],
    ['without places', JSON.stringify({ savedAt: 'x', plan: { ...makePlan(), origin: null } })],
  ])('is ignored when the saved entry is %s', (_, raw) => {
    sessionStorage.setItem('last-plan', raw)

    expect(loadLastPlan()).toBeNull()
  })
})

describe('when storage is not available', () => {
  it('saving does nothing instead of failing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => saveLastPlan(makePlan())).not.toThrow()
    expect(() => saveTripValues(values)).not.toThrow()
  })

  it('loading finds nothing instead of failing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(loadLastPlan()).toBeNull()
    expect(loadTripValues()).toBeNull()
  })
})
