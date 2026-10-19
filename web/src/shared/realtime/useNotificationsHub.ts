import { useEffect, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { getAccessToken, getApiUrl } from '@/shared/api/client'

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

export interface RobotConnectivityMessage {
  robotId: string
  robotCode: string
  isOnline: boolean
  status: string
  lastHeartbeatAt: string | null
}

export interface JobUpdatedMessage {
  jobId: string
  kind: 'job' | 'step'
  status: string
  jobStepId?: string
  stepKey?: string
  jobNo?: string
}

export interface HubHandlers {
  robotTelemetryUpdated?: (message: RobotTelemetryMessage) => void
  robotConnectivityChanged?: (message: RobotConnectivityMessage) => void
  jobUpdated?: (message: JobUpdatedMessage) => void
}

// One shared connection for the whole app; pages only add/remove handlers.
let connection: HubConnection | null = null
let starting: Promise<void> | null = null

function getConnection(): HubConnection {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl(`${getApiUrl()}/hubs/notifications`, {
        // Browsers cannot send an Authorization header on WebSockets: the backend reads ?access_token=.
        accessTokenFactory: () => getAccessToken() ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()
  }
  return connection
}

function ensureStarted(): Promise<void> {
  const hub = getConnection()
  if (hub.state === HubConnectionState.Connected) return Promise.resolve()
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
  const { robotTelemetryUpdated, robotConnectivityChanged, jobUpdated } = handlers

  useEffect(() => {
    const hub = getConnection()
    let cancelled = false
    if (robotTelemetryUpdated) hub.on('robotTelemetryUpdated', robotTelemetryUpdated)
    if (robotConnectivityChanged) hub.on('robotConnectivityChanged', robotConnectivityChanged)
    if (jobUpdated) hub.on('jobUpdated', jobUpdated)

    const sync = () => !cancelled && setConnected(hub.state === HubConnectionState.Connected)
    hub.onreconnected(sync)
    hub.onreconnecting(sync)
    hub.onclose(sync)
    ensureStarted().then(sync, () => sync())

    return () => {
      cancelled = true
      if (robotTelemetryUpdated) hub.off('robotTelemetryUpdated', robotTelemetryUpdated)
      if (robotConnectivityChanged) hub.off('robotConnectivityChanged', robotConnectivityChanged)
      if (jobUpdated) hub.off('jobUpdated', jobUpdated)
    }
  }, [robotTelemetryUpdated, robotConnectivityChanged, jobUpdated])

  return connected
}
