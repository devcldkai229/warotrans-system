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
  /** Which trip (robot load) of its request this Job is, 1-based. */
  tripNo?: number | null
  /** How many trips the request has. */
  tripCount?: number | null
  /** Why a queued trip waits (no free robot, ...). */
  blockingReason?: string | null
  /** Where the robot collects, then delivers, in order. */
  stops?: JobTripStopDto[] | null
  containers?: JobTripContainerDto[] | null
}

export interface JobTripStopDto {
  sequenceNo: number
  action: 'PICKUP' | 'DROPOFF' | string
  endpointId: string
  endpointCode?: string | null
  containerCount: number
}

export interface JobTripContainerDto {
  containerId: string
  sequenceNo: number
  status: JobContainerStatus | string
  barcode?: string | null
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
  /** Who confirmed it (outputValues.confirmedBy), by name. */
  confirmedByName?: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface JobTaskDto {
  id: string
  sequenceNo: number
  /** Segments of one Workflow Task share its key: it expands into several per Job (checks, stop, per Container). */
  taskKey: string
  /** What the workflow calls that task, e.g. "Pick up at source rack". */
  taskName: string
  status: string
  /** RECOVERY: the second robot of a payload recovery driving to the safe endpoint (WFX-04). */
  executionScope: 'ONCE_PER_JOB' | 'ONCE_PER_STOP' | 'PER_CONTAINER_AT_STOP' | 'RECOVERY' | null
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
  /** A FAILED container: its problem code (container_reported_failed before problem codes). */
  failureCode?: string | null
  failureMessage?: string | null
  failedAt?: string | null
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

export interface ListJobsParams {
  status?: JobStatus
  transportRequestId?: string
  /** The Jobs that robot was assigned to, most recent first. */
  robotId?: string
  /** Part of a Job number, or a whole Job id. */
  search?: string
  skip?: number
  take?: number
}

export function listJobs(params: ListJobsParams = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.transportRequestId) query.set('transportRequestId', params.transportRequestId)
  if (params.robotId) query.set('robotId', params.robotId)
  if (params.search) query.set('search', params.search)
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

/**
 * WH-10: the container of this waiting handover (or on board at the inspection) cannot go on; the Job continues with
 * the others. It is held where it is under a CONTAINER issue with `problemCode` (none is OTHER).
 */
export function failJobContainer(stepId: string, containerId: string, reason: string, problemCode?: string) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/fail-container`, {
    method: 'POST',
    body: JSON.stringify({ containerId, reason, problemCode: problemCode ?? null }),
  })
}

/**
 * The result of a waiting INSPECTION_CONFIRM step. FAILED needs a note and the problems found: that container leaves
 * the Job at the inspection point (held there); the inspection waits for the containers still on board.
 */
export function confirmInspection(
  stepId: string,
  result: 'PASSED' | 'FAILED',
  options: { containerId?: string | null; note?: string; defects?: string[] } = {},
) {
  return apiRequest<JobDetailDto>(`/api/workflow-execution/job-steps/${stepId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({
      containerId: options.containerId ?? null,
      note: options.note ?? null,
      inspectionResult: result,
      defects: options.defects ?? null,
    }),
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

export type RecoveryPhase =
  | 'ASSESSMENT_REQUIRED'
  | 'ASSESSED'
  | 'SOURCE_REPOSITIONING'
  | 'SOURCE_SECURED'
  | 'TARGET_EN_ROUTE'
  | 'AWAITING_TRANSFER'
  | 'INTERVENTION_REQUIRED'

export type RecoveryAssessmentResult = 'SELF_EVACUATION_APPROVED' | 'MANUAL_RECOVERY_REQUIRED' | 'SAME_ROBOT_RECOVERABLE'

export type RecoveryAction =
  | 'CLAIM' | 'RELEASE' | 'ASSIGN' | 'UNASSIGN' | 'CONFIRM' | 'ARM_BUTTON' | 'RESUME_SAME_ROBOT' | 'UNLOAD' | 'RESOLVE_MANUALLY'
  | 'ASSESS' | 'VERIFY_LOCATION' | 'SOURCE_EVACUATE' | 'SOURCE_SECURE'

export interface RecoveryChecklistItem {
  item: string
  ok: boolean
  note?: string | null
}

export interface RecoveryContainer {
  containerId: string
  barcode: string | null
  /** Who holds it now: ROBOT (the failed one, or the second after the transfer), STAFF or RECOVERY_STATION. */
  holderType: 'ROBOT' | 'STAFF' | 'RECOVERY_STATION' | string
  holderId: string | null
}

/** GET /jobs/{id}/recovery: the latest payload recovery case of a Job (WAROTRANS_PAYLOAD_RECOVERY_DESIGN.md). */
export interface JobRecovery {
  id: string
  jobId: string
  status: 'OPEN' | 'TARGET_ASSIGNED' | 'TRANSFERRED' | 'RESUMED_SAME_ROBOT' | 'CANCELLED' | 'RESOLVED_MANUALLY'
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
  claimedBy: string | null
  version: number
  containers: RecoveryContainer[]
  availableActions: { action: RecoveryAction | string; allowed: boolean; reason?: string | null }[]
  buttonArmed: boolean
  confirmedByRobotId: string | null
  /** Null on cases opened before phases existed. */
  phase: RecoveryPhase | null
  recoveryMode: 'SELF_EVACUATION' | 'MANUAL' | 'SAME_ROBOT' | null
  fault: {
    x: number | null
    y: number | null
    yaw: number | null
    seenAt: string | null
    mapVersionId: string | null
    errorCode: string | null
    online: boolean | null
  } | null
  assessment: {
    result: RecoveryAssessmentResult
    assessedBy: string | null
    assessedAt: string | null
    checklist: RecoveryChecklistItem[]
    note: string | null
  } | null
  verifiedLocation: { x: number | null; y: number | null; verifiedBy: string | null; verifiedAt: string | null } | null
  sourceEndpointId: string | null
  sourceArrived: boolean
  sourceSecuredAt: string | null
  sourceSecuredBy: string | null
}

export interface RecoveryRobotCandidate {
  robotId: string
  robotCode: string
  maxContainers: number
  eligible: boolean
  reasons: string[]
}

export interface RecoveryEndpointCandidate {
  endpointId: string
  code: string
  name: string
  endpointType: string
  distanceMeters: number
  pathMeters: number | null
  /** Why it cannot be chosen now (taken, failed_robot_there, robot_standing_there, no_path); null when it can. */
  unsuitable: string | null
}

export interface RecoveryScan {
  containerId: string
  barcode: string
}

const recoveryRoot = (jobId: string) => `/api/workflow-execution/jobs/${jobId}/recovery`
type CaseRef = { caseId: string; version: number }
const post = <T,>(url: string, body: unknown) => apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) })

export function getJobRecovery(jobId: string) {
  return apiRequest<{ recovery: JobRecovery | null }>(recoveryRoot(jobId))
}

export function listRecoveryRobotCandidates(jobId: string) {
  return apiRequest<{ items: RecoveryRobotCandidate[] }>(`${recoveryRoot(jobId)}/candidates`)
}

export function listRecoveryEndpointCandidates(jobId: string, forSource: boolean) {
  return apiRequest<{ items: RecoveryEndpointCandidate[] }>(`${recoveryRoot(jobId)}/endpoint-candidates?for=${forSource ? 'SOURCE' : 'TARGET'}`)
}

/** A PAUSED Job with cargo on board needs a payload recovery (idempotent). */
export function requestRecovery(jobId: string, reason?: string) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/request`, { reason: reason ?? null })
}

export const claimRecovery = (jobId: string, ref: CaseRef) => post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/claim`, ref)
export const releaseRecovery = (jobId: string, ref: CaseRef) => post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/release`, ref)

export function assessRecovery(jobId: string, ref: CaseRef, result: RecoveryAssessmentResult, checklist: RecoveryChecklistItem[], note?: string) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/assessment`, { ...ref, result, checklist, note: note ?? null })
}

export function verifyRecoveryLocation(jobId: string, ref: CaseRef, where: { endpointId?: string; x?: number; y?: number }) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/verify-location`, { ...ref, ...where })
}

export function evacuateRecoverySource(jobId: string, ref: CaseRef, endpointId?: string) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/source-evacuate`, { ...ref, endpointId: endpointId ?? null })
}

export function secureRecoverySource(jobId: string, ref: CaseRef, note?: string) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/source-secure`, { ...ref, note: note ?? null })
}

export function assignRecoveryRobot(jobId: string, ref: CaseRef, robotId: string, endpointId: string) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/assign`, { ...ref, robotId, endpointId })
}

export function unassignRecoveryRobot(jobId: string, ref: CaseRef) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/unassign`, ref)
}

export function unloadRecoveryCargo(
  jobId: string, ref: CaseRef, scans: RecoveryScan[], holder: 'STAFF' | 'RECOVERY_STATION', endpointId?: string, note?: string,
) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/unload-confirm`, { ...ref, scans, holder, endpointId: endpointId ?? null, note: note ?? null })
}

/** Cargo taken off the failed robot by hand: back to storage or quarantined (held under a CONTAINER issue). */
export function resolveRecoveryManually(
  jobId: string, ref: CaseRef, disposition: 'RETURN_TO_STORAGE' | 'QUARANTINE_CARGO', scans: RecoveryScan[], problemCode?: string, note?: string,
) {
  return post<{ recovery: JobRecovery }>(`${recoveryRoot(jobId)}/resolve-manually`, {
    ...ref, disposition, scans, problemCode: problemCode ?? null, note: note ?? null,
  })
}

export function confirmRecoveryTransfer(jobId: string, ref: CaseRef, robotId: string, scans: RecoveryScan[], note?: string) {
  return post<JobDetailDto>(`${recoveryRoot(jobId)}/transfer-confirm`, { ...ref, robotId, scans, note: note ?? null })
}

export function resumeRecoveryOnSameRobot(jobId: string, ref: CaseRef, note?: string) {
  return post<JobDetailDto>(`${recoveryRoot(jobId)}/resume-same-robot`, { ...ref, note: note ?? null })
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
