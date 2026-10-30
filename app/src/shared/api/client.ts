/**
 * WaroTrans Mobile API Client.
 *
 * Connects directly to the WaroTrans .NET 10 Web Host (default: http://localhost:5090).
 * Handles authentication headers, JSON body serialization, ProblemDetails parsing,
 * automatic token refresh on HTTP 401, and standard network error handling.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  getStoredRefreshToken,
  saveStoredAccessToken,
  saveStoredRefreshToken,
  clearAllStoredAuth,
} from './secureStore';

const DEFAULT_API_URL = 'http://localhost:5090';

/**
 * Hosts that mean "this machine". On a handset `localhost` is the handset itself,
 * so these are the only values worth rewriting when the app runs on a real device.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function resolveConfiguredApiUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return DEFAULT_API_URL;
}

/**
 * The dev machine's LAN address, as reported by the Metro server the app is
 * already connected to. Null when Metro is unreachable or is itself on loopback.
 */
function resolveMetroHost(): string | null {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? null;
    if (!hostUri) return null;
    const host = hostUri
      .split('//')
      .pop()!
      .split('/')[0]
      .split(':')[0]
      .trim();
    return host && !LOOPBACK_HOSTS.has(host.toLowerCase()) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Base URL of the WaroTrans API.
 *
 * Web runs on the dev machine, so the configured URL is used verbatim. On a real
 * device `localhost` resolves to the phone, so a loopback host is swapped for
 * Metro's host while the scheme, port and path are kept. An explicitly
 * non-loopback URL is a real deployment target and is never rewritten.
 */
export function getApiBaseUrl(): string {
  const configured = resolveConfiguredApiUrl().replace(/\/+$/, '');
  if (Platform.OS === 'web') return configured;

  const match = /^(https?):\/\/([^/:]+)(?::(\d+))?(.*)$/.exec(configured);
  if (!match || !LOOPBACK_HOSTS.has(match[2].toLowerCase())) return configured;

  const metroHost = resolveMetroHost();
  if (!metroHost) return configured;

  const [, scheme, , port, path] = match;
  return `${scheme}://${metroHost}${port ? `:${port}` : ''}${path ?? ''}`;
}

export interface ProblemError {
  property: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errors: ProblemError[];

  constructor(
    status: number,
    code: string | null,
    message: string,
    errors: ProblemError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export function getUserErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function networkError(init: RequestInit = {}, path = ''): ApiError {
  const isWrite = !path.startsWith('/api/identity/') && init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase());
  return new ApiError(0, 'NETWORK_ERROR', isWrite
    ? 'Could not confirm the result. Reconnect and check the latest status before trying again.'
    : 'Cannot reach the server. Check your connection and try again.');
}

function httpErrorMessage(status: number): string {
  if (status >= 500) return 'The server is temporarily unavailable. Please try again shortly.';
  switch (status) {
    case 400: return 'Check the information entered and try again.';
    case 401: return 'Your session could not be verified. Please sign in again.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return 'This record is no longer available. Refresh to see the latest information.';
    case 409: return 'This action conflicts with the current status. Refresh before trying again.';
    case 429: return 'Too many requests. Wait a moment and try again.';
    default: return 'The request could not be completed. Please try again.';
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  try {
    return await response.json() as T;
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(502, 'INVALID_RESPONSE', 'The server response could not be read. Refresh to check the latest status.');
  }
}

let inMemoryToken: string | null = null;
type TokenChangeListener = (token: string | null) => void;
const tokenListeners = new Set<TokenChangeListener>();
let tokenVersion = 0;
const expiredListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

function expireSession(expectedVersion: number) {
  if (tokenVersion !== expectedVersion) return;
  setAccessToken(null);
  void clearAllStoredAuth();
  expiredListeners.forEach(listener => listener());
}

export function onAccessTokenChange(listener: TokenChangeListener): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

export function setAccessToken(token: string | null) {
  const changed = inMemoryToken !== token;
  inMemoryToken = token;
  if (changed) {
    tokenVersion += 1;
    tokenListeners.forEach((fn) => {
      try {
        fn(token);
      } catch (err) {
        console.warn('Error in token change listener:', err);
      }
    });
  }
}

export function getAccessToken(): string | null {
  return inMemoryToken;
}

export const getBearerToken = getAccessToken;

async function parseApiError(response: Response): Promise<ApiError> {
  // Unexpected server failures may include stack traces or implementation details.
  if (response.status >= 500) return new ApiError(response.status, 'SERVER_ERROR', httpErrorMessage(response.status));
  let code: string | null = null;
  let message = httpErrorMessage(response.status);
  let errors: ProblemError[] = [];

  try {
    const data = await response.json();
    if (data && typeof data === 'object') {
      code = typeof data.code === 'string' ? data.code : null;
      const genericTitles = ['bad request', 'unauthorized', 'forbidden', 'not found', 'conflict', 'too many requests'];
      const title = typeof data.title === 'string' && !genericTitles.includes(data.title.toLowerCase()) ? data.title : undefined;
      const detail = [data.detail, data.message, title].find(value => typeof value === 'string' && value.trim());
      if (detail) message = detail;
      if (Array.isArray(data.errors)) {
        errors = data.errors.flatMap((error: unknown): ProblemError[] => {
          if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') return [];
          return [{ property: 'property' in error && typeof error.property === 'string' ? error.property : '',
            code: 'code' in error && typeof error.code === 'string' ? error.code : 'validation', message: error.message }];
        });
      } else if (data.errors && typeof data.errors === 'object') {
        errors = Object.entries(data.errors).flatMap(([property, messages]) =>
          (Array.isArray(messages) ? messages : [messages]).map(message => ({ property, code: 'validation', message: String(message) })));
      }
      if (errors.length) message = errors.map(error => error.message).join('\n');
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Empty or non-JSON body (e.g. 401 Unauthorized gateway error)
  }

  return new ApiError(response.status, code, message, errors);
}

let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  const version = tokenVersion;
  try {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      expireSession(version);
      return null;
    }

    const baseUrl = getApiBaseUrl();
    const refreshUrl = `${baseUrl}/api/identity/refresh`;

    const res = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
        useCookie: false,
      }),
    });

    if (version !== tokenVersion) return null;
    if (!res.ok) {
      if ([400, 401, 403].includes(res.status)) {
        expireSession(version);
        return null;
      }
      // A refresh outage is not evidence that the saved session was revoked.
      throw await parseApiError(res);
    }

    const data = await readResponse<{ accessToken?: string; refreshToken?: string | null }>(res);
    // A logout or another login must not be undone by an old refresh response.
    if (version !== tokenVersion) return null;
    if (data && typeof data.accessToken === 'string' && data.accessToken) {
      await saveStoredAccessToken(data.accessToken);
      if (typeof data.refreshToken === 'string' && data.refreshToken) {
        await saveStoredRefreshToken(data.refreshToken);
      }
      if (version !== tokenVersion) return null;
      setAccessToken(data.accessToken);
      return data.accessToken;
    }
    throw new ApiError(502, 'INVALID_RESPONSE', 'The server response could not be read. Please try again.');
  } catch (err) {
    if (version !== tokenVersion) return null;
    if (isAbortError(err) || err instanceof ApiError) throw err;
    throw networkError();
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  overrideToken?: string | null,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const token = overrideToken !== undefined ? overrideToken : inMemoryToken;
  const requestVersion = tokenVersion;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (err) {
    if (init.signal?.aborted || isAbortError(err)) throw err;
    throw networkError(init, path);
  }

  if (!response.ok) {
    const isAuthEndpoint =
      path.includes('/api/identity/login') ||
      path.includes('/api/identity/refresh') ||
      path.includes('/api/identity/logout');

    if (response.status === 401 && !isAuthEndpoint && overrideToken === undefined) {
      if (tokenVersion !== requestVersion && !inMemoryToken) throw await parseApiError(response);
      if (!refreshPromise && tokenVersion === requestVersion) {
        refreshPromise = performTokenRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const freshToken = tokenVersion !== requestVersion ? inMemoryToken : await refreshPromise;
      if (freshToken) {
        const retryVersion = tokenVersion;
        // Retry the request once with fresh access token
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set('Accept', 'application/json');
        if (!retryHeaders.has('Content-Type') && init.body && typeof init.body === 'string') {
          retryHeaders.set('Content-Type', 'application/json');
        }
        retryHeaders.set('Authorization', `Bearer ${freshToken}`);

        let retryResponse: Response;
        try {
          retryResponse = await fetch(url, {
            ...init,
            headers: retryHeaders,
          });
        } catch (err) {
          if (init.signal?.aborted || isAbortError(err)) throw err;
          throw networkError(init, path);
        }

        if (retryResponse.ok) {
          return readResponse<T>(retryResponse);
        }

        if (retryResponse.status === 401) expireSession(retryVersion);
        throw await parseApiError(retryResponse);
      }
    }

    throw await parseApiError(response);
  }

  return readResponse<T>(response);
}
