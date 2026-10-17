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

let inMemoryToken: string | null = null;
type TokenChangeListener = (token: string | null) => void;
const tokenListeners = new Set<TokenChangeListener>();

export function onAccessTokenChange(listener: TokenChangeListener): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

export function setAccessToken(token: string | null) {
  const changed = inMemoryToken !== token;
  inMemoryToken = token;
  if (changed) {
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
  let code: string | null = null;
  let message = `Request failed with status ${response.status}`;
  let errors: ProblemError[] = [];

  try {
    const data = await response.json();
    if (data && typeof data === 'object') {
      code = data.code ?? null;
      message = data.detail || data.title || data.message || message;
      if (Array.isArray(data.errors)) {
        errors = data.errors;
      }
    }
  } catch {
    // Empty or non-JSON body (e.g. 401 Unauthorized gateway error)
  }

  return new ApiError(response.status, code, message, errors);
}

let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  try {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
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

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data && data.accessToken) {
      setAccessToken(data.accessToken);
      await saveStoredAccessToken(data.accessToken);
      if (data.refreshToken) {
        await saveStoredRefreshToken(data.refreshToken);
      }
      return data.accessToken;
    }
    return null;
  } catch (err) {
    console.warn('Silent token refresh failed:', err);
    return null;
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
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (err: any) {
    throw new ApiError(0, 'NETWORK_ERROR', err?.message || 'Network connection failed');
  }

  if (!response.ok) {
    const isAuthEndpoint =
      path.includes('/api/identity/login') ||
      path.includes('/api/identity/refresh') ||
      path.includes('/api/identity/logout');

    if (response.status === 401 && !isAuthEndpoint && overrideToken === undefined) {
      if (!refreshPromise) {
        refreshPromise = performTokenRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const freshToken = await refreshPromise;
      if (freshToken) {
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
        } catch (err: any) {
          throw new ApiError(0, 'NETWORK_ERROR', err?.message || 'Network connection failed on retry');
        }

        if (retryResponse.ok) {
          if (retryResponse.status === 204) {
            return null as unknown as T;
          }
          return (await retryResponse.json()) as T;
        }

        throw await parseApiError(retryResponse);
      }
    }

    throw await parseApiError(response);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as unknown as T;
  }

  return (await response.json()) as T;
}
