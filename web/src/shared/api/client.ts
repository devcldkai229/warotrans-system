import type { Session } from './contracts'
import type { ProblemError } from './types'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5090').replace(/\/+$/, '')

const REFRESH_LOCK = 'warotrans.session-refresh'

/**
 * A non-2xx API response.
 * `code` is the backend ProblemDetails machine-readable code.
 * `errors` carries field-level validation paths (e.g. workflow publish).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly errors: ProblemError[]

  constructor(
    status: number,
    code: string | null,
    message: string,
    errors: ProblemError[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errors = errors
  }
}

// Access token lives only in memory: gone on reload, restored via HttpOnly refresh cookie.
let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshInFlight: Promise<Session | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Called when a request fails with 401 and the session cannot be refreshed any more. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

async function toApiError(response: Response): Promise<ApiError> {
  let code: string | null = null
  let message = `Request failed (${response.status})`
  let errors: ProblemError[] = []
  try {
    const problem = (await response.json()) as {
      code?: string
      detail?: string
      title?: string
      errors?: ProblemError[]
    }
    code = problem.code ?? null
    message = problem.detail || problem.title || message
    errors = problem.errors ?? []
  } catch {
    // Not a ProblemDetails body (e.g. empty 401/403 from auth middleware).
  }
  return new ApiError(response.status, code, message, errors)
}

function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // `include` lets Identity endpoints receive/rotate the refresh cookie across dev origins.
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' })
}

async function requestNewSession(): Promise<Session | null> {
  const response = await send('/api/identity/refresh', { method: 'POST' }, null)
  if (!response.ok) {
    accessToken = null
    return null
  }
  const session = (await response.json()) as Session
  accessToken = session.accessToken
  return session
}

/**
 * Exchanges the refresh cookie for a new session, or null when there is none.
 * Concurrent callers share one request; Web Lock keeps other tabs from spending the same cookie.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (
    navigator.locks
      ? navigator.locks.request(REFRESH_LOCK, requestNewSession)
      : requestNewSession()
  ).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/** Sends a JSON request. On 401 refreshes once and retries before giving up. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init, accessToken)

  if (response.status === 401 && accessToken) {
    const session = await refreshSession()
    if (!session) {
      onSessionExpired?.()
      throw await toApiError(response)
    }
    response = await send(path, init, session.accessToken)
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Alias for workflow modules that still call `apiFetch`. */
export const apiFetch = apiRequest