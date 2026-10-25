import type { ContainerSlot, JobDetailResponse, JobStatus, JobStepResponse, JobStepSummary, JobSummary, JobTaskResponse, WorkflowCode } from '../../shared/types/contracts';
import type { SemanticTone } from '../../shared/theme/colors';
export interface JobStopStep { type: string; label: string; status: 'done' | 'waiting' | 'running' | 'future'; timeRemaining?: string }
export interface JobStopItem { id: number; name: string; description: string; state: 'done' | 'active' | 'future'; current?: boolean; steps?: JobStopStep[] }
export interface JobContainerItem {
  containerId?: string; status?: string; isTarget?: boolean; code: string; slot: string;
  action: 'UNLOAD' | 'KEEP ONBOARD' | 'PICKUP' | 'DELIVERED'; location: string; product: string; qty: number;
}
export interface AppJobItem extends JobSummary {
  tasks: AppJobTaskItem[];
  activeTaskId?: string; assignedStaffId?: string; activeStepId?: string; activeStepOperation?: string;
  hasWaitingHandover?: boolean; assignedRobotId?: string; target: string; route: string; robot: string; isMine: boolean;
  battery: string; speed: string; distanceRemaining?: string; progressPercent?: number; completedAt?: string;
  duration?: string; operator?: string; currentStop: string; stopsCount: number; routeText: string;
  payloadSummary: string; containers: JobContainerItem[]; stopsList: JobStopItem[];
}
export interface AppJobTaskItem extends JobTaskResponse {
  title: string;
  endpointCode?: string;
  containerCodes: string[];
}
export function jobStepTitle(step: JobStepResponse): string {
  return step.name || readableKey(step.workflowStepKey || step.operationCode || 'Step');
}
function readableKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
export function jobTaskFocus(task: AppJobTaskItem): JobStepResponse | undefined {
  return task.steps.find(step => step.status === 'FAILED')
    || task.steps.find(step => step.status === 'PAUSED')
    || task.steps.find(step => step.status === 'EXECUTING' || step.status === 'WAITING')
    || task.steps.find(step => step.status === 'READY')
    || task.steps.find(step => step.status === 'PENDING');
}
export function isTerminalJobStatus(status: JobStatus) { return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status); }
export interface JobStatusPresentation { label: string; tone: SemanticTone }
export const JOB_STATUS_PRESENTATION: Record<JobStatus, JobStatusPresentation> = {
  CREATED: { label: 'Created', tone: 'neutral' }, QUEUED: { label: 'Queued', tone: 'neutral' },
  ASSIGNED: { label: 'Assigned', tone: 'info' }, RUNNING: { label: 'Running', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' }, REASSIGNING: { label: 'Reassigning', tone: 'warning' },
  RECOVERY_REQUIRED: { label: 'Needs Recovery', tone: 'danger' }, COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' }, CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const EMPTY_JOB: AppJobItem = {
  id: '', jobNo: '', workflowCode: '' as WorkflowCode, workflowName: '', status: 'CREATED',
  sourceEndpointCode: '', destinationEndpointCode: '', containerCount: 0, slots: [], steps: [], createdAtUtc: '',
  target: '', route: '', robot: '', isMine: false, battery: '—', speed: '—', currentStop: '',
  stopsCount: 0, routeText: '', payloadSummary: '', containers: [], stopsList: [], tasks: [],
};
export function mapJobDetailToAppJobItem(detail: JobDetailResponse, currentStaffId?: string): AppJobItem {
  const context = detail.contextValues || {};
  const source = String(context.sourceEndpointCode || 'Unknown Pickup');
  const destination = String(context.destinationEndpointCode || 'Unknown Dropoff');
  const robot = String(context.assignedRobotCode || 'Unassigned');
  const containers = Array.isArray(context.containerMeta) ? context.containerMeta as JobContainerItem[]
    : detail.containers.map((allocation, index): JobContainerItem => ({
      containerId: allocation.containerId, status: allocation.status, code: allocation.containerId, slot: `Bay ${index + 1}`,
      action: allocation.status === 'DELIVERED' ? 'DELIVERED' : allocation.status === 'ONBOARD' ? 'KEEP ONBOARD' : 'PICKUP',
      location: 'Unknown Location', product: 'Unknown Product', qty: 1,
    }));
  const orderedTasks = [...detail.tasks].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const tasks: AppJobTaskItem[] = orderedTasks.map(task => {
    const context = task.contextValues;
    const endpointCode = typeof context?.stopEndpointCode === 'string' && context.stopEndpointCode !== 'Unknown Endpoint'
      ? context.stopEndpointCode : undefined;
    const containerIds = typeof context?.containerId === 'string' ? [context.containerId]
      : Array.isArray(context?.containerIds) ? context.containerIds : [];
    const action = context?.stopAction === 'PICKUP' ? 'Pickup' : context?.stopAction === 'DROPOFF' ? 'Dropoff' : undefined;
    return {
      ...task,
      title: task.taskKey ? readableKey(task.taskKey) : action ? `${action}${endpointCode ? ` At ${endpointCode}` : ''}` : `Task ${task.sequenceNo}`,
      endpointCode,
      containerCodes: containerIds.map(id => containers.find(container => container.containerId === id)?.code || id),
      steps: [...task.steps].sort((a, b) => a.sequenceNo - b.sequenceNo),
    };
  });
  const allSteps = orderedTasks.flatMap(task => [...task.steps].sort((a, b) => a.sequenceNo - b.sequenceNo).map(step => ({ task, step })));
  const steps: JobStepSummary[] = allSteps.map(({ task, step }, index) => ({
    sequenceNo: index + 1, type: step.stepType, title: step.workflowStepKey || step.operationCode,
    description: step.errorMessage || step.operationCode, status: step.status,
    targetEndpointCode: String(task.contextValues?.stopEndpointCode || step.targetEndpointId || ''),
  }));
  const stopTasks = orderedTasks.filter(task => ['PICKUP', 'DROPOFF'].includes(String(task.contextValues?.stopAction)));
  const activeIndex = stopTasks.findIndex(task => !['COMPLETED', 'SKIPPED'].includes(task.status));
  const stopsList = stopTasks.map((task, index): JobStopItem => {
    const pickup = task.contextValues?.stopAction === 'PICKUP';
    const done = ['COMPLETED', 'SKIPPED'].includes(task.status);
    const active = !done && index === activeIndex && !['CREATED','QUEUED'].includes(detail.status) && !isTerminalJobStatus(detail.status);
    const endpoint = String(task.contextValues?.stopEndpointCode || (pickup ? source : destination));
    return {
      id: index + 1, name: `Stop ${index + 1}: ${pickup ? 'Pickup' : 'Dropoff'} · ${endpoint}`,
      description: `${pickup ? 'Load' : 'Unload'} · ${endpoint}`, state: done ? 'done' : active ? 'active' : 'future', current: active,
      steps: task.steps.map(step => ({
        type: step.stepType, label: step.workflowStepKey || step.operationCode,
        status: step.status === 'COMPLETED' ? 'done' : step.status === 'WAITING' ? 'waiting' : step.status === 'EXECUTING' ? 'running' : 'future',
      })),
    };
  });
  const slots: ContainerSlot[] = [1, 2].map(bay => {
    const container = containers[bay - 1];
    return {
      slotNo: bay as 1 | 2, slotLabel: bay === 1 ? 'Bay 1 (Front)' : 'Bay 2 (Rear)',
      containerBarcode: container?.code, productName: container?.product, quantity: container ? 1 : undefined,
      action: !container || container.action === 'DELIVERED' ? 'EMPTY' : container.action === 'KEEP ONBOARD' ? 'KEEP_ONBOARD' : container.action,
    };
  });
  const completed = allSteps.filter(({ step }) => step.status === 'COMPLETED').length;
  const assignedStaffId = typeof context.assignedStaffId === 'string' ? context.assignedStaffId : undefined;
  return {
    ...EMPTY_JOB, id: detail.id, jobNo: detail.jobNo, workflowCode: String(context.workflowCode || '') as WorkflowCode,
    workflowName: String(context.workflowName || 'Workflow'), status: detail.status,
    activeTaskId: typeof context.activeTaskId === 'string' ? context.activeTaskId : undefined, assignedStaffId,
    activeStepId: typeof context.activeStepId === 'string' ? context.activeStepId : undefined,
    activeStepOperation: typeof context.activeStepOperation === 'string' ? context.activeStepOperation : undefined,
    hasWaitingHandover: context.hasWaitingHandover === true,
    assignedRobotId: typeof context.assignedRobotId === 'string' ? context.assignedRobotId : undefined,
    assignedRobotCode: robot, sourceEndpointCode: source, destinationEndpointCode: destination,
    activeStepTitle: detail.failureMessage || allSteps.find(({ step }) => step.id === context.activeStepId)?.step.operationCode || 'Job Progress',
    containerCount: detail.containers.length, slots, steps, tasks, createdAtUtc: detail.createdAt,
    target: destination, route: `${source} ➔ ${destination}`, robot,
    isMine: Boolean(currentStaffId && assignedStaffId === currentStaffId && !isTerminalJobStatus(detail.status)),
    battery: typeof context.batteryPercent === 'number' ? `${Math.round(context.batteryPercent)}%` : '—',
    speed: typeof context.linearVelocity === 'number' ? `${context.linearVelocity.toFixed(2)} m/s` : '—',
    progressPercent: allSteps.length ? Math.round(completed / allSteps.length * 100) : 0,
    completedAt: detail.completedAt || undefined, currentStop: String(context.currentStop || ''),
    stopsCount: stopsList.length, routeText: `${source} ➔ ${destination}`,
    payloadSummary: `${detail.containers.length} Container(s)`, containers, stopsList,
  };
}
