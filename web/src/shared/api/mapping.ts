import { apiFetch } from './client'

/** Map building from the web (Configure → Facility → Build map). */

export type MappingSessionStatus = 'STARTING' | 'MAPPING' | 'SAVING' | 'CANCELLING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'

export interface MappingRobot {
  id: string
  code: string
  name: string
  isOnline: boolean
  status: string
  available: boolean
  /** Why it cannot map now: robot_offline, robot_busy, robot_motion_held, robot_manual_mode, mapping_session_open … */
  reasons: string[]
  openSessionId: string | null
}

export interface MappingSession {
  id: string
  warehouseId: string
  robotId: string
  robotCode: string
  status: MappingSessionStatus
  mapName: string | null
  startedByName: string | null
  startedAt: string
  mappingSince: string | null
  endedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  resultMapVersionId: string | null
  resultMapVersionCode: string | null
  knownAreaM2: number | null
  mapWidth: number | null
  mapHeight: number | null
  robotPath: string | null
  robotOnline: boolean
  robotReportedMap: string | null
  leaseHeldByMe: boolean
}

export interface MappingPose {
  x: number
  y: number
  yaw: number
}

/** Downsampled occupancy grid: rows bottom-up (ROS order), 0..100 occupied probability, 255 unknown; zlib + base64. */
export interface MappingGridMessage {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  originYaw: number
  fullWidth: number
  fullHeight: number
  knownAreaM2: number
  encoding: string
  cells: string
}

export interface MappingPreview {
  sessionId: string
  seq: number
  pose: MappingPose | null
  map: MappingGridMessage | null
  robotState: string | null
  elapsedSec: number | null
  receivedAt: string | null
  mapReceivedAt: string | null
}

export const OPEN_MAPPING_STATUSES: MappingSessionStatus[] = ['STARTING', 'MAPPING', 'SAVING', 'CANCELLING']

export const isOpenMappingSession = (status: MappingSessionStatus) => OPEN_MAPPING_STATUSES.includes(status)

export function listMappingRobots(warehouseId: string) {
  return apiFetch<MappingRobot[]>(`/api/fleet/mapping/robots?warehouseId=${encodeURIComponent(warehouseId)}`)
}

export function listMappingSessions(warehouseId: string, openOnly = true) {
  return apiFetch<MappingSession[]>(
    `/api/fleet/mapping/sessions?warehouseId=${encodeURIComponent(warehouseId)}&open=${openOnly ? 'true' : 'false'}`,
  )
}

export function startMappingSession(robotId: string) {
  return apiFetch<MappingSession>('/api/fleet/mapping/sessions', { method: 'POST', body: JSON.stringify({ robotId }) })
}

export function getMappingSession(id: string) {
  return apiFetch<MappingSession>(`/api/fleet/mapping/sessions/${id}`)
}

export function getMappingPreview(id: string) {
  return apiFetch<MappingPreview>(`/api/fleet/mapping/sessions/${id}/preview`)
}

export function finishMappingSession(id: string, name: string) {
  return apiFetch<MappingSession>(`/api/fleet/mapping/sessions/${id}/finish`, {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() || null }),
  })
}

export function cancelMappingSession(id: string) {
  return apiFetch<MappingSession>(`/api/fleet/mapping/sessions/${id}/cancel`, { method: 'POST' })
}
