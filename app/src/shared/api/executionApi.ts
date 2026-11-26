import { apiFetch, ApiError, getAccessToken } from './client';
import { getContainer } from './warehouseApi';
import { getMapVersionDetail } from './navigationApi';
import { getWorkflow } from './workflowApi';
import { listRobots } from './fleetApi';
import { requireMobileCapability } from './capabilities';
import type {
  ActionAvailability, HandoverProblemCode, HandoverStopAction, HandoverStopResponse, HandoverStopScan,
  JobContainerResponse, JobDetailResponse, JobRecoveryAction, JobRecoveryResponse, JobStatus, JobStepResponse,
  JobTaskResponse, HandoverConfirmationBody, HandoverConfirmationResponse, RecoveryRobotCandidateResponse, RecoveryEndpointCandidateResponse,
  ReportTaskProblemBody, StaffWorkZoneResponse,
} from '../types/contracts';

export type JobAction = 'START' | 'PAUSE' | 'RESUME' | 'CANCEL';

const callerToken = () => (typeof getAccessToken === 'function' ? getAccessToken() : undefined);

export function getJobAction(
  job: Pick<JobDetailResponse, 'availableActions'> | null | undefined,
  action: JobAction,
): ActionAvailability | undefined {
  return job?.availableActions?.find(item => item.action === action);
}

export function isJobActionAllowed(
  job: Pick<JobDetailResponse, 'availableActions'> | null | undefined,
  action: JobAction,
  fallbackAllowed = false,
): boolean {
  if (!job?.availableActions) return fallbackAllowed;
  return Boolean(getJobAction(job, action)?.allowed);
}

export function getHandoverStopAction(
  stop: Pick<HandoverStopResponse, 'availableActions'> | null | undefined,
  action: HandoverStopAction,
): ActionAvailability | undefined {
  return stop?.availableActions?.find(item => item.action === action);
}

export function isHandoverStopActionAllowed(
  stop: Pick<HandoverStopResponse, 'availableActions'> | null | undefined,
  action: HandoverStopAction,
): boolean {
  return Boolean(getHandoverStopAction(stop, action)?.allowed);
}

export function getRecoveryAction(
  recovery: Pick<JobRecoveryResponse, 'availableActions'> | null | undefined,
  action: JobRecoveryAction,
): ActionAvailability | undefined {
  return recovery?.availableActions?.find(item => item.action === action);
}

export function isRecoveryActionAllowed(
  recovery: Pick<JobRecoveryResponse, 'availableActions'> | null | undefined,
  action: JobRecoveryAction,
): boolean {
  return Boolean(getRecoveryAction(recovery, action)?.allowed);
}

interface RuntimeStep extends JobStepResponse { stepKey?: string; name?: string }
interface RuntimeTask extends JobTaskResponse {
  taskKey?: string; executionScope?: string; stopAction?: string; stopEndpointId?: string;
  containerId?: string; assignedStaffId?: string | null; steps: RuntimeStep[];
}
interface RuntimeJob extends JobDetailResponse {
  assignedRobotId?: string | null; transportRequestIds?: string[]; currentStepId?: string | null;
  completedSteps?: number; totalSteps?: number; containers: JobContainerResponse[]; tasks: RuntimeTask[];
}
export interface HandoverConfirmRequest {
  jobStepId: string; scannedContainerBarcode?: string | null; containerId?: string | null;
  notes?: string | null; note?: string | null;
}
export type ConfirmHandoverBody = HandoverConfirmationBody;
export type ConfirmHandoverResponse = HandoverConfirmationResponse;
const text = (value: unknown) => typeof value === 'string' ? value : '';
const optional = async <T>(operation: Promise<T>): Promise<T | null> => operation.catch(() => null);

async function hydrateJobs(rawJobs: RuntimeJob[]): Promise<JobDetailResponse[]> {
  if (!rawJobs.length) return [];
  const [maps, workflows, fleet, containers] = await Promise.all([
    Promise.all([...new Set(rawJobs.map(job => job.mapVersionId))].map(id => optional(getMapVersionDetail(id)))),
    Promise.all([...new Set(rawJobs.map(job => job.workflowId))].map(id => optional(getWorkflow(id)))),
    optional(listRobots()),
    Promise.all([...new Set(rawJobs.flatMap(job => job.containers.map(container => container.containerId)))].map(id => optional(getContainer(id)))),
  ]);
  return rawJobs.map(raw => {
    const map = maps.find(item => item?.id === raw.mapVersionId);
    const workflow = workflows.find(item => item?.id === raw.workflowId);
    const robot = fleet?.items.find(item => item.id === raw.assignedRobotId);
    const endpointCode = (id: unknown) => map?.endpoints.find(endpoint => endpoint.id === id)?.code || text(id) || 'Unknown Endpoint';
    const tasks: JobTaskResponse[] = raw.tasks.map(task => ({
      ...task, jobId: raw.id,
      contextValues: {
        ...task.contextValues,
        executionScope: task.executionScope || task.contextValues?.executionScope,
        stopAction: task.stopAction || task.contextValues?.stopAction,
        stopEndpointId: task.stopEndpointId || task.contextValues?.stopEndpointId,
        stopEndpointCode: endpointCode(task.stopEndpointId || task.contextValues?.stopEndpointId),
        containerId: task.containerId || task.contextValues?.containerId,
        assignedStaffId: task.assignedStaffId || task.contextValues?.assignedStaffId,
      } as JobTaskResponse['contextValues'],
      steps: task.steps.map(step => ({
        ...step, jobTaskId: task.id, workflowStepKey: step.stepKey || step.workflowStepKey,
        targetEndpointCode: step.targetEndpointId ? endpointCode(step.targetEndpointId) : undefined,
      })),
    }));
    const waitingTask = tasks.find(task => task.steps.some(step => step.status === 'WAITING' && step.stepType === 'HUMAN_INTERACTION'));
    const waitingStep = waitingTask?.steps.find(step => step.status === 'WAITING' && step.stepType === 'HUMAN_INTERACTION');
    const currentTask = tasks.find(task => task.steps.some(step => step.id === raw.currentStepId));
    const currentStep = currentTask?.steps.find(step => step.id === raw.currentStepId);
    const currentEndpointId = currentStep?.targetEndpointId || currentTask?.contextValues?.stopEndpointId;
    const operation = waitingStep?.operationCode;
    const waitingContainerId = text(waitingStep?.resolvedInputs?.containerId || waitingTask?.contextValues?.containerId);
    const pickup = tasks.find(task => task.contextValues?.stopAction === 'PICKUP');
    const dropoff = tasks.find(task => task.contextValues?.stopAction === 'DROPOFF');
    const source = endpointCode(pickup?.contextValues?.stopEndpointId);
    const destination = endpointCode(dropoff?.contextValues?.stopEndpointId);
    const containerMeta = raw.containers.map((allocation, index) => {
      const container = containers.find(item => item?.id === allocation.containerId);
      const isTarget = Boolean(waitingContainerId && waitingContainerId === allocation.containerId);
      return {
        containerId: allocation.containerId, status: allocation.status, code: container?.barcode || allocation.containerId,
        slot: `Bay ${index + 1}`, action: allocation.status === 'DELIVERED' ? 'DELIVERED'
          : isTarget && operation === 'DROPOFF_CONFIRM' ? 'UNLOAD'
          : isTarget && operation === 'PICKUP_CONFIRM' ? 'PICKUP'
          : allocation.status === 'ONBOARD' ? 'KEEP ONBOARD' : 'PICKUP',
        isTarget, location: container?.currentStorageLocationCode || endpointCode(container?.currentEndpointId),
        product: container?.productName || 'Unknown Product', qty: 1,
      };
    });
    return {
      ...raw, tasks,
      contextValues: {
        ...raw.contextValues, warehouseId: map?.warehouseId, workflowCode: workflow?.code || '', workflowName: workflow?.name || 'Workflow',
        assignedRobotId: raw.assignedRobotId, assignedRobotCode: robot?.code || 'Unassigned',
        batteryPercent: robot?.batteryPercent, linearVelocity: robot?.linearVelocity,
        sourceEndpointCode: source, destinationEndpointCode: destination, routeText: `${source} ➔ ${destination}`,
        currentStop: waitingTask ? endpointCode(waitingTask.contextValues?.stopEndpointId)
          : currentEndpointId ? endpointCode(currentEndpointId) : '',
        transportRequestId: raw.transportRequestIds?.[0], containerMeta,
        activeTaskId: waitingTask?.id, activeStepId: waitingStep?.id, activeStepOperation: operation,
        assignedStaffId: waitingTask?.contextValues?.assignedStaffId,
        hasWaitingHandover: Boolean(raw.status === 'RUNNING' && waitingStep && ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(operation || '')),
        waitingContainerId, completedSteps: raw.completedSteps, totalSteps: raw.totalSteps,
      },
    };
  });
}
export interface JobListItem {
  id: string;
  jobNo: string;
  status: JobStatus;
  workflowId: string;
  mapVersionId: string;
  assignedRobotId: string | null;
  transportRequestIds: string[];
  containerCount: number;
  completedSteps: number;
  totalSteps: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
}
export interface JobListResponse { items: JobListItem[]; total: number }
export async function listJobSummaries(filter: { status?: JobStatus; transportRequestId?: string; search?: string; take?: number } = {}): Promise<JobListResponse> {
  const query = new URLSearchParams();
  if (filter.status) query.set('status', filter.status);
  if (filter.search) query.set('search', filter.search);
  if (filter.transportRequestId) query.set('transportRequestId', filter.transportRequestId);
  query.set('take', String(Math.min(200, Math.max(1, filter.take ?? 50))));
  return apiFetch<JobListResponse>(`/api/workflow-execution/jobs?${query}`);
}
export async function listJobs(filter: { status?: JobStatus; zone?: string; warehouseId?: string; transportRequestId?: string; take?: number } = {}) {
  const response = await listJobSummaries(filter);
  const details = await Promise.all(response.items.map(item => apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${item.id}`)));
  const jobs = await hydrateJobs(details);
  return filter.warehouseId ? jobs.filter(job => job.contextValues?.warehouseId === filter.warehouseId) : jobs;
}
export async function getJobDetail(jobId: string): Promise<JobDetailResponse> {
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${jobId}`);
  if (response.id !== jobId) throw new ApiError(502, 'job_identity_mismatch', 'The server returned a different job.');
  return (await hydrateJobs([response]))[0];
}
export async function startJob(jobId: string, robotId?: string | null): Promise<JobDetailResponse> {
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${jobId}/start`, {
    method: 'POST', body: JSON.stringify({ robotId: robotId || null }),
  });
  return (await hydrateJobs([response]))[0];
}
export async function pauseJob(jobId: string, reason: string): Promise<JobDetailResponse> {
  requireMobileCapability('pauseJob');
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ApiError(400, 'job_pause_reason_required', 'Enter a reason for pausing this Job.');
  }
  if (trimmed.length > 500) {
    throw new ApiError(400, 'job_pause_reason_too_long', 'The pause reason must be 500 characters or fewer.');
  }
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    body: JSON.stringify({ reason: trimmed }),
  }, callerToken());
  return (await hydrateJobs([response]))[0];
}
export async function resumeJob(jobId: string, robotId?: string | null): Promise<JobDetailResponse> {
  requireMobileCapability('resumeJob');
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${jobId}/resume`, {
    method: 'POST', body: JSON.stringify({ robotId: robotId || null }),
  }, callerToken());
  return (await hydrateJobs([response]))[0];
}
export async function confirmHandover(request: HandoverConfirmRequest): Promise<JobDetailResponse>;
export async function confirmHandover(stepId: string, body?: HandoverConfirmationBody): Promise<JobDetailResponse>;
export async function confirmHandover(requestOrId: HandoverConfirmRequest | string, body?: HandoverConfirmationBody): Promise<JobDetailResponse> {
  const request = typeof requestOrId === 'string'
    ? { jobStepId: requestOrId, containerId: body?.containerId, note: body?.note } : requestOrId;
  const confirmBody = handoverConfirmBody(request);
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${request.jobStepId}/confirm`, {
    method: 'POST', body: JSON.stringify(confirmBody),
  });
  return (await hydrateJobs([response]))[0];
}
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
/**
 * ConfirmJobStepRequest(Guid? ContainerId, string? Note, string? ScannedBarcode): only a UUID goes into containerId (a
 * raw barcode there fails JSON binding with 400); what was scanned travels as scannedBarcode and the server compares it.
 */
export function handoverConfirmBody(request: HandoverConfirmRequest) {
  const id = [request.containerId, request.scannedContainerBarcode].find(value => typeof value === 'string' && UUID.test(value)) || null;
  const scanned = typeof request.scannedContainerBarcode === 'string' && request.scannedContainerBarcode.trim()
    && !UUID.test(request.scannedContainerBarcode) ? request.scannedContainerBarcode.trim() : null;
  return { containerId: id, note: request.note || request.notes || null, scannedBarcode: scanned };
}
/** WH-03: take a waiting human step (or extend your claim). 409 human_task_claimed when someone else holds it. */
export async function claimJobStep(stepId: string): Promise<JobDetailResponse> {
  requireMobileCapability('claimHumanTask');
  return (await hydrateJobs([await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${stepId}/claim`, { method: 'POST' })]))[0];
}
export async function releaseJobStep(stepId: string): Promise<JobDetailResponse> {
  requireMobileCapability('claimHumanTask');
  return (await hydrateJobs([await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${stepId}/release`, { method: 'POST' })]))[0];
}
/** job.takeover: take a step someone else holds; the reason is recorded. */
export async function takeOverJobStep(stepId: string, reason: string): Promise<JobDetailResponse> {
  requireMobileCapability('claimHumanTask');
  return (await hydrateJobs([await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${stepId}/takeover`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })]))[0];
}
export type HandoverBatchOutcome = 'confirmed' | 'already_confirmed' | 'mismatch' | 'not_reached' | 'refused';
export interface HandoverBatchResult { containerId: string; jobStepId: string | null; outcome: HandoverBatchOutcome; code: string | null }
/** APP-OPS-02: confirms every handover of this stop at once; partial by design, each container has its own result. */
export async function confirmHandoverBatch(jobId: string, type: 'PICKUP' | 'DROPOFF', containerIds: string[], note?: string | null) {
  const response = await apiFetch<{ results: HandoverBatchResult[]; job: RuntimeJob }>(`/api/workflow-execution/jobs/${jobId}/handover/confirm-batch`, {
    method: 'POST', body: JSON.stringify({ type, containerIds, note: note ?? null }),
  });
  return { results: response.results, job: (await hydrateJobs([response.job]))[0] };
}

export async function listHandoverStops(
  options: { mine?: boolean; signal?: AbortSignal } = {},
): Promise<HandoverStopResponse[]> {
  const path = `/api/workflow-execution/handover-stops${options.mine ? '?mine=true' : ''}`;
  const data = await apiFetch<{ items?: unknown }>(path, { signal: options.signal });
  if (!data || !Array.isArray(data.items)) {
    throw new ApiError(502, 'handover_stops_invalid', 'The handover queue response could not be read.');
  }
  return data.items as HandoverStopResponse[];
}

async function changeHandoverStop(
  jobId: string,
  stopId: string,
  path: 'claim' | 'begin' | 'release' | 'heartbeat' | 'extend',
  moveId: string,
  version: number,
): Promise<HandoverStopResponse> {
  requireMobileCapability('claimHumanTask');
  if (typeof moveId !== 'string' || !moveId.trim() || !Number.isInteger(version) || version < 0) {
    throw new ApiError(400, 'handover_stop_invalid', 'Invalid handover turn reference. Refresh the queue.');
  }
  const response = await apiFetch<HandoverStopResponse>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/handover-stops/${encodeURIComponent(stopId)}/${path}`,
    { method: 'POST', body: JSON.stringify({ moveId: moveId.trim(), version }) },
    callerToken(),
  );
  if (!response || response.id !== stopId || response.jobId !== jobId) {
    throw new ApiError(502, 'handover_stop_invalid', 'The handover queue response could not be read.');
  }
  return response;
}

export function claimHandoverStop(jobId: string, stopId: string, moveId: string, version: number) {
  return changeHandoverStop(jobId, stopId, 'claim', moveId, version);
}

export function beginHandoverStop(jobId: string, stopId: string, moveId: string, version: number) {
  return changeHandoverStop(jobId, stopId, 'begin', moveId, version);
}

export function releaseHandoverStop(jobId: string, stopId: string, moveId: string, version: number) {
  return changeHandoverStop(jobId, stopId, 'release', moveId, version);
}

export function heartbeatHandoverStop(jobId: string, stopId: string, moveId: string, version: number) {
  return changeHandoverStop(jobId, stopId, 'heartbeat', moveId, version);
}

export function extendHandoverStop(jobId: string, stopId: string, moveId: string, version: number) {
  return changeHandoverStop(jobId, stopId, 'extend', moveId, version);
}

function parseWorkZoneEnvelope(data: unknown): StaffWorkZoneResponse | null {
  if (!data || typeof data !== 'object' || !('workZone' in data)) {
    throw new ApiError(502, 'handover_work_zone_invalid', 'Could not read your priority work zone from the server.');
  }
  const workZone = (data as { workZone?: unknown }).workZone;
  if (workZone === null || workZone === undefined) {
    return null;
  }
  if (
    typeof workZone !== 'object'
    || typeof (workZone as { code?: unknown }).code !== 'string'
    || typeof (workZone as { warehouseId?: unknown }).warehouseId !== 'string'
  ) {
    throw new ApiError(502, 'handover_work_zone_invalid', 'Could not read your priority work zone from the server.');
  }
  return workZone as StaffWorkZoneResponse;
}

export async function getMyHandoverWorkZone(signal?: AbortSignal): Promise<StaffWorkZoneResponse | null> {
  const data = await apiFetch<{ workZone?: unknown }>(
    '/api/workflow-execution/handover-stops/work-zone',
    { signal },
  );
  return parseWorkZoneEnvelope(data);
}

export async function setMyHandoverWorkZone(zoneId: string | null): Promise<StaffWorkZoneResponse | null> {
  const trimmed = typeof zoneId === 'string' && zoneId.trim() ? zoneId.trim() : null;
  const data = await apiFetch<{ workZone?: unknown }>(
    '/api/workflow-execution/handover-stops/work-zone',
    {
      method: 'PUT',
      body: JSON.stringify({ zoneId: trimmed }),
    },
    callerToken(),
  );
  return parseWorkZoneEnvelope(data);
}
/** WH-10: the container of this waiting handover cannot go on; the Job continues with the others. */
export async function failJobContainer(stepId: string, containerId: string, reason: string, problemCode?: string | null) {
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${stepId}/fail-container`, {
    method: 'POST', body: JSON.stringify({ containerId, reason, problemCode: problemCode || null }),
  });
  return (await hydrateJobs([response]))[0];
}
export function confirmJobStep(stepId: string, containerId: string | null, note?: string | null) {
  return confirmHandover({ jobStepId: stepId, containerId, note });
}
/**
 * Confirm an INSPECTION_CONFIRM step with its result (the step's declared output inspectionResult). A FAILED result
 * needs a note; the scanned container is compared by the server like a handover scan.
 */
export async function confirmInspection(stepId: string, result: 'PASSED' | 'FAILED', note: string | null, scannedBarcode: string | null, containerId: string | null, defects: string[] = []) {
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${stepId}/confirm`, {
    method: 'POST', body: JSON.stringify({ containerId: containerId && UUID.test(containerId) ? containerId : null, note: note?.trim() || null, scannedBarcode, inspectionResult: result, defects: result === 'FAILED' ? defects : null }),
  });
  return (await hydrateJobs([response]))[0];
}
/** Staff incident categories → backend IssueReport type, severity and optional handover problemCode (OPS-01). */
const ISSUE_MAPPING: Record<string, { issueType: string; severity: string; problemCode?: HandoverProblemCode }> = {
  WRONG_CONTAINER: { issueType: 'CONTAINER', severity: 'HIGH', problemCode: 'WRONG_CONTAINER' },
  MISSING_CONTAINER: { issueType: 'CONTAINER', severity: 'HIGH', problemCode: 'MISSING_CONTAINER' },
  CONTAINER_DAMAGED: { issueType: 'CONTAINER', severity: 'HIGH', problemCode: 'CONTAINER_DAMAGED' },
  BARCODE_UNREADABLE: { issueType: 'CONTAINER', severity: 'MEDIUM', problemCode: 'BARCODE_UNREADABLE' },
  UNSAFE_LOAD: { issueType: 'CONTAINER', severity: 'HIGH', problemCode: 'UNSAFE_LOAD' },
  QUANTITY_MISMATCH: { issueType: 'CONTAINER', severity: 'MEDIUM', problemCode: 'QUANTITY_MISMATCH' },
  SHELF_BLOCKED: { issueType: 'STORAGE', severity: 'MEDIUM' },
  AMR_PATH_BLOCKED: { issueType: 'JOB', severity: 'HIGH' },
};

/**
 * Opens an IssueReport for a job (`POST /api/operations/issues`). Admins (and the robot's Technicians) are notified;
 * the job and the robot are not changed.
 */
export function reportTaskProblem(
  _taskId: string | undefined,
  body: ReportTaskProblemBody,
  jobStepId?: string,
  context: { jobId?: string; containerId?: string; robotId?: string } = {},
) {
  requireMobileCapability('reportIssue');
  const mapped = ISSUE_MAPPING[body.reason] ?? { issueType: 'OTHER', severity: 'MEDIUM' };
  const problemCode =
    mapped.problemCode && context.jobId && context.containerId ? mapped.problemCode : null;
  return apiFetch<{
    id: string;
    code: string;
    status: string;
    version?: number;
    evidence?: import('../types/contracts').IssueEvidenceDto[];
  }>('/api/operations/issues', {
    method: 'POST',
    body: JSON.stringify({
      issueType: mapped.issueType,
      severity: mapped.severity,
      description: `[${body.reason}] ${body.note ?? ''}`.trim(),
      jobId: context.jobId ?? null,
      jobStepId: jobStepId ?? null,
      containerId: context.containerId ?? null,
      robotId: context.robotId ?? null,
      problemCode,
    }),
  }, callerToken());
}

function normalizeManifestScans(
  scans: HandoverStopScan[],
  emptyMessage = 'Scan each container once before confirming.',
): HandoverStopScan[] {
  if (!Array.isArray(scans) || !scans.length) {
    throw new ApiError(400, 'handover_scan_manifest_mismatch', emptyMessage);
  }
  const seen = new Set<string>();
  const normalized: HandoverStopScan[] = [];
  for (const item of scans) {
    const containerId = typeof item?.containerId === 'string' ? item.containerId.trim() : '';
    const barcode = typeof item?.barcode === 'string' ? item.barcode.trim() : '';
    if (!containerId || !barcode || seen.has(containerId)) {
      throw new ApiError(400, 'handover_scan_manifest_mismatch', emptyMessage);
    }
    seen.add(containerId);
    normalized.push({ containerId, barcode });
  }
  return normalized;
}

export async function confirmHandoverStop(
  jobId: string,
  stopId: string,
  moveId: string,
  version: number,
  scans: HandoverStopScan[],
): Promise<JobDetailResponse> {
  requireMobileCapability('claimHumanTask');
  if (typeof moveId !== 'string' || !moveId.trim() || !Number.isInteger(version) || version < 0) {
    throw new ApiError(400, 'handover_stop_invalid', 'Invalid handover turn reference. Refresh the queue.');
  }
  const normalizedScans = normalizeManifestScans(scans, 'Scan each container of this handover once.');
  const response = await apiFetch<RuntimeJob>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/handover-stops/${encodeURIComponent(stopId)}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({ moveId: moveId.trim(), version, scans: normalizedScans }),
    },
    callerToken(),
  );
  return (await hydrateJobs([response]))[0];
}

function validateRecoveryCaseResponse(jobId: string, data: unknown): JobRecoveryResponse {
  if (!data || typeof data !== 'object' || !('recovery' in data)) {
    throw new ApiError(502, 'recovery_invalid', 'The payload recovery response could not be read.');
  }
  const recovery = (data as { recovery?: unknown }).recovery as JobRecoveryResponse | null | undefined;
  if (
    !recovery
    || typeof recovery !== 'object'
    || typeof recovery.id !== 'string'
    || recovery.jobId !== jobId
    || !Number.isInteger(recovery.version)
    || !Array.isArray(recovery.containers)
    || !Array.isArray(recovery.availableActions)
  ) {
    throw new ApiError(502, 'recovery_invalid', 'The payload recovery response could not be read.');
  }
  return recovery;
}

function requireRecoveryCaseVersion(caseId: string, version: number): string {
  const trimmedCaseId = typeof caseId === 'string' ? caseId.trim() : '';
  if (!trimmedCaseId || !Number.isInteger(version) || version < 0) {
    throw new ApiError(400, 'recovery_case_changed', 'This recovery case changed. Refresh it and try again.');
  }
  return trimmedCaseId;
}

function normalizeRecoveryNote(note?: string | null): string | null {
  const trimmed = note?.trim() || '';
  if (trimmed.length > 500) {
    throw new ApiError(400, 'recovery_note_too_long', 'Keep the recovery note to 500 characters or fewer.');
  }
  return trimmed || null;
}

export async function getJobRecovery(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobRecoveryResponse | null> {
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery`,
    { signal },
  );
  if (!data || typeof data !== 'object' || !('recovery' in data)) {
    throw new ApiError(502, 'recovery_invalid', 'The payload recovery response could not be read.');
  }
  if (data.recovery === null || data.recovery === undefined) {
    return null;
  }
  return validateRecoveryCaseResponse(jobId, data);
}

/** Recovery points for the second robot (TARGET) or the failed robot (SOURCE), free and nearest first. */
export async function listRecoveryEndpointCandidates(
  jobId: string,
  target: 'TARGET' | 'SOURCE' = 'TARGET',
  signal?: AbortSignal,
): Promise<RecoveryEndpointCandidateResponse[]> {
  const data = await apiFetch<{ items?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/endpoint-candidates?for=${target}`,
    { signal },
  );
  if (!data || !Array.isArray(data.items)) {
    throw new ApiError(502, 'recovery_candidates_invalid', 'Could not read recovery points from the server.');
  }
  return data.items as RecoveryEndpointCandidateResponse[];
}

/** Staff scanned containers off the failed robot and hold them (STAFF) or left them at a recovery point. */
export async function unloadRecoveryCargo(
  jobId: string,
  caseId: string,
  version: number,
  scans: HandoverStopScan[],
  holder: 'STAFF' | 'RECOVERY_STATION' = 'STAFF',
  note?: string | null,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const data = await apiFetch<unknown>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/unload-confirm`,
    { method: 'POST', body: JSON.stringify({ caseId: trimmedCaseId, version, scans, holder, note: normalizeRecoveryNote(note) }) },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

/** Cargo taken off the Job by hand: back to storage or quarantined; each container is held under a CONTAINER issue. */
export async function resolveRecoveryManually(
  jobId: string,
  caseId: string,
  version: number,
  disposition: 'RETURN_TO_STORAGE' | 'QUARANTINE_CARGO',
  scans: HandoverStopScan[],
  problemCode?: string | null,
  note?: string | null,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const data = await apiFetch<unknown>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/resolve-manually`,
    {
      method: 'POST',
      body: JSON.stringify({ caseId: trimmedCaseId, version, disposition, scans, problemCode: problemCode ?? null, note: normalizeRecoveryNote(note) }),
    },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

/** A paused Job with cargo on board needs a payload recovery; asking twice answers with the same case. */
export async function requestPayloadRecovery(jobId: string, reason?: string | null): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const data = await apiFetch<unknown>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/request`,
    { method: 'POST', body: JSON.stringify({ reason: normalizeRecoveryNote(reason) }) },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function listRecoveryCandidates(
  jobId: string,
  signal?: AbortSignal,
): Promise<RecoveryRobotCandidateResponse[]> {
  const data = await apiFetch<{ items?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/candidates`,
    { signal },
  );
  if (!data || !Array.isArray(data.items)) {
    throw new ApiError(502, 'recovery_candidates_invalid', 'Could not read rescue robot candidates from the server.');
  }
  return data.items as RecoveryRobotCandidateResponse[];
}

export async function claimJobRecovery(
  jobId: string,
  caseId: string,
  version: number,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/claim`,
    { method: 'POST', body: JSON.stringify({ caseId: trimmedCaseId, version }) },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function releaseJobRecovery(
  jobId: string,
  caseId: string,
  version: number,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/release`,
    { method: 'POST', body: JSON.stringify({ caseId: trimmedCaseId, version }) },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function assignRecoveryRobot(
  jobId: string,
  caseId: string,
  version: number,
  robotId: string,
  endpointId: string,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const trimmedRobotId = typeof robotId === 'string' ? robotId.trim() : '';
  const trimmedEndpointId = typeof endpointId === 'string' ? endpointId.trim() : '';
  if (!trimmedRobotId) {
    throw new ApiError(400, 'robot_required', 'Select an eligible rescue robot.');
  }
  if (!trimmedEndpointId) {
    throw new ApiError(400, 'recovery_no_target', 'Select an enabled transfer endpoint.');
  }
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/assign`,
    {
      method: 'POST',
      body: JSON.stringify({
        caseId: trimmedCaseId,
        version,
        robotId: trimmedRobotId,
        endpointId: trimmedEndpointId,
      }),
    },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function unassignRecoveryRobot(
  jobId: string,
  caseId: string,
  version: number,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/unassign`,
    { method: 'POST', body: JSON.stringify({ caseId: trimmedCaseId, version }) },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function confirmRecoveryTransfer(
  jobId: string,
  caseId: string,
  version: number,
  robotId: string,
  scans: HandoverStopScan[],
  note?: string | null,
): Promise<JobDetailResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const trimmedRobotId = typeof robotId === 'string' ? robotId.trim() : '';
  if (!trimmedRobotId) {
    throw new ApiError(400, 'recovery_no_target', 'No rescue robot is assigned to this recovery case.');
  }
  const normalizedScans = normalizeManifestScans(scans, 'Scan each onboard container before confirming the transfer.');
  const normalizedNote = normalizeRecoveryNote(note);
  const response = await apiFetch<RuntimeJob>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/transfer-confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        caseId: trimmedCaseId,
        version,
        robotId: trimmedRobotId,
        scans: normalizedScans,
        note: normalizedNote,
      }),
    },
    callerToken(),
  );
  return (await hydrateJobs([response]))[0];
}

export async function armRecoveryTransferButton(
  jobId: string,
  caseId: string,
  version: number,
  robotId: string,
  scans: HandoverStopScan[],
  note?: string | null,
): Promise<JobRecoveryResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const trimmedRobotId = typeof robotId === 'string' ? robotId.trim() : '';
  if (!trimmedRobotId) {
    throw new ApiError(400, 'recovery_no_target', 'No rescue robot is assigned to this recovery case.');
  }
  const normalizedScans = normalizeManifestScans(scans, 'Scan each onboard container before arming the rescue robot button.');
  const normalizedNote = normalizeRecoveryNote(note);
  const data = await apiFetch<{ recovery?: unknown }>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/arm-button`,
    {
      method: 'POST',
      body: JSON.stringify({
        caseId: trimmedCaseId,
        version,
        robotId: trimmedRobotId,
        scans: normalizedScans,
        note: normalizedNote,
      }),
    },
    callerToken(),
  );
  return validateRecoveryCaseResponse(jobId, data);
}

export async function resumeRecoveryOnSameRobot(
  jobId: string,
  caseId: string,
  version: number,
  note?: string | null,
): Promise<JobDetailResponse> {
  requireMobileCapability('payloadRecovery');
  const trimmedCaseId = requireRecoveryCaseVersion(caseId, version);
  const normalizedNote = normalizeRecoveryNote(note);
  const response = await apiFetch<RuntimeJob>(
    `/api/workflow-execution/jobs/${encodeURIComponent(jobId)}/recovery/resume-same-robot`,
    {
      method: 'POST',
      body: JSON.stringify({
        caseId: trimmedCaseId,
        version,
        note: normalizedNote,
      }),
    },
    callerToken(),
  );
  return (await hydrateJobs([response]))[0];
}
