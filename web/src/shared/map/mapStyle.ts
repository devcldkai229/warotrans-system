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
  KEEP_OUT: 'Keep-out',
  SPEED: 'Speed zone',
  NO_STOP: 'No-stop',
  SINGLE_OCCUPANCY: 'Single-occupancy',
  JUNCTION: 'Junction',
}

// OTTO-like: lanes and junctions share one blue so a junction reads as part of the lane network; no-stop is red,
// single-occupancy yellow. Keep-out stays red but is always hatched, which tells it apart from no-stop.
export const LANE_BLUE = '#3279f9'

export const ZONE_COLOR: Record<ZoneType, string> = {
  KEEP_OUT: '#d93025',
  SPEED: '#8430ce',
  NO_STOP: '#e53935',
  SINGLE_OCCUPANCY: '#f9ab00',
  JUNCTION: LANE_BLUE,
}

/** Fill strength of a zone: junctions as strong as a lane band, the others a light tint. */
export const ZONE_FILL_OPACITY: Record<ZoneType, number> = {
  KEEP_OUT: 0.1,
  SPEED: 0.1,
  NO_STOP: 0.16,
  SINGLE_OCCUPANCY: 0.2,
  JUNCTION: 0.22,
}

/** Lane band and chevron strength (monitor map and Map Editor). */
export const LANE_BAND_OPACITY = 0.22
export const LANE_CHEVRON_OPACITY = 0.8

export const ENDPOINT_COLOR: Record<EndpointType, string> = {
  WAYPOINT: '#45474d',
  CHARGER: '#0f8a99',
  PARK: '#6a6a71',
}

export const ENDPOINT_NAME: Record<EndpointType, string> = {
  WAYPOINT: 'Waypoint',
  CHARGER: 'Charger',
  PARK: 'Park',
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

// Both directions are lane blue: the chevrons (one row vs. two opposite rows) tell them apart.
export const EDGE_COLOR: Record<EdgeDirection, string> = { BIDIRECTIONAL: LANE_BLUE, ONE_WAY: LANE_BLUE }

export const ZONE_ORDER: ZoneType[] = ['JUNCTION', 'SPEED', 'NO_STOP', 'SINGLE_OCCUPANCY', 'KEEP_OUT']

/** Guide swatch of a Zone type: the same tint as on the map, hatched for keep-out. */
export function zoneSwatchStyle(type: ZoneType): CSSProperties {
  const color = ZONE_COLOR[type]
  return {
    borderColor: color,
    background:
      type === 'KEEP_OUT'
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
