import type { AssignmentEndReason, RobotJobHistoryItem, RobotStateEvent, RobotView } from '@/shared/api/contracts'

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
      routeLabel: 'Rack A-12-03 → Dock 3',
      containers: [{ barcode: 'CTN-20260903-000118', status: 'ONBOARD' }],
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
      connectionLabel: 'WSS · 16 ms',
      eStopReleased: true,
      zone: { name: 'Zone C — Junction', heldSeconds: 52 },
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
      routeLabel: 'Buffer North → Quality-01',
      containers: [{ barcode: 'CTN-20260903-000121', status: 'ONBOARD' }],
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
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
      jobStatus: 'RECOVERY_REQUIRED',
      requestCode: 'REQ-20260903-000421',
      progressPercent: 38,
      routeLabel: 'Rack A-09 → Quality-01',
      containers: [{ barcode: 'CTN-20260903-000112', status: 'ONBOARD' }],
    },
    telemetry: {
      model: 'Hiwonder RRC',
      firmware: 'fw 1.4.2',
      connectionLabel: 'WSS · 18 ms',
      eStopReleased: true,
      navigationState: 'Blocked',
      zone: { name: 'Zone C — Junction', heldSeconds: 45, heldByRobotCode: 'RBT-001', queueAfter: 1 },
      error: {
        title: 'Blocked — navigation failed',
        message: 'Robot stopped safely in Zone C, waiting for administrator confirmation',
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

// TODO(backend): the live-map label has no endpoint yet.
export const LIVE_MAP_LABEL = 'Live › map v7 : latest'

// TODO(backend): fleet.robot_state_events has no read endpoint yet. Newest first.
const event = (
  robot: number,
  minutes: number,
  fromStatus: RobotStateEvent['fromStatus'],
  toStatus: RobotStateEvent['toStatus'],
  source: RobotStateEvent['source'],
  reason: string | null = null,
): RobotStateEvent => ({
  id: `0e7f3b60-0000-4000-8000-0000000${robot}${String(minutes).padStart(5, '0')}`,
  robotId: `0d7f3b60-0000-4000-8000-00000000000${robot}`,
  jobId: null,
  fromStatus,
  toStatus,
  reason,
  source,
  occurredAt: minutesAgo(minutes),
})

export const ROBOT_STATE_EVENTS: RobotStateEvent[] = [
  event(1, 6, 'RESERVED', 'EXECUTING', 'ROBOT'),
  event(1, 7, 'AVAILABLE', 'RESERVED', 'DISPATCHER', 'Selected for JOB-20260903-0001'),
  event(1, 95, 'OFFLINE', 'AVAILABLE', 'HEARTBEAT'),
  event(2, 4, 'RESERVED', 'EXECUTING', 'ROBOT'),
  event(2, 5, 'AVAILABLE', 'RESERVED', 'DISPATCHER', 'Selected for JOB-20260903-0002'),
  event(3, 2, 'EXECUTING', 'ERROR', 'ROBOT', 'Navigation failed in Zone C'),
  event(3, 12, 'RESERVED', 'EXECUTING', 'ROBOT'),
  event(3, 13, 'AVAILABLE', 'RESERVED', 'DISPATCHER', 'Selected for JOB-20260903-0008'),
  event(4, 45, 'CHARGING', 'AVAILABLE', 'ROBOT', 'Charge complete'),
  event(4, 120, 'AVAILABLE', 'CHARGING', 'SYSTEM', 'Battery below threshold'),
]

// TODO(backend): JobAssignment joined with Job has no read endpoint yet. The UI shows the 5 newest per robot.
const job = (
  robot: number,
  no: number,
  assignedMinutesAgo: number,
  endedMinutesAgo: number | null,
  jobStatus: RobotJobHistoryItem['jobStatus'] = 'COMPLETED',
  endReason: AssignmentEndReason | null = endedMinutesAgo === null ? null : 'COMPLETED',
): RobotJobHistoryItem => ({
  id: `0f7f3b60-0000-4000-8000-0000000${robot}${String(no).padStart(5, '0')}`,
  robotId: `0d7f3b60-0000-4000-8000-00000000000${robot}`,
  jobNo: `JOB-20260903-${String(no).padStart(4, '0')}`,
  requestCode: `REQ-20260903-${String(no + 418).padStart(6, '0')}`,
  jobStatus,
  assignmentStatus: endedMinutesAgo === null ? 'ACTIVE' : 'ENDED',
  assignedAt: minutesAgo(assignedMinutesAgo),
  endedAt: endedMinutesAgo === null ? null : minutesAgo(endedMinutesAgo),
  endReason,
})

export const ROBOT_JOB_HISTORY: RobotJobHistoryItem[] = [
  job(1, 1, 8, null, 'RUNNING'),
  job(1, 90, 40, 28),
  job(1, 89, 75, 52),
  job(1, 88, 120, 96),
  job(1, 87, 170, 141),
  job(1, 86, 230, 190),
  job(2, 2, 6, null, 'RUNNING'),
  job(2, 85, 55, 34),
  job(2, 84, 100, 71),
  job(3, 8, 14, null, 'RECOVERY_REQUIRED'),
  job(3, 83, 60, 38),
  job(3, 82, 110, 80),
  job(3, 81, 160, 131),
  job(3, 80, 210, 175),
  job(4, 3, 3, null, 'ASSIGNED'),
  job(4, 79, 70, 44),
  job(4, 78, 130, 102),
]
