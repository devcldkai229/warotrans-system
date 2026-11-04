import { apiFetch, ApiError } from './client';
import { getContainer } from './warehouseApi';
import { getMapVersionDetail } from './navigationApi';
import { getWorkflow } from './workflowApi';
import { listRobots } from './fleetApi';
import { requireMobileCapability } from './capabilities';
import type {
  JobContainerResponse, JobDetailResponse, JobStatus, JobStepResponse, JobTaskResponse,
  HandoverConfirmationBody, HandoverConfirmationResponse, ReportTaskProblemBody,
} from '../types/contracts';

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
export interface AcceptTaskResponse { taskId: string; status: string; assignedStaffId: string; acceptedAt: string }
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
export async function listJobSummaries(filter: { status?: JobStatus; transportRequestId?: string; take?: number } = {}): Promise<JobListResponse> {
  const query = new URLSearchParams();
  if (filter.status) query.set('status', filter.status);
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
export async function resumeJob(jobId: string, robotId?: string | null): Promise<JobDetailResponse> {
  requireMobileCapability('resumeJob');
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/jobs/${jobId}/resume`, {
    method: 'POST', body: JSON.stringify({ robotId: robotId || null }),
  });
  return (await hydrateJobs([response]))[0];
}
export async function confirmHandover(request: HandoverConfirmRequest): Promise<JobDetailResponse>;
export async function confirmHandover(stepId: string, body?: HandoverConfirmationBody): Promise<JobDetailResponse>;
export async function confirmHandover(requestOrId: HandoverConfirmRequest | string, body?: HandoverConfirmationBody): Promise<JobDetailResponse> {
  const request = typeof requestOrId === 'string'
    ? { jobStepId: requestOrId, containerId: body?.containerId, note: body?.note } : requestOrId;
  const response = await apiFetch<RuntimeJob>(`/api/workflow-execution/job-steps/${request.jobStepId}/confirm`, {
    method: 'POST', body: JSON.stringify({
      containerId: request.containerId || request.scannedContainerBarcode || null, note: request.note || request.notes || null,
    }),
  });
  return (await hydrateJobs([response]))[0];
}
export function confirmJobStep(stepId: string, containerId: string | null, note?: string | null) {
  return confirmHandover({ jobStepId: stepId, containerId, note });
}
export function acceptHumanTask(taskId: string, _staffId?: string): Promise<AcceptTaskResponse> {
  requireMobileCapability('claimHumanTask');
  return apiFetch<AcceptTaskResponse>(`/api/workflow-execution/tasks/${taskId}/accept`, { method: 'POST' });
}
export function reportTaskProblem(taskId: string, body: ReportTaskProblemBody, jobStepId?: string) {
  requireMobileCapability('reportIssue');
  return apiFetch<unknown>(`/api/workflow-execution/tasks/${taskId}/report-problem`, {
    method: 'POST', body: JSON.stringify(body),
  });
}
export function completePayloadRecoveryJob(_jobId: string, _robotCode: string): never {
  throw new ApiError(501, 'recovery_not_supported', 'Payload recovery execution is not available on this server.');
}
