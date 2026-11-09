import { apiFetch } from './client';

export interface LoginRequest {
  username: string;
  password: string;
  useCookie?: boolean;
}

export interface AccountDto {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'STAFF' | 'ADMIN' | 'TECHNICIAN' | string;
  status: string;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
}

/** `GET /api/identity/me/capabilities`: what the server enforces for this token (BOTH-07). */
export interface CapabilitiesDto {
  accountId: string;
  role: string;
  mustChangePassword: boolean;
  permissions: string[];
  robotScope: { allRobots: boolean; robotIds: string[] };
}

export interface SessionResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string | null;
  account: AccountDto;
}

/**
 * Sign in using username and password credentials against the WaroTrans backend.
 * Requests a direct refresh token in the response payload (`useCookie: false`) for mobile secure storage.
 */
export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/identity/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      useCookie: false,
    }),
  });
}

/**
 * Exchanges a valid refresh token for a newly issued access token.
 */
export async function refreshAuthSession(
  refreshToken: string,
): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/identity/refresh', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken,
      useCookie: false,
    }),
  });
}

/**
 * Retrieves the currently authenticated account profile (`GET /api/identity/me`).
 */
export async function getCurrentAccount(): Promise<AccountDto> {
  return apiFetch<AccountDto>('/api/identity/me', {
    method: 'GET',
  });
}

/**
 * Invalidates the current refresh session and logs out (`POST /api/identity/logout`).
 */
export async function logoutSession(refreshToken?: string | null): Promise<void> {
  return apiFetch<void>('/api/identity/logout', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: refreshToken || null,
    }),
  });
}

/** `GET /api/identity/me/capabilities`. Works with a temporary password too (then `permissions` is empty). */
export async function getCapabilities(): Promise<CapabilitiesDto> {
  return apiFetch<CapabilitiesDto>('/api/identity/me/capabilities', { method: 'GET' });
}

/**
 * `POST /api/identity/me/change-password`. Ends every other session and returns a new token pair for this device.
 * Rejects with `current_password_incorrect`, `password_contains_username` or `validation_failed`.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/identity/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, useCookie: false }),
  });
}
