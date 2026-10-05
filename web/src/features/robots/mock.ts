import type { RobotView } from '@/shared/api/contracts'

const WAREHOUSE_ID = 'c0000000-0000-4000-8000-000000000001'
const PUBLISHED_MAP_ID = 'a1000000-0000-4000-8000-000000000007'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// Poses are in metres on a 50 x 50 m map (see DEFAULT_MAP_BOUNDS), y pointing up.
export const ROBOTS: RobotView[] = [
  {
    id: '0d7f3b60-0000-4000-8000-000000000001',
    warehouseId: WAREHOUSE_ID,
    currentMapVersionId: PUBLISHED_MAP_ID,
    code: 'RBT-001',
    name: 'AMR 01',
    status: 'EXECUTING',
    batteryPercent: 84,
    poseX: 24,
    poseY: 42,
    poseYaw: 135,
    lastHeartbeatAt: minutesAgo(0),
    isEnabled: true,
    activity: {
      jobNo: 'JOB-20260903-0001',
      jobStatus: 'RUNNING',
      requestCode: 'REQ-20260903-000419',
      progressPercent: 92,
      routeLabel: 'A-12-03 → Dock 3',
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
      payloadLabel: 'CTN-20260903-000118',
      connectionLabel: 'WSS · 16 ms',
      eStopReleased: true,
      zone: { name: 'ZONE C — JUNCTION', heldSeconds: 52 },
    },
  },
  {
    id: '0d7f3b60-0000-4000-8000-000000000002',
    warehouseId: WAREHOUSE_ID,
    currentMapVersionId: PUBLISHED_MAP_ID,
    code: 'RBT-002',
    name: 'AMR 02',
    status: 'EXECUTING',
    batteryPercent: 71,
    poseX: 34.5,
    poseY: 26,
    poseYaw: 90,
    lastHeartbeatAt: minutesAgo(0),
    isEnabled: true,
    activity: {
      jobNo: 'JOB-20260903-0002',
      jobStatus: 'RUNNING',
      requestCode: 'REQ-20260903-000420',
      progressPercent: 64,
      routeLabel: 'confirmation 08:02',
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
      payloadLabel: 'CTN-20260903-000121',
      connectionLabel: 'WSS · 21 ms',
      eStopReleased: true,
    },
  },
  {
    id: '0d7f3b60-0000-4000-8000-000000000003',
    warehouseId: WAREHOUSE_ID,
    currentMapVersionId: PUBLISHED_MAP_ID,
    code: 'RBT-003',
    name: 'AMR 03',
    status: 'ERROR',
    batteryPercent: 71,
    poseX: 26,
    poseY: 24,
    poseYaw: 0,
    lastHeartbeatAt: minutesAgo(1),
    isEnabled: true,
    activity: {
      jobNo: 'JOB-20260903-0008',
      jobStatus: 'FAILED',
      requestCode: 'REQ-20260903-000421',
      progressPercent: 38,
      routeLabel: 'Rack A-09 → Quality-01',
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
      payloadLabel: '12 boxes · 34 kg',
      connectionLabel: 'WSS · 18 ms',
      eStopReleased: true,
      navigationState: 'Blocked',
      zone: { name: 'ZONE C — JUNC', heldSeconds: 45, heldByRobotCode: 'RBT-001', queueAfter: 1 },
      error: {
        title: 'Blocked — navigation failed',
        message: 'Robot stopped safely in Zone C, waiting for an administrator decision',
      },
    },
  },
  {
    id: '0d7f3b60-0000-4000-8000-000000000004',
    warehouseId: WAREHOUSE_ID,
    currentMapVersionId: PUBLISHED_MAP_ID,
    code: 'RBT-004',
    name: 'AMR 04',
    status: 'AVAILABLE',
    batteryPercent: 96,
    poseX: 37,
    poseY: 11.5,
    poseYaw: 0,
    lastHeartbeatAt: minutesAgo(0),
    isEnabled: true,
    activity: null,
    telemetry: { model: 'Hiwonder RRC', firmware: 'fw 1.4.2', connectionLabel: 'WSS · 14 ms', eStopReleased: true },
  },
]

// TODO(backend): shift statistics and the live-map label have no endpoint yet.
export const SHIFT_STATS = {
  window: '14:00–22:00',
  completed: 184,
  active: 2,
  failedPercent: 0.0,
}

export const LIVE_MAP_LABEL = 'Live › map v7 : latest'
