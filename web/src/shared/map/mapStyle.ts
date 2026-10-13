import type { CSSProperties } from 'react'
import type { EdgeDirection, EndpointType, Point, RobotStatus, ZoneType } from '@/shared/api/contracts'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'

// Map paint. The map is drawn in metres inside an SVG, so its colours are SVG attributes rather than utility classes;
// the values follow the tokens in index.css.
export const MAP_INK = '#121317'
export const MAP_INK_2 = '#45474d'
export const MAP_MUTED = '#6a6a71'
export const MAP_LINE = '#bcc5d1'
export const MAP_LANE = '#e3e8ef'
export const MAP_OFF = '#a3adb9'
export const MAP_RED = '#d93025'
export const MAP_AMBER = '#e37400'

export const ZONE_LABEL: Record<ZoneType, string> = {
  INTERSECTION: 'Intersection',
  NARROW_AREA: 'Narrow area',
  OPERATIONAL_AREA: 'Operational area',
  RESTRICTED_AREA: 'Restricted area',
}

export const ZONE_COLOR: Record<ZoneType, string> = {
  OPERATIONAL_AREA: '#3279f9',
  NARROW_AREA: '#d81b60',
  INTERSECTION: '#e37400',
  RESTRICTED_AREA: '#d93025',
}

export const ENDPOINT_COLOR: Record<EndpointType, string> = {
  INBOUND: '#3279f9',
  STORAGE: '#9a4b00',
  OUTBOUND: '#137333',
  PARKING: '#6a6a71',
  CHARGING: '#0f8a99',
  MAINTENANCE: '#8430ce',
  INSPECTION: '#4355d9',
  RECOVERY: '#d93025',
  TRANSIT: '#45474d',
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
  EXECUTING: '#3279f9',
  AVAILABLE: '#1e8e3e',
  RESERVED: '#0b9bd7',
  PAUSED: '#e37400',
  CHARGING: '#0f8a99',
  MAINTENANCE: '#8430ce',
  ERROR: '#d93025',
  OFFLINE: '#6a6a71',
}

export const EDGE_COLOR: Record<EdgeDirection, string> = { BIDIRECTIONAL: '#3279f9', ONE_WAY: '#8430ce' }

export const ZONE_ORDER: ZoneType[] = ['OPERATIONAL_AREA', 'NARROW_AREA', 'INTERSECTION', 'RESTRICTED_AREA']

/** Guide swatch of a Zone type: the same tint as on the map, hatched for a restricted area. */
export function zoneSwatchStyle(type: ZoneType): CSSProperties {
  const color = ZONE_COLOR[type]
  return {
    borderColor: color,
    background:
      type === 'RESTRICTED_AREA'
        ? `repeating-linear-gradient(45deg, ${color}47 0 2px, transparent 2px 4px)`
        : `${color}24`,
  }
}

/** Position of a map point as CSS percentages inside the map square (for HTML overlays). */
export function toPercent(point: Point, bounds: MapBounds = DEFAULT_MAP_BOUNDS) {
  return {
    left: `${((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
    top: `${(1 - (point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`,
  }
}
