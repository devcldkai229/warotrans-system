import { apiFetch, getAccessToken, getApiUrl } from './client'
import type { Robot, RobotStatus } from './contracts'

export interface ListRobotsParams {
  warehouseId?: string
  status?: RobotStatus
  isEnabled?: boolean
  search?: string
  skip?: number
  take?: number
}

export interface ListRobotsResponse {
  items: Robot[]
  total: number
}

export interface RegisterRobotRequest {
  warehouseId: string
  currentMapVersionId: string
  code: string
  name: string
}

export function listRobots(params: ListRobotsParams = {}) {
  const query = new URLSearchParams()
  if (params.warehouseId) query.set('warehouseId', params.warehouseId)
  if (params.status) query.set('status', params.status)
  if (params.isEnabled !== undefined) query.set('isEnabled', String(params.isEnabled))
  if (params.search) query.set('search', params.search)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.take !== undefined) query.set('take', String(params.take))
  const qs = query.toString()
  return apiFetch<ListRobotsResponse>(`/api/fleet/robots${qs ? `?${qs}` : ''}`)
}

export function getRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}`)
}

export function registerRobot(body: RegisterRobotRequest) {
  return apiFetch<Robot>('/api/fleet/robots', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function enableRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}/enable`, { method: 'POST' })
}

export function disableRobot(id: string) {
  return apiFetch<Robot>(`/api/fleet/robots/${id}/disable`, { method: 'POST' })
}

export interface RobotCommandIssued {
  commandId: string
  robotId: string
  robotCode: string
  status: string
}

/** Nav2 goal to any pose on the robot's map (metres, yaw in radians). Nav2 plans the path. */
export function navigateRobot(id: string, pose: { x: number; y: number; yaw: number }) {
  return apiFetch<RobotCommandIssued>(`/api/fleet/robots/${id}/commands/navigate`, {
    method: 'POST',
    body: JSON.stringify({ ...pose, frameId: 'map' }),
  })
}

/** Cancels the robot's in-flight navigate command (or `targetCommandId`). */
export function cancelRobotCommand(id: string, targetCommandId?: string) {
  return apiFetch<RobotCommandIssued>(`/api/fleet/robots/${id}/commands/cancel`, {
    method: 'POST',
    body: JSON.stringify({ targetCommandId: targetCommandId ?? null }),
  })
}

/**
 * Manual drive setpoint: linear m/s (+ forward), angular rad/s (+ left). `{0, 0}` stops.
 * Repeat while a direction is held; the robot stops by itself ~0.5 s after the last one.
 */
export function teleopRobot(id: string, linear: number, angular: number, assist = true) {
  return apiFetch<{ robotId: string; robotCode: string; linear: number; angular: number }>(
    `/api/fleet/robots/${id}/teleop`,
    { method: 'POST', body: JSON.stringify({ linear, angular, assist }) },
  )
}

/**
 * MJPEG camera stream of the robot, relayed by the backend, for an `<img src>`.
 * An `<img>` cannot send the Authorization header, so the access token goes in the query (as for SignalR).
 * `nonce` forces a fresh connection on retry.
 */
export function robotCameraStreamUrl(id: string, nonce?: number) {
  const query = new URLSearchParams()
  const token = getAccessToken()
  if (token) query.set('access_token', token)
  if (nonce !== undefined) query.set('n', String(nonce))
  return `${getApiUrl()}/api/fleet/robots/${id}/camera/stream?${query}`
}

/** Authoritative SegmentedTrafficCoordinator snapshot (Admin). */
export interface TrafficRobotView {
  robotId: string
  phase: string
  x?: number | null
  y?: number | null
  localizationOk: boolean
  occupiedResourceIds: string[]
  authority?: { authorityId: string; edgeIds: number[]; graphHash: string; seq: number; epoch: number } | null
  waitingReason: string
  quarantineReason?: string | null
  jobStepId?: string | null
}

export interface TrafficResourceView {
  resourceId: string
  kind: string
  capacity: number
  holders: string[]
  waiters: string[]
  queueLength: number
}

export interface TrafficSnapshot {
  epoch: number
  stateVersion: number
  phase: string
  robots: TrafficRobotView[]
  resources: TrafficResourceView[]
  waits: { robotId: string; resourceId: string; reason: string; blockingOwner?: string | null }[]
  recentEvents: string[]
}

export function getTrafficSnapshot() {
  return apiFetch<TrafficSnapshot>('/api/fleet/traffic/snapshot')
}

/** Operator clearance after physical verification — audited on backend. */
export function releaseTrafficAfterClearance(robotId: string, operatorId: string, resourceIds?: string[]) {
  return apiFetch(`/api/fleet/traffic/robots/${robotId}/release-after-clearance`, {
    method: 'POST',
    body: JSON.stringify({ operatorId, resourceIds: resourceIds ?? null }),
  })
}
