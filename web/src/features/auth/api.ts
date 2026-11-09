import { apiAuthRequest, apiRequest } from '@/shared/api/client'
import type { Capabilities, Session } from '@/shared/api/contracts'

export function login(username: string, password: string): Promise<Session> {
  return apiAuthRequest<Session>('/api/identity/login', {
    method: 'POST',
    // useCookie: the refresh token comes back as an HttpOnly cookie instead of in the response body.
    body: JSON.stringify({ username, password, useCookie: true }),
  })
}

/** Revokes the refresh token on the server and clears the cookie. */
export function logout(): Promise<void> {
  return apiAuthRequest<void>('/api/identity/logout', { method: 'POST' })
}

/** GET /api/identity/me/capabilities with the in-memory access token. */
export function getCapabilities(): Promise<Capabilities> {
  return apiRequest<Capabilities>('/api/identity/me/capabilities')
}

/**
 * POST /api/identity/me/change-password. Ends every other session and returns a fresh one for this browser.
 * Rejects with `current_password_incorrect`, `password_contains_username` or `validation_failed`.
 */
export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<Session> {
  return apiRequest<Session>('/api/identity/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, useCookie: true }),
  })
}
