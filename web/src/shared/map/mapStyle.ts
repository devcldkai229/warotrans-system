import type { EdgeDirection, EndpointType, Point, RobotStatus, ZoneType } from '@/shared/api/contracts'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'

export const ZONE_LABEL: Record<ZoneType, string> = {
  INTERSECTION: 'Intersection',
  NARROW_AREA: 'Narrow area',
  OPERATIONAL_AREA: 'Operational area',
  RESTRICTED_AREA: 'Restricted area',
}

export const ENDPOINT_COLOR: Record<EndpointType, string> = {
  INBOUND: '#2563eb',
  STORAGE: '#b45309',
  OUTBOUND: '#15803d',
  PARKING: '#64748b',
  CHARGING: '#0d9488',
  MAINTENANCE: '#7c3aed',
  INSPECTION: '#4f46e5',
  RECOVERY: '#dc2626',
  TRANSIT: '#475569',
}

export const ENDPOINT_NAME: Record<EndpointType, string> = {
  INBOUND: 'Inbound',
  STORAGE: 'Storage',
  OUTBOUND: 'Outbound',
  PARKING: 'Parking',
  CHARGING: 'Charging',
  MAINTENANCE: 'Maintenance',
  INSPECTION: 'Inspection',
  RECOVERY: 'Recovery',
  TRANSIT: 'Transit',
}

export const ROBOT_COLOR: Record<RobotStatus, string> = {
  EXECUTING: '#2563eb',
  AVAILABLE: '#16a34a',
  RESERVED: '#0ea5e9',
  PAUSED: '#d97706',
  CHARGING: '#0d9488',
  MAINTENANCE: '#7c3aed',
  ERROR: '#dc2626',
  OFFLINE: '#64748b',
}

export const EDGE_COLOR: Record<EdgeDirection, string> = { BIDIRECTIONAL: '#2563eb', ONE_WAY: '#7c3aed' }

export const ZONE_ORDER: ZoneType[] = ['OPERATIONAL_AREA', 'NARROW_AREA', 'INTERSECTION', 'RESTRICTED_AREA']

/** Position of a map point as CSS percentages inside the map square (for HTML overlays). */
export function toPercent(point: Point, bounds: MapBounds = DEFAULT_MAP_BOUNDS) {
  return {
    left: `${((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
    top: `${(1 - (point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`,
  }
}
