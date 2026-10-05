import type { JobStatus } from '@/shared/api/contracts'

/** Display order of the Job status groups. Only backend JobStatus values — no UI-invented states. */
export const JOB_STATUS_GROUPS: JobStatus[] = [
  'RUNNING',
  'ASSIGNED',
  'QUEUED',
  'PAUSED',
  'REASSIGNING',
  'RECOVERY_REQUIRED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'CREATED',
]
