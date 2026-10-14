import type { EndpointType } from '@/shared/api/contracts'

/** Endpoint types selectable in Endpoint/Map mode (not location-backed STORAGE). */
export const DIRECT_ENDPOINT_TYPES = new Set<EndpointType | string>([
  'INBOUND',
  'OUTBOUND',
  'PARKING',
  'TRANSIT',
  'INSPECTION',
  'CHARGING',
  'MAINTENANCE',
  'RECOVERY',
])
