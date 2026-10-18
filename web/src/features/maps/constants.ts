import type { EdgeDirection, EndpointType, ZoneType } from '@/shared/api/contracts'

export interface EndpointTemplate {
  type: EndpointType
  title: string
  description: string
}

/** One entry per backend EndpointType; the labels/descriptions are UI copy. */
export const ENDPOINT_TEMPLATES: EndpointTemplate[] = [
  { type: 'WAYPOINT', title: 'Waypoint', description: 'Intermediate path point or general destination' },
  { type: 'CHARGER', title: 'Charger', description: 'Charging dock for Robots' },
  { type: 'PARK', title: 'Park', description: 'Waiting / parking position for idle Robots' },
]

export interface ZoneTemplate {
  type: ZoneType
  title: string
  description: string
}

/** One entry per backend ZoneType (rules/05). */
export const ZONE_TEMPLATES: ZoneTemplate[] = [
  { type: 'KEEP_OUT', title: 'Keep-out', description: 'Robots must not enter this area' },
  { type: 'SPEED', title: 'Speed zone', description: 'Area with a required speed limit' },
  { type: 'NO_STOP', title: 'No-stop', description: 'Robots must not stop in this area' },
  { type: 'SINGLE_OCCUPANCY', title: 'Single-occupancy', description: 'Only one Robot may occupy this area' },
]

export interface EdgeTemplate {
  direction: EdgeDirection
  title: string
  description: string
}

/** One entry per backend EdgeDirection (rules/05). */
export const EDGE_TEMPLATES: EdgeTemplate[] = [
  { direction: 'ONE_WAY', title: 'One-way edge', description: 'Path Robots may travel in one direction only' },
  { direction: 'BIDIRECTIONAL', title: 'Two-way edge', description: 'Path Robots may travel in both directions' },
]
