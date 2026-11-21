import type {
  HandoverStopResponse, HandoverStopScan, HumanConfirmationOutputs, IssueReportResponse, JobStatus, JobStepResponse,
} from '../../shared/types/contracts';

export function humanConfirmation(step?: JobStepResponse): HumanConfirmationOutputs | null {
  if (step?.stepType !== 'HUMAN_INTERACTION' || step.status !== 'COMPLETED') return null;
  const output = step.outputValues;
  if (output?.confirmed !== true || !['STAFF_APP', 'ROBOT_BUTTON'].includes(String(output.confirmationSource))) return null;
  return {
    confirmed: true,
    confirmationSource: output.confirmationSource as HumanConfirmationOutputs['confirmationSource'],
    confirmedBy: typeof output.confirmedBy === 'string' ? output.confirmedBy : null,
    confirmedByRobotId: typeof output.confirmedByRobotId === 'string' ? output.confirmedByRobotId : null,
    confirmedAt: typeof output.confirmedAt === 'string' ? output.confirmedAt : '',
    note: typeof output.note === 'string' ? output.note : undefined,
  };
}

export function handoverStatus(step?: JobStepResponse, jobStatus?: JobStatus): { canConfirm: boolean; message: string; completed: boolean } {
  const confirmation = humanConfirmation(step);
  if (confirmation) return {
    canConfirm: false, completed: true,
    message: confirmation.confirmationSource === 'ROBOT_BUTTON' ? 'Handover Confirmed On Robot' : 'Handover Confirmed In App',
  };
  if (step?.status === 'COMPLETED') return { canConfirm: false, completed: true, message: 'Handover Completed' };
  const canConfirm = jobStatus === 'RUNNING' && step?.stepType === 'HUMAN_INTERACTION' && step.status === 'WAITING'
    && ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.operationCode);
  return { canConfirm, completed: false, message: canConfirm ? 'Waiting For Handover' : 'This Handover Is No Longer Waiting' };
}

export type ClaimState = 'mine' | 'other' | 'free';
/** WH-03: who handles this waiting step. The server enforces it; this only chooses which buttons to show. */
export function claimState(step: JobStepResponse | undefined, accountId: string | null | undefined): ClaimState {
  if (!step?.claimedBy) return 'free';
  return accountId && step.claimedBy === accountId ? 'mine' : 'other';
}

interface StepTask { contextValues?: { containerId?: string } | null; steps: JobStepResponse[] }
export interface HandoverCandidate { stepId: string; containerId: string; operation: 'PICKUP_CONFIRM' | 'DROPOFF_CONFIRM'; waiting: boolean }
/**
 * APP-OPS-02 (same rule as the web console): the open handovers of the kind now waiting at this stop. Two or more
 * make a batch confirm worthwhile; each container still gets its own result from the server.
 */
export function batchHandoverCandidates(tasks: StepTask[]): { type: 'PICKUP' | 'DROPOFF' | null; items: HandoverCandidate[] } {
  const open: HandoverCandidate[] = tasks.flatMap(task => task.steps
    .filter(step => (step.operationCode === 'PICKUP_CONFIRM' || step.operationCode === 'DROPOFF_CONFIRM')
      && (step.status === 'WAITING' || step.status === 'PENDING'))
    .map(step => {
      const fromStep = step.resolvedInputs?.containerId;
      const containerId = typeof fromStep === 'string' ? fromStep : task.contextValues?.containerId ?? '';
      return { stepId: step.id, containerId, operation: step.operationCode as HandoverCandidate['operation'], waiting: step.status === 'WAITING' };
    }));
  const current = open.find(item => item.waiting);
  if (!current) return { type: null, items: [] };
  return {
    type: current.operation === 'PICKUP_CONFIRM' ? 'PICKUP' : 'DROPOFF',
    items: open.filter(item => item.operation === current.operation && item.containerId),
  };
}

export function handoverStopOwnerState(
  stop: Pick<HandoverStopResponse, 'claimedBy'> | null | undefined,
  accountId?: string | null,
): ClaimState {
  if (!stop?.claimedBy) return 'free';
  return accountId && stop.claimedBy === accountId ? 'mine' : 'other';
}

export type HandoverStopPhase =
  | 'unclaimed_approaching'
  | 'unclaimed_ready'
  | 'claimed_approaching'
  | 'claimed_ready'
  | 'in_progress'
  | 'claimed_by_other';

export function handoverStopPhase(
  stop: Pick<HandoverStopResponse, 'claimedBy' | 'robotReadyAt' | 'beganAt'>,
  accountId?: string | null,
): HandoverStopPhase {
  const owner = handoverStopOwnerState(stop, accountId);
  if (owner === 'other') return 'claimed_by_other';
  if (owner === 'mine') {
    if (stop.beganAt) return 'in_progress';
    return stop.robotReadyAt ? 'claimed_ready' : 'claimed_approaching';
  }
  return stop.robotReadyAt ? 'unclaimed_ready' : 'unclaimed_approaching';
}

export function mergeMyJobIdsWithStops(
  jobs: { id: string; isMine: boolean; status: JobStatus }[],
  stops: Pick<HandoverStopResponse, 'jobId' | 'claimedBy'>[],
  accountId?: string | null,
): Set<string> {
  const claimedStopJobIds = new Set(
    accountId ? stops.filter(stop => stop.claimedBy === accountId).map(stop => stop.jobId) : [],
  );
  const mine = new Set<string>();
  for (const job of jobs) {
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) continue;
    if (job.isMine || claimedStopJobIds.has(job.id)) {
      mine.add(job.id);
    }
  }
  return mine;
}

export function recordStopScan(
  stop: Pick<HandoverStopResponse, 'containers'>,
  scannedByContainerId: Record<string, string>,
  rawScan: string,
): { matchedContainerId: string | null; duplicate: boolean; nextScans: Record<string, string> } {
  const code = rawScan.trim();
  if (!code) {
    return { matchedContainerId: null, duplicate: false, nextScans: scannedByContainerId };
  }
  const needle = code.toUpperCase();
  const match = stop.containers.find(
    item =>
      (item.barcode && item.barcode.trim().toUpperCase() === needle) ||
      item.containerId.trim().toUpperCase() === needle,
  );
  if (!match) {
    return { matchedContainerId: null, duplicate: false, nextScans: scannedByContainerId };
  }
  const duplicate = Boolean(scannedByContainerId[match.containerId]);
  const nextScans = {
    ...scannedByContainerId,
    [match.containerId]: (match.barcode && match.barcode.trim()) || code,
  };
  return { matchedContainerId: match.containerId, duplicate, nextScans };
}

export function stopScanProgress(
  stop: Pick<HandoverStopResponse, 'containers'>,
  scannedByContainerId: Record<string, string>,
): { total: number; scanned: number; complete: boolean; missingIds: string[]; payload: HandoverStopScan[] } {
  const payload: HandoverStopScan[] = [];
  const missingIds: string[] = [];
  for (const item of stop.containers) {
    const barcode = scannedByContainerId[item.containerId]?.trim();
    if (barcode) {
      payload.push({ containerId: item.containerId, barcode });
    } else {
      missingIds.push(item.containerId);
    }
  }
  return {
    total: stop.containers.length,
    scanned: payload.length,
    complete: stop.containers.length > 0 && missingIds.length === 0,
    missingIds,
    payload,
  };
}

export function isBlockingHandoverIssue(
  issue: Pick<IssueReportResponse, 'problemCode' | 'status'>,
): boolean {
  return (
    (issue.problemCode === 'WRONG_CONTAINER' || issue.problemCode === 'MISSING_CONTAINER') &&
    ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(issue.status)
  );
}

/**
 * M2 canonical grouped handover stops must go through HandoverStopCard (or wait for the
 * offer to open in the queue once activeHandoverStopId is set). Only non-grouped workflows
 * with neither activeHandoverStopId nor an active HandoverStop fall back to per-step handover.
 */
export function shouldUseLegacyStepHandover(
  job: { activeHandoverStopId?: string | null },
  activeStop: Pick<HandoverStopResponse, 'id'> | null | undefined,
): boolean {
  return !job.activeHandoverStopId && !activeStop;
}

export function isWaitingForHandoverOffer(
  job: { status?: JobStatus; activeHandoverStopId?: string | null },
  activeStop: Pick<HandoverStopResponse, 'id'> | null | undefined,
): boolean {
  return job.status === 'RUNNING' && Boolean(job.activeHandoverStopId) && !activeStop;
}
