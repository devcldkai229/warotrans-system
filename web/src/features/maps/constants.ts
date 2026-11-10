import type { EdgeDirection, EndpointType, ZoneType } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
export interface EndpointTemplate {

  type: EndpointType
  title: string
  description: string
}

/** One entry per backend EndpointType; the labels/descriptions are UI copy. */
export const ENDPOINT_TEMPLATES: EndpointTemplate[] = [
  { type: 'WAYPOINT', title: t('Waypoint'), description: t('Waypoint / intermediate point') },
  { type: 'CHARGER', title: t('Charger'), description: t('Charging point') },
  { type: 'PARK', title: t('Park'), description: t('Parking / waiting point') },
]

export interface ZoneTemplate {
  type: ZoneType
  title: string
  description: string
}

/** One entry per backend ZoneType (rules/05). */
export const ZONE_TEMPLATES: ZoneTemplate[] = [
  { type: 'KEEP_OUT', title: t('Keep-out'), description: t('No-entry area (red diagonal stripes)') },
  { type: 'SPEED', title: t('Speed zone'), description: t('Speed-limited area (yellow)') },
  { type: 'NO_STOP', title: t('No-stop'), description: t('No-stopping area (sky blue)') },
  { type: 'SINGLE_OCCUPANCY', title: t('Single-occupancy'), description: t('Single-vehicle area (purple)') },
  {
    type: 'JUNCTION',
    title: t('Junction'),
    description: t('Legacy: not used for new maps (light indigo)'),
  },
]

export interface EdgeTemplate {
  direction: EdgeDirection
  title: string
  description: string
}

/** One entry per backend EdgeDirection (rules/05). */
export const EDGE_TEMPLATES: EdgeTemplate[] = [
  { direction: 'ONE_WAY', title: t('One-way edge'), description: t('Path Robots may travel in one direction only') },
  { direction: 'BIDIRECTIONAL', title: t('Two-way edge'), description: t('Path Robots may travel in both directions') },
]
