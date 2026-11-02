import type {
  FieldErrors,
  HeatmapRequest,
  HeatmapResponse,
  PlanRequest,
  PlanResponse,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  readonly status: number // 0 when the server could not be reached
  readonly fieldErrors: FieldErrors

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export const requestPlan = (request: PlanRequest) => post<PlanResponse>('/api/plan', request)

export const requestHeatmap = (request: HeatmapRequest) =>
  post<HeatmapResponse>('/api/heatmap', request)

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 400 && isFieldErrors(body)) {
    return new ApiError('Some fields need attention.', 400, body)
  }
  if (hasErrorMessage(body)) return new ApiError(body.error, response.status)
  return new ApiError(`The request failed (HTTP ${response.status}).`, response.status)
}

function hasErrorMessage(body: unknown): body is { error: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
  )
}

function isFieldErrors(body: unknown): body is FieldErrors {
  return (
    typeof body === 'object' &&
    body !== null &&
    Object.values(body).every(
      (messages) => Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  )
}
