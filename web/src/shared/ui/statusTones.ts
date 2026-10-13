import type { ContainerStatus, JobContainerStatus, JobStatus, TransportRequestDetailStatus, TransportRequestStatus, JobStepStatus, MapStatus, RobotStatus } from '@/shared/api/contracts'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'grey' | 'teal' | 'rose'

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  CREATED: 'grey',
  QUEUED: 'purple',
  ASSIGNED: 'blue',
  RUNNING: 'blue',
  PAUSED: 'amber',
  REASSIGNING: 'teal',
  RECOVERY_REQUIRED: 'rose',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const STEP_STATUS_TONE: Record<JobStepStatus, Tone> = {
  PENDING: 'grey',
  READY: 'teal',
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
  RESERVED: 'purple',
  EXECUTING: 'blue',
  PAUSED: 'amber',
  CHARGING: 'teal',
  MAINTENANCE: 'rose',
  ERROR: 'red',
}

export const MAP_STATUS_TONE: Record<MapStatus, Tone> = {
  DRAFT: 'amber',
  PUBLISHED: 'green',
  ARCHIVED: 'grey',
}

export const JOB_CONTAINER_STATUS_TONE: Record<JobContainerStatus, Tone> = {
  PENDING: 'grey',
  ASSIGNED: 'blue',
  ONBOARD: 'teal',
  DELIVERED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

/** Each TransportRequest status gets its own tone so group rows stay distinguishable. */
export const REQUEST_STATUS_TONE: Record<TransportRequestStatus, Tone> = {
  SUBMITTED: 'purple',
  QUEUED: 'teal',
  IN_PROGRESS: 'blue',
  PARTIALLY_COMPLETED: 'amber',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
  REJECTED: 'rose',
}

export const REQUEST_DETAIL_STATUS_TONE: Record<TransportRequestDetailStatus, Tone> = {
  PENDING: 'grey',
  QUEUED: 'teal',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const CONTAINER_STATUS_TONE: Record<ContainerStatus, Tone> = {
  CREATED: 'grey',
  PACKED: 'blue',
  RESERVED: 'purple',
  IN_TRANSIT: 'teal',
  STORED: 'green',
  HOLD: 'amber',
  EMPTY: 'grey',
  OUT_OF_SERVICE: 'red',
}

/** Solid tone, for dots and progress bars. */
export const TONE_SOLID: Record<Tone, string> = {
  green: 'bg-green',
  blue: 'bg-blue',
  amber: 'bg-amber',
  red: 'bg-red',
  purple: 'bg-purple',
  grey: 'bg-container-highest',
  teal: 'bg-teal',
  rose: 'bg-rose',
}
