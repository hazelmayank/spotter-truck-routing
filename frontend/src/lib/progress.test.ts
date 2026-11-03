import { describe, expect, it } from 'vitest'
import { progressStep } from './progress'

describe('progressStep', () => {
  it.each([
    [0, 'Finding places…'],
    [1_499, 'Finding places…'],
    [1_500, 'Finding routes…'],
    [7_999, 'Finding routes…'],
    [8_000, 'Checking weather…'],
    [120_000, 'Checking weather…'],
  ])('after %i ms says "%s"', (elapsedMs, text) => {
    expect(progressStep(elapsedMs)).toBe(text)
  })
})
