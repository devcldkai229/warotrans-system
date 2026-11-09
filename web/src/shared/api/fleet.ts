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
  authority?: {
    authorityId: string
    edgeIds: number[]
    graphHash: string
    seq: number
    epoch: number
    planRevision?: number
    semanticMapFingerprint?: string | null
    resourceIds?: string[]
  } | null
  planRevision?: number
  proposedPath?: { x: number; y: number; yaw: number }[]
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

/**
 * WEB-FLEET-06: frees every zone a robot holds, on the operator's word that they checked. The server refuses when the
 * robot can report its pose, still holds a Job or is navigating. Audited with the reason.
 */
export function releaseTrafficAfterClearance(robotId: string, body: { robotCode: string; clearanceConfirmed: boolean; reason: string }) {
  return apiFetch(`/api/fleet/traffic/robots/${robotId}/release-after-clearance`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** RB-03: REQUESTED → ACCEPTED → STOPPED_VERIFIED, or REJECTED / UNKNOWN. Never "stopped" without the robot saying so. */
export type StopStateName = 'NONE' | 'REQUESTED' | 'ACCEPTED' | 'STOPPED_VERIFIED' | 'REJECTED' | 'UNKNOWN'

export interface StopState {
  robotId: string
  state: StopStateName
  motionHeld: boolean
  commandId: string | null
  mode: 'STOP' | 'PAUSE' | null
  commandStatus: string | null
  outcome: string | null
  errorCode: string | null
  issuedAt: string | null
  completedAt: string | null
}

export function stopRobot(id: string, reason?: string, mode: 'STOP' | 'PAUSE' = 'STOP') {
  return apiFetch<StopState>(`/api/fleet/robots/${id}/commands/stop`, { method: 'POST', body: JSON.stringify({ mode, reason }) })
}

export function resumeRobot(id: string) {
  return apiFetch<StopState>(`/api/fleet/robots/${id}/commands/resume`, { method: 'POST' })
}

export function getStopState(id: string) {
  return apiFetch<StopState>(`/api/fleet/robots/${id}/stop-state`)
}

/** RB-04: exclusive manual-drive lease, 30 s, renewed while driving. */
export interface ManualLease {
  robotId: string
  active: boolean
  holderId: string | null
  holderName: string | null
  until: string | null
  heldByMe: boolean
}

export function acquireManualLease(id: string, takeover = false, reason?: string) {
  return apiFetch<ManualLease>(`/api/fleet/robots/${id}/manual/lease`, { method: 'POST', body: JSON.stringify({ takeover, reason }) })
}

export function releaseManualLease(id: string) {
  return apiFetch<void>(`/api/fleet/robots/${id}/manual/lease`, { method: 'DELETE' })
}

/** RB-08 maintenance session. */
export interface MaintenanceChecklist {
  sensorsOk: boolean
  localizationOk: boolean
  stopTestOk: boolean
  trafficClear: boolean
  notes?: string
}

export function startMaintenance(id: string, reason: string) {
  return apiFetch<unknown>(`/api/fleet/robots/${id}/maintenance/start`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function completeMaintenance(id: string, checklist: MaintenanceChecklist) {
  return apiFetch<unknown>(`/api/fleet/robots/${id}/maintenance/complete`, { method: 'POST', body: JSON.stringify(checklist) })
}

/** RB-10 diagnostics snapshot; STALE when the robot stopped reporting, UNKNOWN for what it cannot measure. */
export interface RobotHealthItem {
  name: string
  level: 'OK' | 'WARN' | 'ERROR' | 'STALE' | 'UNKNOWN'
  value: number | null
  unit: string | null
  message: string | null
  measuredAt: string | null
}

export interface RobotHealth {
  robotId: string
  robotCode: string
  overall: RobotHealthItem['level']
  receivedAt: string | null
  stale: boolean
  items: RobotHealthItem[]
}

export function getRobotHealth(id: string) {
  return apiFetch<RobotHealth>(`/api/fleet/robots/${id}/health`)
}

/** RB-09: only actions the robot announced; it must be stopped and idle; confirmRobotCode repeats the code. */
export function robotSystemAction(id: string, action: 'RESTART_STACK' | 'REBOOT' | 'SHUTDOWN', confirmRobotCode: string) {
  return apiFetch<{ commandId: string }>(`/api/fleet/robots/${id}/system-actions`, {
    method: 'POST',
    body: JSON.stringify({ action, confirmRobotCode }),
  })
}
