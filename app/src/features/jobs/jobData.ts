import type { JobDetailResponse, JobStatus, JobStepResponse } from '../../shared/types/contracts';
export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}
export function getCurrentStep(job: JobDetailResponse): JobStepResponse | undefined {
  const steps = [...job.tasks].sort((a, b) => a.sequenceNo - b.sequenceNo)
    .flatMap(task => [...task.steps].sort((a, b) => a.sequenceNo - b.sequenceNo));
  if (job.currentStepId) return steps.find(step => step.id === job.currentStepId);
  return steps.find(step => step.status === 'WAITING' || step.status === 'EXECUTING')
    ?? steps.find(step => step.status === 'READY');
}
export function canConfirmHandover(job: JobDetailResponse, step = getCurrentStep(job)): boolean {
  return job.status === 'RUNNING' && step?.stepType === 'HUMAN_INTERACTION' && step.status === 'WAITING'
    && (step.operationCode === 'PICKUP_CONFIRM' || step.operationCode === 'DROPOFF_CONFIRM');
}
