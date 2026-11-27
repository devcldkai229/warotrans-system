import type {
  ActionAvailability, ContainerSlot, IssueEvidenceDto, JobDetailResponse, JobOperatorPause, JobStatus,
  JobStepResponse, JobStepSummary, JobSummary, JobTaskResponse, WorkflowCode,
} from '../../shared/types/contracts';
import type { SemanticTone } from '../../shared/theme/colors';
export interface JobStopStep { type: string; label: string; status: 'done' | 'waiting' | 'running' | 'future'; timeRemaining?: string }
export interface JobStopItem { id: number; name: string; description: string; state: 'done' | 'active' | 'future'; current?: boolean; steps?: JobStopStep[] }
export interface JobContainerItem {
  containerId?: string; status?: string; isTarget?: boolean; code: string; slot: string;
  action: 'UNLOAD' | 'KEEP ONBOARD' | 'PICKUP' | 'DELIVERED'; location: string; product: string; qty: number;
}
export interface AppJobItem extends JobSummary {
  mapVersionId: string;
  tasks: AppJobTaskItem[];
  availableActions?: ActionAvailability[];
  operatorPause?: JobOperatorPause | null;
  activeHandoverStopId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  activeTaskId?: string; assignedStaffId?: string; activeStepId?: string; activeStepOperation?: string;
  hasWaitingHandover?: boolean; assignedRobotId?: string; target: string; route: string; robot: string; isMine: boolean;
  sourceName?: string; destinationName?: string; startedAt?: string;
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

export function humanizeEndpointCode(code: string | null | undefined, fallback = '—'): string {
  if (!code || !code.trim()) return fallback;
  const trimmed = code.trim();
  if (!/^EP-/i.test(trimmed)) return trimmed;
  const tokens = trimmed
    .replace(/^EP-/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (!tokens.length) return fallback;
  return tokens
    .map((token) => {
      if (/^[A-Za-z]{2,}$/.test(token)) {
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      }
      return token.toUpperCase();
    })
    .join(' ');
}

export function formatPlaceDisplayName(
  places: { name(key: string | null | undefined, fallback?: string): string },
  code: string | null | undefined,
  fallback = '—',
): string {
  if (!code || !code.trim()) return fallback;
  const resolved = places.name(code, '');
  if (resolved && resolved !== code) {
    return /^EP-/i.test(resolved.trim()) ? humanizeEndpointCode(resolved, fallback) : resolved;
  }
  return humanizeEndpointCode(resolved || code, fallback);
}

export function formatJobDuration(
  startIso?: string,
  endIso?: string,
  language: 'en' | 'vi' = 'en',
): string | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const totalSec = Math.round((end - start) / 1000);
  if (totalSec < 60) {
    return language === 'vi' ? `${totalSec}g` : `${totalSec}s`;
  }
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return language === 'vi' ? (s ? `${m}p ${s}g` : `${m}p`) : (s ? `${m}m ${s}s` : `${m}m`);
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return language === 'vi' ? (m ? `${h}g ${m}p` : `${h}g`) : (m ? `${h}h ${m}m` : `${h}h`);
}

export function extractJobCancelReason(
  job: Pick<AppJobItem, 'failureMessage' | 'tasks'>,
): string | null {
  if (job.failureMessage?.trim()) return job.failureMessage.trim();
  for (const task of job.tasks) {
    for (const step of task.steps) {
      if (step.status === 'CANCELLED' && step.errorMessage?.trim()) {
        return step.errorMessage.trim();
      }
    }
  }
  return null;
}

export function formatDeadlineCountdown(
  deadlineIso: string | null | undefined,
  nowMs: number,
  language: 'en' | 'vi' = 'en',
): { text: string; urgent: boolean; expired: boolean } | null {
  if (!deadlineIso) return null;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return null;
  const remainingSec = Math.ceil((deadlineMs - nowMs) / 1000);
  if (remainingSec <= 0) {
    return {
      text: language === 'vi' ? 'Quá hạn' : 'Expired',
      urgent: true,
      expired: true,
    };
  }
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');
  return {
    text: language === 'vi' ? `Còn ${mm}:${ss}` : `${mm}:${ss} left`,
    urgent: remainingSec <= 30,
    expired: false,
  };
}

const PROBLEM_CODE_LABELS: Record<string, string> = {
  WRONG_CONTAINER: 'Wrong Container',
  MISSING_CONTAINER: 'Missing Container',
  CONTAINER_DAMAGED: 'Container Damaged',
  BARCODE_UNREADABLE: 'Barcode Unreadable',
  UNSAFE_LOAD: 'Unsafe Load',
  SHELF_BLOCKED: 'Shelf Blocked',
  AMR_PATH_BLOCKED: 'AMR Path Blocked',
};

export function humanizeProblemCode(code: string | null | undefined): string {
  if (!code || !code.trim()) return '—';
  const normalized = code.trim().toUpperCase();
  return PROBLEM_CODE_LABELS[normalized] ?? readableKey(code);
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const VI_MONTHS = [
  'Thg 1', 'Thg 2', 'Thg 3', 'Thg 4', 'Thg 5', 'Thg 6',
  'Thg 7', 'Thg 8', 'Thg 9', 'Thg 10', 'Thg 11', 'Thg 12',
] as const;

export type HistoryListRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'job'; key: string; job: AppJobItem };

export function jobHistoryTimestamp(job: Pick<AppJobItem, 'completedAt' | 'createdAtUtc'>): number | null {
  if (job.completedAt) {
    const completed = Date.parse(job.completedAt);
    if (Number.isFinite(completed)) return completed;
  }
  if (job.createdAtUtc) {
    const created = Date.parse(job.createdAtUtc);
    if (Number.isFinite(created)) return created;
  }
  return null;
}

export function formatJobClockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHistoryDateHeader(
  iso: string | undefined,
  now: Date = new Date(),
  language: 'en' | 'vi' = 'en',
): string {
  const parsed = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(parsed)) {
    return language === 'vi' ? 'Trước đó' : 'Earlier';
  }
  const date = new Date(parsed);
  const day = date.getDate();
  const monthIdx = date.getMonth();
  const year = date.getFullYear();
  const monthLabel = language === 'vi' ? VI_MONTHS[monthIdx] : EN_MONTHS[monthIdx];

  const todayKey = localDayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);
  const targetKey = localDayKey(date);

  if (targetKey === todayKey) {
    return language === 'vi' ? `Hôm nay · ${day} ${monthLabel}` : `Today · ${day} ${monthLabel}`;
  }
  if (targetKey === yesterdayKey) {
    return language === 'vi' ? `Hôm qua · ${day} ${monthLabel}` : `Yesterday · ${day} ${monthLabel}`;
  }
  if (year === now.getFullYear()) {
    return `${day} ${monthLabel}`;
  }
  return language === 'vi' ? `${day} ${monthLabel}, ${year}` : `${day} ${monthLabel} ${year}`;
}

export function groupHistoryJobs(
  jobs: AppJobItem[],
  now: Date = new Date(),
  language: 'en' | 'vi' = 'en',
): HistoryListRow[] {
  const sorted = [...jobs].sort((a, b) => {
    const ta = jobHistoryTimestamp(a);
    const tb = jobHistoryTimestamp(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });

  const rows: HistoryListRow[] = [];
  let lastDayKey: string | null = null;

  for (const job of sorted) {
    const ts = jobHistoryTimestamp(job);
    const rawIso = ts !== null ? new Date(ts).toISOString() : undefined;
    const dayKey = ts !== null ? localDayKey(new Date(ts)) : 'unknown';

    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      rows.push({
        type: 'date',
        key: `date-${dayKey}`,
        label: formatHistoryDateHeader(rawIso, now, language),
      });
    }

    rows.push({
      type: 'job',
      key: job.id,
      job,
    });
  }

  return rows;
}
export interface JobStatusPresentation { label: string; tone: SemanticTone }
export const JOB_STATUS_PRESENTATION: Record<JobStatus, JobStatusPresentation> = {
  CREATED: { label: 'Created', tone: 'neutral' }, QUEUED: { label: 'Queued', tone: 'neutral' },
  ASSIGNED: { label: 'Assigned', tone: 'info' }, RUNNING: { label: 'Running', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' }, REASSIGNING: { label: 'Reassigning', tone: 'warning' },
  RECOVERY_REQUIRED: { label: 'Needs Recovery', tone: 'danger' }, COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' }, CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const EMPTY_JOB: AppJobItem = {
  id: '', jobNo: '', mapVersionId: '', workflowCode: '' as WorkflowCode, workflowName: '', status: 'CREATED',
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
  const claimedByMe = Boolean(
    currentStaffId
    && allSteps.some(({ step }) => step.status === 'WAITING' && step.stepType === 'HUMAN_INTERACTION' && step.claimedBy === currentStaffId),
  );
  return {
    ...EMPTY_JOB, id: detail.id, mapVersionId: detail.mapVersionId, jobNo: detail.jobNo, workflowCode: String(context.workflowCode || '') as WorkflowCode,
    workflowName: String(context.workflowName || 'Workflow'), status: detail.status,
    availableActions: detail.availableActions,
    operatorPause: detail.operatorPause ?? null,
    activeHandoverStopId: detail.activeHandoverStopId ?? null,
    failureCode: detail.failureCode ?? null,
    failureMessage: detail.failureMessage ?? null,
    activeTaskId: typeof context.activeTaskId === 'string' ? context.activeTaskId : undefined, assignedStaffId,
    activeStepId: typeof context.activeStepId === 'string' ? context.activeStepId : undefined,
    activeStepOperation: typeof context.activeStepOperation === 'string' ? context.activeStepOperation : undefined,
    hasWaitingHandover: context.hasWaitingHandover === true,
    assignedRobotId: typeof context.assignedRobotId === 'string' ? context.assignedRobotId : undefined,
    assignedRobotCode: robot, sourceEndpointCode: source, destinationEndpointCode: destination,
    activeStepTitle: detail.failureMessage || allSteps.find(({ step }) => step.id === context.activeStepId)?.step.operationCode || 'Job Progress',
    containerCount: detail.containers.length, slots, steps, tasks, createdAtUtc: detail.createdAt,
    startedAt: detail.startedAt || undefined,
    target: destination, route: `${source} ➔ ${destination}`, robot,
    isMine: Boolean(!isTerminalJobStatus(detail.status) && (claimedByMe || (currentStaffId && assignedStaffId === currentStaffId))),
    battery: typeof context.batteryPercent === 'number' ? `${Math.round(context.batteryPercent)}%` : '—',
    speed: typeof context.linearVelocity === 'number' ? `${context.linearVelocity.toFixed(2)} m/s` : '—',
    progressPercent: allSteps.length ? Math.round(completed / allSteps.length * 100) : 0,
    completedAt: detail.completedAt || undefined, currentStop: String(context.currentStop || ''),
    stopsCount: stopsList.length, routeText: `${source} ➔ ${destination}`,
    payloadSummary: `${detail.containers.length} Container(s)`, containers, stopsList,
  };
}

export function isUncertainCommandError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && (status === 0 || status >= 500);
}

export function isStopStateInFlight(state?: string | null): boolean {
  return state === 'REQUESTED' || state === 'ACCEPTED';
}

export function stopStatePresentation(state?: string | null): { label: string; tone: SemanticTone } {
  switch (state) {
    case 'STOPPED_VERIFIED':
      return { label: 'Robot Stopped (Verified)', tone: 'success' };
    case 'REQUESTED':
      return { label: 'Stop Requested', tone: 'warning' };
    case 'ACCEPTED':
      return { label: 'Stop Accepted · Stopping', tone: 'warning' };
    case 'REJECTED':
      return { label: 'Stop Rejected', tone: 'danger' };
    case 'UNKNOWN':
      return { label: 'Stop State Unknown', tone: 'danger' };
    default:
      return { label: 'No Stop Recorded', tone: 'neutral' };
  }
}

export interface IssueReceipt {
  id: string;
  code: string;
  status: string;
  version?: number;
  evidence?: IssueEvidenceDto[];
}

export interface IssueAndPauseOutcome {
  issue: IssueReceipt;
  pausedJob: JobDetailResponse | null;
  pauseError: unknown;
  pauseUncertain: boolean;
}

/**
 * Keeps an already-created Issue ticket when Pause fails or times out so retrying
 * only calls Pause and never creates a duplicate Issue.
 */
export async function submitIssueAndOptionalPause(options: {
  existingIssue?: IssueReceipt | null;
  createIssue: () => Promise<IssueReceipt>;
  pauseJob?: () => Promise<JobDetailResponse>;
}): Promise<IssueAndPauseOutcome> {
  const issue = options.existingIssue ?? await options.createIssue();
  if (!options.pauseJob) {
    return { issue, pausedJob: null, pauseError: null, pauseUncertain: false };
  }
  try {
    const pausedJob = await options.pauseJob();
    return { issue, pausedJob, pauseError: null, pauseUncertain: false };
  } catch (pauseError) {
    return {
      issue,
      pausedJob: null,
      pauseError,
      pauseUncertain: isUncertainCommandError(pauseError),
    };
  }
}
