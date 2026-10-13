import { apiRequest } from '@/shared/api/client'
import type { Session } from '@/shared/api/contracts'

export function login(username: string, password: string): Promise<Session> {
  return apiRequest<Session>('/api/identity/login', {
    method: 'POST',
    // useCookie: the refresh token comes back as an HttpOnly cookie instead of in the response body.
    body: JSON.stringify({ username, password, useCookie: true }),
  })
}

/** Revokes the refresh token on the server and clears the cookie. */
export function logout(): Promise<void> {
  return apiRequest<void>('/api/identity/logout', { method: 'POST' })
}
