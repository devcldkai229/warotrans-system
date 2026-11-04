import type { EdgeDirection, EndpointType, ZoneType } from '@/shared/api/contracts'

export interface EndpointTemplate {
  type: EndpointType
  title: string
  description: string
}

/** One entry per backend EndpointType; the labels/descriptions are UI copy. */
export const ENDPOINT_TEMPLATES: EndpointTemplate[] = [
  { type: 'WAYPOINT', title: 'Waypoint', description: 'Điểm đường / điểm trung gian' },
  { type: 'CHARGER', title: 'Charger', description: 'Điểm sạc' },
  { type: 'PARK', title: 'Park', description: 'Điểm đỗ / chờ' },
]

export interface ZoneTemplate {
  type: ZoneType
  title: string
  description: string
}

/** One entry per backend ZoneType (rules/05). */
export const ZONE_TEMPLATES: ZoneTemplate[] = [
  { type: 'KEEP_OUT', title: 'Keep-out', description: 'Khu vực cấm vào (đỏ sọc chéo)' },
  { type: 'SPEED', title: 'Speed zone', description: 'Khu vực giới hạn tốc độ (vàng)' },
  { type: 'NO_STOP', title: 'No-stop', description: 'Khu vực cấm dừng (xanh da trời)' },
  { type: 'SINGLE_OCCUPANCY', title: 'Single-occupancy', description: 'Khu vực giới hạn 1 xe (tím)' },
  {
    type: 'JUNCTION',
    title: 'Junction',
    description: 'Legacy — không dùng cho map mới (màu xanh indigo nhạt)',
  },
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
