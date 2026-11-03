import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryWrapper } from '../test/QueryWrapper'
import { jsonResponse, makePlan, stubFetch } from '../test/fixtures'
import type { PlanRequest } from '../types'
import { ApiError } from './client'
import { useHeatmap, usePlan } from './hooks'

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
  it('runs the request when mutate is called and exposes the plan', async () => {
    const plan = makePlan()
    const fetchMock = stubFetch(jsonResponse(plan))
    const { result } = renderHook(() => usePlan(), { wrapper: QueryWrapper })

    expect(fetchMock).not.toHaveBeenCalled()
    result.current.mutate(request)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(plan)
  })

  it('exposes backend failures as an ApiError', async () => {
    stubFetch(jsonResponse({ error: 'no route found' }, 422))
    const { result } = renderHook(() => usePlan(), { wrapper: QueryWrapper })

    result.current.mutate(request)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.message).toBe('no route found')
  })
})

describe('useHeatmap', () => {
  const departure = '2026-11-03T15:00:00.000Z'

  it('does not request anything before a plan exists', () => {
    const fetchMock = stubFetch()

    const { result } = renderHook(() => useHeatmap(undefined, departure, 42000), {
      wrapper: QueryWrapper,
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests the heatmap once with only the route ids and geometry', async () => {
    const heatmap = { start: '2026-11-03T15:00:00Z', points: [] }
    const fetchMock = stubFetch(jsonResponse(heatmap))
    const { routes } = makePlan()

    const { result, rerender } = renderHook(() => useHeatmap(routes, departure, 42000), {
      wrapper: QueryWrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender()

    expect(result.current.data).toEqual(heatmap)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/heatmap')
    expect(JSON.parse(init.body as string)).toEqual({
      routes: [{ id: 'A', geometry: routes[0].geometry }],
      departure,
      load_lb: 42000,
    })
  })
})
