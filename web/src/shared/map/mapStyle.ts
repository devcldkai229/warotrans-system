import type { CSSProperties } from 'react'
import type { EdgeDirection, EndpointType, Point, RobotStatus, ZoneType } from '@/shared/api/contracts'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'

// Map paint. The map is drawn in metres inside an SVG, so its colours are SVG attributes rather than utility classes;
// the values follow the tokens in index.css.
// The neutrals follow the theme (they are CSS variables, which SVG attributes accept), so the map is light or dark
// with the rest of the console. Only the saturated status colours below are fixed.
export const MAP_INK = 'var(--color-ink)'
export const MAP_INK_2 = 'var(--color-ink-2)'
export const MAP_MUTED = 'var(--color-muted)'
export const MAP_LINE = 'var(--color-container-higher)'
export const MAP_LANE = 'var(--color-container-high)'
export const MAP_OFF = 'var(--color-container-highest)'
export const MAP_RED = 'var(--color-red)'
export const MAP_AMBER = 'var(--color-amber)'
/** The floor, the body of a marker or label chip, and the halo that keeps a label readable over walls and lanes. */
export const MAP_PAPER = 'var(--color-container)'
export const MAP_CARD = 'var(--color-surface)'
export const MAP_HALO = 'var(--color-container)'
/** Walls are black on a white floor in the occupancy image; the dark theme flips it to light walls on a dark floor. */
export const MAP_IMAGE_FILTER = 'var(--map-image-filter)'

export const ZONE_LABEL: Record<ZoneType, string> = {
  KEEP_OUT: 'Keep-out',
  SPEED: 'Speed zone',
  NO_STOP: 'No-stop',
  SINGLE_OCCUPANCY: 'Single-occupancy',
}

export const ZONE_COLOR: Record<ZoneType, string> = {
  KEEP_OUT: '#f02849',
  SPEED: '#2d88ff',
  NO_STOP: '#f7b928',
  SINGLE_OCCUPANCY: '#ec5b9a',
}

export const ENDPOINT_COLOR: Record<EndpointType, string> = {
  WAYPOINT: 'var(--color-ink-2)',
  CHARGER: 'var(--color-teal)',
  PARK: 'var(--color-muted)',
}

export const ENDPOINT_NAME: Record<EndpointType, string> = {
  WAYPOINT: 'Waypoint',
  CHARGER: 'Charger',
  PARK: 'Park',
}

export const ROBOT_COLOR: Record<RobotStatus, string> = {
  EXECUTING: '#2d88ff',
  AVAILABLE: '#45bd62',
  RESERVED: '#37b6ee',
  PAUSED: '#f7b928',
  CHARGING: '#2dc7b4',
  MAINTENANCE: '#a66cff',
  ERROR: '#f02849',
  OFFLINE: 'var(--color-muted)',
}

export const EDGE_COLOR: Record<EdgeDirection, string> = { BIDIRECTIONAL: '#2d88ff', ONE_WAY: '#a66cff' }

export const ZONE_ORDER: ZoneType[] = ['SPEED', 'NO_STOP', 'SINGLE_OCCUPANCY', 'KEEP_OUT']

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
