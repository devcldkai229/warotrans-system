import type { JobStatus, JobStepStatus, MapStatus, RobotStatus } from '@/shared/api/contracts'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'grey'

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  CREATED: 'grey',
  QUEUED: 'grey',
  ASSIGNED: 'blue',
  RUNNING: 'blue',
  PAUSED: 'purple',
  REASSIGNING: 'amber',
  RECOVERY_REQUIRED: 'red',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const STEP_STATUS_TONE: Record<JobStepStatus, Tone> = {
  PENDING: 'grey',
  READY: 'grey',
  EXECUTING: 'blue',
  WAITING: 'amber',
  PAUSED: 'purple',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const ROBOT_STATUS_TONE: Record<RobotStatus, Tone> = {
  OFFLINE: 'grey',
  AVAILABLE: 'green',
  RESERVED: 'blue',
  EXECUTING: 'green',
  PAUSED: 'amber',
  CHARGING: 'blue',
  MAINTENANCE: 'purple',
  ERROR: 'red',
}

export const MAP_STATUS_TONE: Record<MapStatus, Tone> = {
  DRAFT: 'blue',
  PUBLISHED: 'green',
  ARCHIVED: 'grey',
}
