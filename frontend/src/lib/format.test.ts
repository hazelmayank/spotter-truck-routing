import { describe, expect, it } from 'vitest'
import {
  formatClockTime,
  formatDuration,
  formatLocalTime,
  formatMeasure,
  formatMiles,
} from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [29, '0 min'],
    [31, '1 min'],
    [45 * 60, '45 min'],
    [60 * 60, '1 h 0 min'],
    [47160, '13 h 6 min'],
    [90 * 3600 + 59 * 60, '90 h 59 min'],
  ])('%i seconds is %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('formatMiles', () => {
  it.each([
    [796.6, '796.6 mi'],
    [0, '0.0 mi'],
    [12.25, '12.3 mi'],
  ])('%f is %s', (miles, expected) => {
    expect(formatMiles(miles)).toBe(expected)
  })
})

describe('formatMeasure', () => {
  it('appends the unit', () => {
    expect(formatMeasure(12.5, 'mph')).toBe('12.5 mph')
    expect(formatMeasure(0, 'in/hr')).toBe('0 in/hr')
  })

  it('shows n/a for a missing value', () => {
    expect(formatMeasure(null, 'mph')).toBe('n/a')
  })
})

describe('formatLocalTime', () => {
  it('shows the day and time in the requested timezone', () => {
    const text = formatLocalTime('2026-11-03T20:30:00Z', 'America/Chicago')

    expect(text).toContain('Nov 3')
    expect(text).toMatch(/2:30\s?PM/)
  })

  it('moves to the next day when the timezone is ahead of UTC', () => {
    expect(formatLocalTime('2026-11-03T20:30:00Z', 'Asia/Kolkata')).toContain('Nov 4')
  })
})

describe('formatClockTime', () => {
  it('shows the weekday and the time in the requested timezone', () => {
    const text = formatClockTime('2026-11-03T20:30:00Z', 'America/Chicago')

    expect(text).toContain('Tue')
    expect(text).toMatch(/2:30\s?PM/)
  })

  it('shows the next weekday when the timezone is ahead of UTC', () => {
    expect(formatClockTime('2026-11-03T20:30:00Z', 'Asia/Kolkata')).toContain('Wed')
  })
})

describe('edge cases', () => {
  it('rounds a duration to the nearest minute, carrying into the hour', () => {
    expect(formatDuration(3570)).toBe('1 h 0 min') // 59.5 minutes
    expect(formatDuration(3569)).toBe('59 min')
  })

  it('shows one decimal for long distances', () => {
    expect(formatMiles(1234.56)).toBe('1234.6 mi')
  })

  it('shows a zero measurement as zero, not as missing', () => {
    expect(formatMeasure(0, 'mph')).toBe('0 mph')
  })

  it('formats a clock time without the month', () => {
    expect(formatClockTime('2026-11-03T20:30:00Z', 'UTC')).not.toMatch(/Nov/)
  })

  it('formats the same instant differently in different timezones', () => {
    const iso = '2026-11-03T20:30:00Z'

    expect(formatLocalTime(iso, 'Asia/Tokyo')).not.toBe(formatLocalTime(iso, 'America/Chicago'))
  })
})
