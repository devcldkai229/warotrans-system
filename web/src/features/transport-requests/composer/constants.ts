import type { EndpointType } from '@/shared/api/contracts'

/** Endpoint types selectable in Endpoint/Map mode (CHARGER is fleet-only). */
export const DIRECT_ENDPOINT_TYPES = new Set<EndpointType | string>(['WAYPOINT', 'PARK'])
