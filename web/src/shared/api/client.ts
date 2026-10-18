import type { Session } from './contracts'
import type { ProblemError } from './types'

/**
 * Empty → same-origin (Vite proxies /api in dev). Absolute URL → direct Host.
 * Same-origin keeps the refresh HttpOnly cookie first-party to the SPA origin.
 */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

const REFRESH_LOCK = 'warotrans.session-refresh'
const REFRESH_TIMEOUT_MS = 8_000

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

/** Current in-memory access token (SignalR sends it as `access_token`). */
export function getAccessToken(): string | null {
  return accessToken
}

/** Backend base URL, e.g. for the SignalR hub. */
export function getApiUrl(): string {
  return API_URL
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
  // Let the browser set multipart boundary for FormData; JSON otherwise.
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // `include` lets Identity endpoints receive/rotate the refresh cookie across origins.
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' })
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function requestNewSession(): Promise<Session | null> {
  try {
    const response = await withTimeout(
      send('/api/identity/refresh', { method: 'POST' }, null),
      REFRESH_TIMEOUT_MS,
      'Session refresh',
    )
    if (!response.ok) {
      accessToken = null
      return null
    }
    const session = (await response.json()) as Session
    accessToken = session.accessToken
    return session
  } catch {
    accessToken = null
    return null
  }
}

/**
 * Exchanges the refresh cookie for a new session, or null when there is none.
 * Concurrent callers share one request; Web Lock keeps other tabs from spending the same cookie.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (
    navigator.locks
      ? withTimeout(
          navigator.locks.request(REFRESH_LOCK, requestNewSession),
          REFRESH_TIMEOUT_MS + 1_000,
          'Session refresh lock',
        )
      : requestNewSession()
  )
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

/**
 * Identity login/logout must not auto-refresh: a 401 here is usually invalid credentials,
 * and racing refresh during sign-in can rotate/overwrite the refresh cookie.
 */
export async function apiAuthRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init, null)
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Sends a JSON request. On 401 refreshes once and retries before giving up. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init, accessToken)

  // After reload, accessToken is null until restore finishes — still try cookie refresh once.
  if (response.status === 401) {
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
