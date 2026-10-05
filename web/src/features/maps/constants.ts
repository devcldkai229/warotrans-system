import type { EndpointType, ZoneType } from '@/shared/api/contracts'

export interface EndpointTemplate {
  type: EndpointType
  title: string
  description: string
}

/** One entry per backend EndpointType; the labels/descriptions are UI copy. */
export const ENDPOINT_TEMPLATES: EndpointTemplate[] = [
  { type: 'CHARGING', title: 'Charging', description: 'Marks the location of a charging dock' },
  { type: 'STORAGE', title: 'Storage', description: 'Marks a storage position such as a shelf row' },
  { type: 'INBOUND', title: 'Inbound', description: 'Receiving point where Containers enter the warehouse' },
  { type: 'OUTBOUND', title: 'Outbound', description: 'Dispatch point where Containers leave the warehouse' },
  { type: 'PARKING', title: 'Parking', description: 'Waiting position for idle Robots' },
  { type: 'MAINTENANCE', title: 'Maintenance', description: 'Service point for Robot maintenance' },
  { type: 'INSPECTION', title: 'Inspection', description: 'Quality inspection transfer point' },
  { type: 'RECOVERY', title: 'Recovery', description: 'Safe point for payload recovery transfers' },
  { type: 'TRANSIT', title: 'Transit', description: 'Intermediate routing point' },
]

export interface ZoneTemplate {
  type: ZoneType
  title: string
  description: string
}

/** One entry per backend ZoneType (rules/05). */
export const ZONE_TEMPLATES: ZoneTemplate[] = [
  { type: 'INTERSECTION', title: 'Intersection', description: 'Junction where Robots must coordinate right of way' },
  { type: 'NARROW_AREA', title: 'Narrow area', description: 'Corridor that fits a limited number of Robots' },
  { type: 'OPERATIONAL_AREA', title: 'Operational area', description: 'Area with its own speed and capacity rules' },
  { type: 'RESTRICTED_AREA', title: 'Restricted area', description: 'Robots must not enter this area' },
]
