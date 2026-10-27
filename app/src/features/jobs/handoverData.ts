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
