import type { ContainerStatus, JobContainerStatus, JobStatus, TransportRequestDetailStatus, TransportRequestStatus, JobStepStatus, MapStatus, RobotStatus } from '@/shared/api/contracts'

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

export const JOB_CONTAINER_STATUS_TONE: Record<JobContainerStatus, Tone> = {
  PENDING: 'grey',
  ASSIGNED: 'blue',
  ONBOARD: 'blue',
  DELIVERED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const REQUEST_STATUS_TONE: Record<TransportRequestStatus, Tone> = {
  SUBMITTED: 'grey',
  QUEUED: 'grey',
  IN_PROGRESS: 'blue',
  PARTIALLY_COMPLETED: 'amber',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
  REJECTED: 'red',
}

export const REQUEST_DETAIL_STATUS_TONE: Record<TransportRequestDetailStatus, Tone> = {
  PENDING: 'grey',
  QUEUED: 'grey',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'grey',
}

export const CONTAINER_STATUS_TONE: Record<ContainerStatus, Tone> = {
  CREATED: 'grey',
  PACKED: 'blue',
  RESERVED: 'purple',
  IN_TRANSIT: 'blue',
  STORED: 'green',
  HOLD: 'amber',
  EMPTY: 'grey',
  OUT_OF_SERVICE: 'red',
}
