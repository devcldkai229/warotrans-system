import { apiFetch } from './client'
import type {
  WorkflowDetail,
  WorkflowListItem,
  WorkflowMetadata,
  WorkflowUpsert,
} from './types'

export function fetchWorkflowMetadata() {
  return apiFetch<WorkflowMetadata>('/api/workflow-execution/metadata/step-types')
}

export function listWorkflows(params?: { code?: string; status?: string }) {
  const query = new URLSearchParams()
  if (params?.code) query.set('code', params.code)
  if (params?.status) query.set('status', params.status)
  const qs = query.toString()
  return apiFetch<{ total: number; items: WorkflowListItem[] }>(
    `/api/workflow-execution/workflows${qs ? `?${qs}` : ''}`,
  )
}

export function getWorkflow(id: string) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}`)
}

export function createWorkflow(body: WorkflowUpsert) {
  return apiFetch<WorkflowDetail>('/api/workflow-execution/workflows', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateWorkflow(id: string, body: WorkflowUpsert) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function publishWorkflow(id: string) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}/publish`, {
    method: 'POST',
  })
}

export function createWorkflowVersion(id: string) {
  return apiFetch<WorkflowDetail>(`/api/workflow-execution/workflows/${id}/versions`, {
    method: 'POST',
  })
}
