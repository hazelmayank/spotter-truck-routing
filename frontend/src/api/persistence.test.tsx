import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLastPlan, saveLastPlan } from '../lib/saved'
import { QueryWrapper } from '../test/QueryWrapper'
import { jsonResponse, makePlan, makeThreeRoutePlan, stubFetch } from '../test/fixtures'
import type { PlanRequest } from '../types'
import { usePlan, useRestoredPlan } from './hooks'

afterEach(() => {
  vi.unstubAllGlobals()
})

const request: PlanRequest = {
  origin: 'Dallas, TX',
  destination: 'Denver, CO',
  departure: '2026-11-03T15:00:00.000Z',
  load_lb: 42000,
  interval_miles: 25,
}

describe('usePlan', () => {
  it('saves the plan when the request succeeds', async () => {
    const plan = makeThreeRoutePlan()
    stubFetch(jsonResponse(plan))
    const { result } = renderHook(() => usePlan(), { wrapper: QueryWrapper })

    result.current.mutate(request)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(loadLastPlan()?.plan).toEqual(plan)
  })

  it('keeps the previous saved plan when a request fails', async () => {
    const earlier = makePlan()
    saveLastPlan(earlier)
    stubFetch(jsonResponse({ error: 'no route found' }, 422))
    const { result } = renderHook(() => usePlan(), { wrapper: QueryWrapper })

    result.current.mutate(request)
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(loadLastPlan()?.plan).toEqual(earlier)
  })
})

describe('useRestoredPlan', () => {
  it('returns the plan saved earlier', () => {
    const plan = makePlan()
    saveLastPlan(plan)

    const { result } = renderHook(() => useRestoredPlan())

    expect(result.current?.plan).toEqual(plan)
    expect(result.current?.savedAt).toEqual(expect.any(String))
  })

  it('returns null when nothing was saved', () => {
    const { result } = renderHook(() => useRestoredPlan())

    expect(result.current).toBeNull()
  })

  it('reads the saved plan once, so later saves do not swap the shown plan', () => {
    const first = makePlan()
    saveLastPlan(first)
    const { result, rerender } = renderHook(() => useRestoredPlan())

    saveLastPlan(makeThreeRoutePlan())
    rerender()

    expect(result.current?.plan).toEqual(first)
  })
})
