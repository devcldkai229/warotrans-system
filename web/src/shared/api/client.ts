import type { ProblemError } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly errors: ProblemError[]

  constructor(status: number, detail: string, code?: string, errors: ProblemError[] = []) {
    super(detail)
    this.status = status
    this.code = code
    this.errors = errors
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      detail?: string
      title?: string
      code?: string
      errors?: ProblemError[]
    }
    return new ApiError(
      response.status,
      body.detail || body.title || response.statusText,
      body.code,
      body.errors ?? [],
    )
  } catch {
    return new ApiError(response.status, response.statusText)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
