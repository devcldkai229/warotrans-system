/**
 * WaroTrans Mobile API Client.
 *
 * Connects directly to the WaroTrans .NET 10 Web Host (default: http://localhost:5090).
 * Handles authentication headers, JSON body serialization, ProblemDetails parsing,
 * and standard network error handling.
 */

const DEFAULT_API_URL = 'http://localhost:5090';

export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return DEFAULT_API_URL;
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

export function setAccessToken(token: string | null) {
  inMemoryToken = token;
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
    throw await parseApiError(response);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as unknown as T;
  }

  return (await response.json()) as T;
}
