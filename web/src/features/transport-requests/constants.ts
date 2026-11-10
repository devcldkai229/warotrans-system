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
