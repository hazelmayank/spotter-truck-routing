import { describe, expect, it } from 'vitest'
import {
  initialTripValues,
  nextFullHour,
  toPlanRequest,
  toUtcIso,
  validateTrip,
  type TripValues,
} from './trip'

const valid: TripValues = {
  origin: 'Dallas, TX',
  destination: 'Denver, CO',
  departure: '2026-11-03T15:00',
  load_lb: '40000',
  interval_miles: '25',
}

describe('nextFullHour', () => {
  it.each([
    [new Date(2026, 10, 3, 14, 20), '2026-11-03T15:00'],
    [new Date(2026, 10, 3, 14, 0), '2026-11-03T15:00'],
    [new Date(2026, 10, 3, 23, 59), '2026-11-04T00:00'],
    [new Date(2026, 11, 31, 23, 30), '2027-01-01T00:00'],
  ])('%s becomes %s', (now, expected) => {
    expect(nextFullHour(now)).toBe(expected)
  })
})

describe('toUtcIso', () => {
  it('is the UTC instant of the local date and time', () => {
    const iso = toUtcIso('2026-11-03T15:00')

    const instant = new Date(iso)
    expect(iso).toMatch(/Z$/)
    expect([instant.getFullYear(), instant.getMonth(), instant.getDate()]).toEqual([2026, 10, 3])
    expect([instant.getHours(), instant.getMinutes()]).toEqual([15, 0])
  })
})

describe('initialTripValues', () => {
  it('defaults to the next hour, 40,000 lb and 25 miles', () => {
    expect(initialTripValues(new Date(2026, 10, 3, 14, 20))).toEqual({
      origin: '',
      destination: '',
      departure: '2026-11-03T15:00',
      load_lb: '40000',
      interval_miles: '25',
    })
  })
})

describe('validateTrip', () => {
  it('accepts a complete trip', () => {
    expect(validateTrip(valid)).toEqual({})
  })

  it.each([
    ['origin', '', 'Enter an origin.'],
    ['origin', '   ', 'Enter an origin.'],
    ['origin', 'x'.repeat(201), 'Use at most 200 characters.'],
    ['destination', '', 'Enter a destination.'],
    ['departure', '', 'Choose a departure date and time.'],
    ['departure', 'not a date', 'Choose a departure date and time.'],
    ['load_lb', '', 'Enter a whole number from 1 to 80,000.'],
    ['load_lb', '0', 'Enter a whole number from 1 to 80,000.'],
    ['load_lb', '80001', 'Enter a whole number from 1 to 80,000.'],
    ['load_lb', '40000.5', 'Enter a whole number from 1 to 80,000.'],
    ['load_lb', 'heavy', 'Enter a whole number from 1 to 80,000.'],
    ['interval_miles', '30', 'Choose 10, 25 or 50 miles.'],
  ] as const)('rejects %s = "%s"', (field, value, message) => {
    expect(validateTrip({ ...valid, [field]: value })).toEqual({ [field]: message })
  })

  it.each(['1', '80000'])('accepts a load of %s lb', (load) => {
    expect(validateTrip({ ...valid, load_lb: load })).toEqual({})
  })

  it.each(['10', '25', '50'])('accepts an interval of %s miles', (interval) => {
    expect(validateTrip({ ...valid, interval_miles: interval })).toEqual({})
  })

  it('reports every invalid field at once', () => {
    const errors = validateTrip({ ...valid, origin: '', load_lb: '0' })

    expect(Object.keys(errors)).toEqual(['origin', 'load_lb'])
  })
})

describe('toPlanRequest', () => {
  it('trims places, converts the departure to UTC and the numbers to numbers', () => {
    const request = toPlanRequest({ ...valid, origin: '  Dallas, TX ', interval_miles: '50' })

    expect(request).toEqual({
      origin: 'Dallas, TX',
      destination: 'Denver, CO',
      departure: new Date('2026-11-03T15:00').toISOString(),
      load_lb: 40000,
      interval_miles: 50,
    })
  })
})
