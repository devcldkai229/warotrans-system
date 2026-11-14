import type { CSSProperties } from 'react'
import type { EdgeDirection, EndpointType, Point, RobotStatus, ZoneType } from '@/shared/api/contracts'
import { DEFAULT_MAP_BOUNDS, type MapBounds } from '@/shared/lib/mapView'
import { t } from '@/shared/i18n'
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
/** The path a robot took (movement history). */
export const MAP_TRAIL = 'var(--color-teal)'
/** An endpoint that is a storage location (a shelf). */
export const MAP_STORAGE = 'var(--color-teal)'
/** The floor, the body of a marker or label chip, and the halo that keeps a label readable over walls and lanes. */
export const MAP_PAPER = 'var(--color-container)'
export const MAP_CARD = 'var(--color-surface)'
export const MAP_HALO = 'var(--color-container)'
/** Walls are black on a white floor in the occupancy image; the dark theme flips it to light walls on a dark floor. */
export const MAP_IMAGE_FILTER = 'var(--map-image-filter)'

export const ZONE_LABEL: Record<ZoneType, string> = {
  KEEP_OUT: t('Keep-out'),
  SPEED: t('Speed zone'),
  NO_STOP: t('No-stop'),
  SINGLE_OCCUPANCY: t('Single-occupancy'),
  JUNCTION: t('Junction'),
}

// Lane network blue (edges / legacy JUNCTION). Zone palette is independent.
export const LANE_BLUE = '#3279f9'

/**
 * Zone map colours (Map Editor + Fleet Monitor):
 * KEEP_OUT — red + diagonal hatch; SPEED — yellow; NO_STOP — sky blue; SINGLE_OCCUPANCY — purple.
 * JUNCTION — muted blue (legacy only; not drawn for new maps).
 */
export const ZONE_COLOR: Record<ZoneType, string> = {
  KEEP_OUT: '#c62828',
  SPEED: '#f9a825',
  NO_STOP: '#039be5',
  SINGLE_OCCUPANCY: '#8e24aa',
  JUNCTION: '#5c6bc0',
}

/** Fill strength — slightly stronger so zones read clearly on the occupancy image. */
export const ZONE_FILL_OPACITY: Record<ZoneType, number> = {
  KEEP_OUT: 0.2,
  SPEED: 0.24,
  NO_STOP: 0.24,
  SINGLE_OCCUPANCY: 0.26,
  JUNCTION: 0.18,
}

/** Lane band and chevron strength (monitor map and Map Editor). */
export const LANE_BAND_OPACITY = 0.22
export const LANE_CHEVRON_OPACITY = 0.8

/**
 * Endpoint colours:
 * WAYPOINT — black; CHARGER — green; PARK — deep orange (distinct from zone yellow/red/sky/purple).
 */
export const ENDPOINT_COLOR: Record<EndpointType, string> = {
  WAYPOINT: '#121317',
  CHARGER: '#2e7d32',
  PARK: '#ef6c00',
}

export const ENDPOINT_NAME: Record<EndpointType, string> = {
  WAYPOINT: t('Waypoint'),
  CHARGER: t('Charger'),
  PARK: t('Park'),
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
        ? `repeating-linear-gradient(45deg, ${color}88 0 3px, transparent 3px 6px)`
        : `${color}55`,
  }
}

/** Position of a map point as CSS percentages inside the map square (for HTML overlays). */
export function toPercent(point: Point, bounds: MapBounds = DEFAULT_MAP_BOUNDS) {
  return {
    left: `${((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100}%`,
    top: `${(1 - (point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100}%`,
  }
}
