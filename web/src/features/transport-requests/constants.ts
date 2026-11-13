import type { TransportRequestStatus } from '@/shared/api/contracts'

/** Display order of the Request status groups. Only backend TransportRequestStatus values. */
export const REQUEST_STATUS_GROUPS: TransportRequestStatus[] = [
  'CANCELLING',
  'IN_PROGRESS',
  'QUEUED',
  'SUBMITTED',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REJECTED',
]

/** Backend RobotLoad.MaxContainers: the most a robot carries at once (one trip). */
export const MAX_CONTAINERS_PER_TRIP = 3
