/**
 * Fault Injection Lab (/api/lab). Test benches only: the Host maps these routes only with Lab:Enabled, and the web
 * shows the page only when built with VITE_LAB_ENABLED=true.
 */
import { apiFetch } from './client'

export interface LabScenario {
  id: string
  title: string
  description: string
  /** ROBOT (the gateway does it), HOST (the backend does it) or OPERATOR (a person does it; the Lab records when). */
  executor: 'ROBOT' | 'HOST' | 'OPERATOR'
  defaultTtlSeconds: number
  /** Detectors the AI should raise: for grading only, never given to the AI. */
  expected: string[]
  defaultParameters: Record<string, string>
  robotCount: number
}

export interface LabInjection {
  id: string
  scenarioId: string
  title: string
  executor: string
  robotCode: string | null
  transportRequestId: string | null
  parameters: Record<string, string>
  injectedAt: string
  expiresAt: string
  /** ACTIVE, STOPPED, EXPIRED or FAILED */
  status: string
  clearedAt: string | null
  detail: string | null
  injectedBy: string | null
}

export interface LabInjectRequest {
  scenarioId: string
  robotCode?: string | null
  transportRequestId?: string | null
  ttlSeconds?: number | null
  parameters?: Record<string, string>
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

export const labApi = {
  scenarios: () => apiFetch<LabScenario[]>('/api/lab/scenarios'),
  injections: () => apiFetch<LabInjection[]>('/api/lab/injections'),
  inject: (body: LabInjectRequest) => apiFetch<LabInjection>('/api/lab/injections', post(body)),
  stop: (id: string) => apiFetch<LabInjection>(`/api/lab/injections/${id}/stop`, post({})),
}

export const LAB_ENABLED = import.meta.env.VITE_LAB_ENABLED === 'true'
