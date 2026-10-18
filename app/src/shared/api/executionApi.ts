import { apiFetch } from './client';
import type { JobSummaryDto, JobDetailResponse, JobStatus } from '../types/contracts';

export function listJobs(filter: { status?: JobStatus; transportRequestId?: string; take?: number } = {}) {
  const query = new URLSearchParams();
  if (filter.status) query.set('status', filter.status);
  if (filter.transportRequestId) query.set('transportRequestId', filter.transportRequestId);
  if (filter.take !== undefined) query.set('take', String(filter.take));
  return apiFetch<{ items: JobSummaryDto[]; total: number }>(`/api/workflow-execution/jobs?${query}`);
}
export function getJobDetail(id: string) {
  return apiFetch<JobDetailResponse>(`/api/workflow-execution/jobs/${id}`);
}
export function startJob(id: string, robotId?: string | null) {
  return apiFetch<JobDetailResponse>(`/api/workflow-execution/jobs/${id}/start`, {
    method: 'POST', body: JSON.stringify({ robotId: robotId ?? null }),
  });
}
export function confirmJobStep(stepId: string, containerId: string, note?: string) {
  return apiFetch<JobDetailResponse>(`/api/workflow-execution/job-steps/${stepId}/confirm`, {
    method: 'POST', body: JSON.stringify({ containerId, note: note ?? null }),
  });
}
export const confirmHandover = confirmJobStep;
