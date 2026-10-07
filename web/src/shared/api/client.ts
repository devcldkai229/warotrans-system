import type { Session } from './contracts'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5090').replace(/\/+$/, '')

const REFRESH_LOCK = 'warotrans.session-refresh'

/** A non-2xx API response. `code` is the backend's machine-readable error code (ProblemDetails `code`). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, code: string | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// The access token lives only in memory: it is gone on reload and restored through the HttpOnly refresh cookie,
// so page scripts never have a long-lived credential to leak.
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
  try {
    const problem = (await response.json()) as { code?: string; detail?: string }
    code = problem.code ?? null
    message = problem.detail ?? message
  } catch {
    // Not a ProblemDetails body (for example the empty 401/403 written by the auth middleware).
  }
  return new ApiError(response.status, code, message)
}

function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  // `include` lets the Identity endpoints receive and rotate the refresh cookie across the dev origins.
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
 * Exchanges the refresh cookie for a new session, or resolves to null when there is none.
 * A refresh token works once, so concurrent callers share one request, and the Web Lock keeps other tabs from
 * spending the same cookie at the same moment (the backend treats a reused token as stolen and ends the session).
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (
    navigator.locks ? navigator.locks.request(REFRESH_LOCK, requestNewSession) : requestNewSession()
  ).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/** Sends a JSON request to the API. On 401 it refreshes the session once and retries before giving up. */
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
