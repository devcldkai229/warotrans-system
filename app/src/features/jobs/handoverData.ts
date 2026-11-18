import type { HumanConfirmationOutputs, JobStatus, JobStepResponse } from '../../shared/types/contracts';

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
