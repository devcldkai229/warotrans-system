import { apiFetch, getAccessToken, getApiUrl } from './client'
import type { Robot, RobotStateEventSource, RobotStatus } from './contracts'

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

/** FL-08: an idle, empty robot goes to the nearest free parking place. Returns the Job. */
export function returnRobotToPark(robotId: string) {
  return apiFetch<{ id: string }>(`/api/workflow-execution/robots/${robotId}/return-to-park`, { method: 'POST', body: JSON.stringify({}) })
}

/** FL-08: goes to a charger; a person connects it, there is no auto-dock. Returns the Job. */
export function sendRobotToCharger(robotId: string) {
  return apiFetch<{ id: string }>(`/api/workflow-execution/robots/${robotId}/go-to-charger`, { method: 'POST', body: JSON.stringify({}) })
}

/** FLT-02: what this robot can be asked now. An unsupported item must not be offered. */
export type RobotHistoryKind = 'STATE' | 'COMMAND'

/** One line of a robot's history: a change of state or a command, whichever happened (BOTH-02). */
export interface RobotHistoryItem {
  kind: RobotHistoryKind
  occurredAt: string
  /** STATE only. `fromStatus` is null for the first state recorded. */
  fromStatus: string | null
  toStatus: string | null
  /** STATE only: a code such as `status`, `online`, `offline`, `motion_held`, `motion_released`, comma-joined when several apply. */
  reason: string | null
  /** STATE only: where the change came from. Commands carry none. */
  source: RobotStateEventSource | null
  jobId: string | null
  /** COMMAND only. */
  commandId: string | null
  commandType: string | null
  commandStatus: string | null
  commandOutcome: string | null
  jobStepId: string | null
  /** STATE only: what was true of the robot then. Null on lines written before this was kept, and on commands. */
  details: RobotHistoryDetails | null
}

/** The battery and the error the robot reported when the state was recorded. A battery nobody measured is null, never 0. */
export interface RobotHistoryDetails {
  batteryPercent?: number | null
  errorCode?: string | null
}

export interface RobotHistoryQuery {
  kind?: RobotHistoryKind
  /** Only state changes have a source, so a source leaves commands out. */
  source?: RobotStateEventSource
  /** ISO times, both ends inclusive. */
  from?: string
  to?: string
  skip?: number
  take?: number
}

export interface RobotHistoryResponse {
  items: RobotHistoryItem[]
  /** Everything the filters match, not only this page. */
  total: number
  skip: number
  take: number
}

/** Needs robot.read, and for a Technician the robot must be in their scope. Newest first. */
export function getRobotHistory(robotId: string, params: RobotHistoryQuery = {}) {
  const query = new URLSearchParams()
  if (params.kind) query.set('kind', params.kind)
  if (params.source) query.set('source', params.source)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.take !== undefined) query.set('take', String(params.take))
  const qs = query.toString()
  return apiFetch<RobotHistoryResponse>(`/api/fleet/robots/${robotId}/state-history${qs ? `?${qs}` : ''}`)
}

/** One stored point of a robot's movement history (FE-09). Metres and radians, map frame. */
export interface RobotPosePoint {
  at: string
  x: number
  y: number
  yaw: number
  linearVelocity: number | null
  angularVelocity: number | null
  mapVersionCode: string | null
  jobId: string | null
  commandId: string | null
}

export interface RobotPoseHistory {
  robotId: string
  from: string | null
  to: string | null
  jobId: string | null
  /** Points the filters match; `points` holds at most `limit` of them. */
  total: number
  /** More matched than the limit: every n-th point is returned, first and last kept. */
  downsampled: boolean
  /** Measured over every matching point, not only the returned ones. */
  distanceMeters: number
  /** Older points have been deleted. */
  keptSince: string
  points: RobotPosePoint[]
}

export interface RobotPoseHistoryQuery {
  /** ISO times. Without a Job the server defaults to the last hour and allows at most 7 days. */
  from?: string
  to?: string
  /** The whole run of that Job. */
  jobId?: string
  limit?: number
}

/** FE-09 / FE-19: where a robot went, oldest point first. Needs robot.read, and for a Technician a robot in scope. */
export function getRobotPoseHistory(robotId: string, params: RobotPoseHistoryQuery = {}) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.jobId) query.set('jobId', params.jobId)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiFetch<RobotPoseHistory>(`/api/fleet/robots/${robotId}/pose-history${qs ? `?${qs}` : ''}`)
}

export interface RobotCommandCatalogItem {
  code: 'STOP' | 'PAUSE' | 'RESUME' | 'MANUAL_DRIVE' | 'RESTART_STACK' | 'REBOOT' | 'SHUTDOWN' | 'LOCALIZE' | 'DOCK' | 'CHARGE'
  supported: boolean
  reason: string | null
  permission: string
  ackTimeoutSeconds: number | null
  resultTimeoutSeconds: number | null
  acknowledgement: 'ACK_AND_RESULT' | 'STATE_FROM_TELEMETRY' | 'LEASE' | 'NONE'
}

export function getRobotCommandCatalog(robotId: string) {
  return apiFetch<{ items: RobotCommandCatalogItem[] }>(`/api/fleet/robots/${robotId}/commands/catalog`)
}

/** FL-03: what a robot may carry and its size. A field left null means not known. */
export function setRobotCapacity(
  robotId: string,
  body: { maxPayloadKg: number | null; maxContainers: number | null; lengthM: number | null; widthM: number | null },
) {
  return apiFetch(`/api/fleet/robots/${robotId}/capacity`, { method: 'PUT', body: JSON.stringify(body) })
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

/** The robot sets its pose estimate to this endpoint of its map (where it was placed). Watch localizationStatus. */
export function localizeRobot(id: string, endpointId: string) {
  return apiFetch<{ commandId: string }>(`/api/fleet/robots/${id}/commands/localize`, {
    method: 'POST',
    body: JSON.stringify({ endpointId }),
  })
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
