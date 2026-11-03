import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, makePlan, stubFetch } from '../test/fixtures'
import type { PlanRequest } from '../types'
import { ApiError, requestHeatmap, requestPlan } from './client'

const request: PlanRequest = {
  origin: 'Dallas, TX',
  destination: 'Denver, CO',
  departure: '2026-11-03T15:00:00.000Z',
  load_lb: 42000,
  interval_miles: 25,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('requestPlan', () => {
  it('posts the request as JSON and returns the parsed plan', async () => {
    const plan = makePlan()
    const fetchMock = stubFetch(jsonResponse(plan))

    const result = await requestPlan(request)

    expect(result).toEqual(plan)
    expect(fetchMock).toHaveBeenCalledWith('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: expect.any(AbortSignal),
    })
  })

  it('prefixes the path with VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.resetModules()
    const fetchMock = stubFetch(jsonResponse(makePlan()))

    const client = await import('./client')
    await client.requestPlan(request)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/plan')
  })

  it('turns a 400 into field errors', async () => {
    stubFetch(jsonResponse({ load_lb: ['Ensure this value is less than or equal to 80000.'] }, 400))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(400)
    expect(error.fieldErrors).toEqual({
      load_lb: ['Ensure this value is less than or equal to 80000.'],
    })
  })

  it.each([
    [422, "no match for 'Nowhereville'"],
    [502, 'The routing service is not responding. Please try again in a moment.'],
  ])('shows the backend message for a %s', async (status, message) => {
    stubFetch(jsonResponse({ error: message }, status))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(status)
    expect(error.message).toBe(message)
    expect(error.fieldErrors).toEqual({})
  })

  it('falls back to a generic message when the body is not the expected JSON', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(502)
    expect(error.message).toBe('The request failed (HTTP 502).')
  })

  it('reports a network failure with status 0', async () => {
    stubFetch(new TypeError('Failed to fetch'))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Could not reach the server/)
  })

  it('reports a request that ran out of time with its own message', async () => {
    // stubFetch only rejects with Error instances, and jsdom's DOMException is not one.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(0)
    expect(error.message).toMatch(/took too long/)
  })

  it('asks the user to wait after a 429', async () => {
    stubFetch(jsonResponse({ detail: 'Request was throttled.' }, 429))

    const error = await failureOf(requestPlan(request))

    expect(error.status).toBe(429)
    expect(error.message).toMatch(/Too many requests/)
  })
})

describe('requestHeatmap', () => {
  it('posts to /api/heatmap', async () => {
    const fetchMock = stubFetch(jsonResponse({ start: '2026-11-03T12:00:00Z', points: [] }))

    const result = await requestHeatmap({ routes: [], departure: request.departure, load_lb: 1 })

    expect(result).toEqual({ start: '2026-11-03T12:00:00Z', points: [] })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/heatmap')
  })
})

describe('VITE_API_BASE_URL', () => {
  it.each(['https://api.example.test', 'https://api.example.test/', 'https://api.example.test///'])(
    'joins %s and the path with a single slash',
    async (base) => {
      vi.stubEnv('VITE_API_BASE_URL', base)
      vi.resetModules()
      const fetchMock = stubFetch(jsonResponse(makePlan()))

      const client = await import('./client')
      await client.requestPlan(request)

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/plan')
    },
  )
})
