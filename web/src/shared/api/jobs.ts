import { apiRequest } from './client'
import type { JobContainerStatus, JobStatus, JobStepStatus } from './contracts'

/** GET /api/workflow-execution/jobs item. */
export interface JobSummaryDto {
  id: string
  jobNo: string
  status: JobStatus
  workflowId: string
  mapVersionId: string
  assignedRobotId: string | null
  transportRequestIds: string[]
  containerCount: number
  completedSteps: number
  totalSteps: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  failureCode: string | null
}

export interface JobStepDto {
  id: string
  sequenceNo: number
  stepKey: string
  name: string
  stepType: 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT'
  operationCode: string
  status: JobStepStatus
  targetEndpointId: string | null
  resolvedInputs: Record<string, unknown>
  outputValues: Record<string, unknown>
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface JobTaskDto {
  id: string
  sequenceNo: number
  taskKey: string
  status: string
  executionScope: 'ONCE_PER_JOB' | 'ONCE_PER_STOP' | 'PER_CONTAINER_AT_STOP' | null
  stopAction: 'PICKUP' | 'DROPOFF' | null
  stopEndpointId: string | null
  containerId: string | null
  steps: JobStepDto[]
}

export interface JobContainerDto {
  id: string
  transportRequestId: string
  containerId: string
  sequenceNo: number
  status: JobContainerStatus
  loadedAt: string | null
  deliveredAt: string | null
}

/** GET /api/workflow-execution/jobs/{id}. */
export interface JobDetailDto extends Omit<JobSummaryDto, 'containerCount'> {
  currentStepId: string | null
  failureMessage: string | null
  containers: JobContainerDto[]
  tasks: JobTaskDto[]
}

export function listJobs(params: { status?: JobStatus; transportRequestId?: string; take?: number } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.transportRequestId) query.set('transportRequestId', params.transportRequestId)
  if (params.take) query.set('take', String(params.take))
  const qs = query.toString()
  return apiRequest<{ items: JobSummaryDto[]; total: number }>(`/api/workflow-execution/jobs${qs ? `?${qs}` : ''}`)
}

export function getJob(id: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/jobs/${id}`)
}

/** Assigns a robot (or the best free one on the Job's map) and starts executing. */
export function startJob(id: string, robotId?: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/jobs/${id}/start`, {
    method: 'POST',
    body: JSON.stringify({ robotId: robotId ?? null }),
  })
}

/** Staff confirms a WAITING PICKUP_CONFIRM / DROPOFF_CONFIRM step with the scanned container. */
export function confirmJobStep(stepId: string, containerId: string | null, note?: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ containerId, note: note ?? null }),
  })
}
