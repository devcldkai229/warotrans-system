import { useEffect, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { getApiUrl, getFreshAccessToken } from '@/shared/api/client'

/** Server → client messages of /hubs/notifications (backend NotificationsHub). */
export interface RobotTelemetryMessage {
  robotId: string
  robotCode: string
  poseX: number
  poseY: number
  poseYaw: number
  batteryPercent: number | null
  navigationStatus: string | null
  localizationStatus: string | null
  lastTelemetryAt: string | null
  /** m/s and rad/s from the robot's odometry (null on older backends / before the first telemetry). */
  linearVelocity?: number | null
  angularVelocity?: number | null
}

export interface JobUpdatedMessage {
  jobId: string
  kind: 'job' | 'step'
  status: string
  jobStepId?: string
  stepKey?: string
  jobNo?: string
}

/** A new item for the admin notification bell (pushed to admins only). */
export interface NotificationCreatedMessage {
  id: string
  type: 'INFO' | 'WARNING' | 'ALERT' | 'ASSIGNMENT' | 'SYSTEM'
  kind: string
  title: string
  content: string
  entityType: string | null
  entityId: string | null
  createdAt: string
}

/** RTM-02: a TransportRequest moved (a Detail changed, it was re-aggregated, cancelled or rejected). Refetch it. */
export interface TransportRequestUpdatedMessage {
  transportRequestId: string
  kind: 'request' | 'detail' | 'cancelled' | 'rejected'
  requestCode: string
  status: string
  containerId?: string | null
  detailStatus?: string | null
  occurredAt: string
}

/** RTM-02: a traffic decision for a robot (grant, wait, block, quarantine …). Refetch the traffic snapshot. */
export interface TrafficUpdatedMessage {
  eventType: string
  robotId: string | null
  jobId: string | null
  resourceId: string | null
  reason: string | null
  occurredAt: string
}

export interface HubHandlers {
  robotTelemetryUpdated?: (message: RobotTelemetryMessage) => void
  jobUpdated?: (message: JobUpdatedMessage) => void
  transportRequestUpdated?: (message: TransportRequestUpdatedMessage) => void
  trafficUpdated?: (message: TrafficUpdatedMessage) => void
  notificationCreated?: (message: NotificationCreatedMessage) => void
}

// One shared connection for the whole app; pages only add/remove handlers.
let connection: HubConnection | null = null
let starting: Promise<void> | null = null
let subscribers = 0
let restartTimer: ReturnType<typeof setTimeout> | undefined

const RESTART_DELAY_MS = 2_000

function getConnection(): HubConnection {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl(`${getApiUrl()}/hubs/notifications`, {
        // Browsers cannot send an Authorization header on WebSockets: the backend reads ?access_token=.
        // Refreshed first when it is about to expire, so a (re)connect never starts with a dead token.
        accessTokenFactory: async () => (await getFreshAccessToken()) ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()
    // The server closes the connection when its access token expires (RTM-01); that close is not retried by
    // withAutomaticReconnect, so start again with a fresh token while some page still listens.
    connection.onclose(() => scheduleRestart())
  }
  return connection
}

function scheduleRestart() {
  if (subscribers === 0 || restartTimer !== undefined) return
  restartTimer = setTimeout(() => {
    restartTimer = undefined
    if (subscribers === 0) return
    ensureStarted().catch(() => scheduleRestart())
  }, RESTART_DELAY_MS)
}

function ensureStarted(): Promise<void> {
  const hub = getConnection()
  if (hub.state !== HubConnectionState.Disconnected) return starting ?? Promise.resolve()
  if (!starting) {
    starting = hub.start().finally(() => {
      starting = null
    })
  }
  return starting
}

/**
 * Subscribes to realtime pushes. Returns whether the hub is connected, so pages can fall back to polling.
 * Handlers should be stable (useCallback) or the subscription is renewed on every render.
 */
export function useNotificationsHub(handlers: HubHandlers): boolean {
  const [connected, setConnected] = useState(false)
  const { robotTelemetryUpdated, jobUpdated, notificationCreated, transportRequestUpdated, trafficUpdated } = handlers

  useEffect(() => {
    const hub = getConnection()
    let cancelled = false
    subscribers += 1
    if (robotTelemetryUpdated) hub.on('robotTelemetryUpdated', robotTelemetryUpdated)
    if (jobUpdated) hub.on('jobUpdated', jobUpdated)
    if (notificationCreated) hub.on('notificationCreated', notificationCreated)
    if (transportRequestUpdated) hub.on('transportRequestUpdated', transportRequestUpdated)
    if (trafficUpdated) hub.on('trafficUpdated', trafficUpdated)

    const sync = () => !cancelled && setConnected(hub.state === HubConnectionState.Connected)
    hub.onreconnected(sync)
    hub.onreconnecting(sync)
    hub.onclose(sync)
    ensureStarted().then(sync, () => sync())

    return () => {
      cancelled = true
      subscribers -= 1
      if (robotTelemetryUpdated) hub.off('robotTelemetryUpdated', robotTelemetryUpdated)
      if (jobUpdated) hub.off('jobUpdated', jobUpdated)
      if (notificationCreated) hub.off('notificationCreated', notificationCreated)
      if (transportRequestUpdated) hub.off('transportRequestUpdated', transportRequestUpdated)
      if (trafficUpdated) hub.off('trafficUpdated', trafficUpdated)
    }
  }, [robotTelemetryUpdated, jobUpdated, notificationCreated, transportRequestUpdated, trafficUpdated])

  return connected
}
