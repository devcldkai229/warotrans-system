import { apiRequest } from './client'
import type { ActionAvailability, DispatchCandidate, DispatchDecision, JobContainerStatus, JobStatus, JobStepStatus } from './contracts'

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
  /** Null when the robot is outside the caller's scope. */
  robotCode?: string | null
  workflowName?: string | null
  requestCodes?: string[] | null
  containerBarcodes?: string[] | null
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
  /** WH-03: who holds this human step now. Null when nobody does or the claim ran out. */
  claimedBy?: string | null
  claimedByName?: string | null
  claimExpiresAt?: string | null
  /** SY-02 */
  deadlineAt?: string | null
  escalatedAt?: string | null
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
  failureMessage?: string | null
}

/** GET /api/workflow-execution/jobs/{id}. */
export interface JobDetailDto extends Omit<JobSummaryDto, 'containerCount'> {
  currentStepId: string | null
  failureMessage: string | null
  /** FL-07 */
  priority?: number
  deadlineAt?: string | null
  queuedAt?: string | null
  blockingReason?: string | null
  containers: JobContainerDto[]
  tasks: JobTaskDto[]
  /** BOTH-04: START / PAUSE / RESUME / CANCEL as the server decides them for this user. */
  availableActions: ActionAvailability<'START' | 'PAUSE' | 'RESUME' | 'CANCEL'>[]
}

/** `robotId` lists the Jobs that robot was assigned to, most recent first. */
export function listJobs(params: { status?: JobStatus; transportRequestId?: string; robotId?: string; skip?: number; take?: number } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.transportRequestId) query.set('transportRequestId', params.transportRequestId)
  if (params.robotId) query.set('robotId', params.robotId)
  if (params.skip) query.set('skip', String(params.skip))
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

/**
 * Continues a PAUSED / REASSIGNING Job from the step that stopped it. Without a robot id: the Job's robot.
 * 409 when the robot is offline, not localized, busy, or (another robot) the Job has containers on board.
 */
export function resumeJob(id: string, robotId?: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/jobs/${id}/resume`, {
    method: 'POST',
    body: JSON.stringify({ robotId: robotId ?? null }),
  })
}

/** WH-10: the container of this waiting handover cannot go on; the Job continues with the others. */
export function failJobContainer(stepId: string, containerId: string, reason: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/fail-container`, {
    method: 'POST',
    body: JSON.stringify({ containerId, reason }),
  })
}

/** Staff confirms a WAITING PICKUP_CONFIRM / DROPOFF_CONFIRM step with the scanned container. */
export function confirmJobStep(stepId: string, containerId: string | null, note?: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ containerId, note: note ?? null }),
  })
}

/** WH-03: take a waiting human step, or extend your own claim. 409 human_task_claimed when someone else holds it. */
export function claimJobStep(stepId: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/claim`, { method: 'POST' })
}

export function releaseJobStep(stepId: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/release`, { method: 'POST' })
}

/** WH-03: job.takeover, reason required. */
export function takeOverJobStep(stepId: string, reason: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/takeover`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export type HandoverBatchOutcome = 'confirmed' | 'already_confirmed' | 'mismatch' | 'not_reached' | 'refused'

export interface HandoverBatchResult {
  containerId: string
  jobStepId: string | null
  outcome: HandoverBatchOutcome
  code: string | null
}

/** APP-OPS-02: partial by design, every container has its own result. */
export function confirmHandoverBatch(jobId: string, type: 'PICKUP' | 'DROPOFF', containerIds: string[], note?: string) {
  return apiRequest<{ results: HandoverBatchResult[]; job: JobDetailDto }>(
    `/api/workflow-execution/jobs/${jobId}/handover/confirm-batch`,
    { method: 'POST', body: JSON.stringify({ type, containerIds, note: note ?? null }) },
  )
}

export interface JobRecovery {
  id: string
  jobId: string
  status: 'OPEN' | 'TARGET_ASSIGNED' | 'TRANSFERRED' | 'RESUMED_SAME_ROBOT' | 'CANCELLED'
  reason: string
  fromRobotId: string | null
  toRobotId: string | null
  recoveryEndpointId: string | null
  containerIds: string[]
  robotArrived: boolean
  confirmedBy: string | null
  confirmedAt: string | null
  note: string | null
  createdAt: string
  resolvedAt: string | null
}

const recoveryRoot = (jobId: string) => `/api/workflow-execution/jobs/${jobId}/recovery`

export function getJobRecovery(jobId: string) {
  return apiRequest<{ recovery: JobRecovery | null }>(recoveryRoot(jobId))
}

export function assignRecoveryRobot(jobId: string, robotId: string, endpointId: string) {
  return apiRequest<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/assign`, { method: 'POST', body: JSON.stringify({ robotId, endpointId }) })
}

export function unassignRecoveryRobot(jobId: string) {
  return apiRequest<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/unassign`, { method: 'POST' })
}

export function confirmRecoveryTransfer(jobId: string, containerIds: string[], note: string) {
  return apiRequest<JobDetailDto>(`${recoveryRoot(jobId)}/transfer-confirm`, { method: 'POST', body: JSON.stringify({ containerIds, note }) })
}

export function resumeRecoveryOnSameRobot(jobId: string, note?: string) {
  return apiRequest<JobDetailDto>(`${recoveryRoot(jobId)}/resume-same-robot`, { method: 'POST', body: JSON.stringify({ note: note ?? null }) })
}

/** FL-07: start this Job as soon as a robot is free. */
export function enqueueJob(jobId: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/jobs/${jobId}/enqueue`, { method: 'POST' })
}

/** WFX-03: operator pause. The robot gets STOP mode PAUSE; follow it with getStopState(robotId). */
export function pauseJob(id: string, reason?: string) {
  return apiRequest<unknown>(`/api/workflow-execution/jobs/${id}/pause`, { method: 'POST', body: JSON.stringify({ reason }) })
}

/** Operator cancel (existing backend endpoint, job.cancel). */
export function cancelJob(id: string, reason?: string) {
  return apiRequest<unknown>(`/api/workflow-execution/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
}

/** FL-01: every robot on the Job's map, eligible or not and why, best first. */
export function getDispatchCandidates(jobId: string) {
  return apiRequest<DispatchCandidate[]>(`/api/workflow-execution/jobs/${jobId}/dispatch-candidates`)
}

/** FLT-01: the Job's dispatch decisions, newest first. */
export function getDispatchDecisions(jobId: string) {
  return apiRequest<DispatchDecision[]>(`/api/workflow-execution/jobs/${jobId}/dispatch-decisions`)
}

/** FL-02: start the Job on a robot (or the best one). overrideReason needs dispatch.override. */
export function dispatchJob(jobId: string, body: { robotId?: string; overrideReason?: string }) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/jobs/${jobId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
