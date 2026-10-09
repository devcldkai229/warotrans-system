import type {
  DispatchDecision,
  InputBinding,
  JobAction,
  JobStatus,
  JobStep,
  JobStepStatus,
  JobTask,
  JobTaskStatus,
  JobView,
  RobotStatus,
} from '@/shared/api/contracts'

const MAP_VERSION_ID = 'a1000000-0000-4000-8000-000000000007'
const WORKFLOW_ID = 'f0000000-0000-4000-8000-000000000001'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

type StepStatuses = [JobStepStatus, JobStepStatus, JobStepStatus, JobStepStatus]

const BINDINGS: Record<string, Record<string, InputBinding>> = {
  MOVE_TO_RECEIVING: {
    targetEndpointId: { sourceType: 'CURRENT_MOVEMENT', path: 'source.endpointId' },
    purpose: { sourceType: 'CONSTANT', path: 'PICKUP' },
    speedProfile: { sourceType: 'WORKFLOW_VAR', path: 'speedProfile' },
  },
  PICKUP_CONFIRM: {
    containerId: { sourceType: 'CURRENT_MOVEMENT', path: 'containerId' },
    endpointId: { sourceType: 'CURRENT_MOVEMENT', path: 'source.endpointId' },
  },
  MOVE_TO_STORAGE: {
    targetEndpointId: { sourceType: 'CURRENT_MOVEMENT', path: 'destination.endpointId' },
    purpose: { sourceType: 'CONSTANT', path: 'DROPOFF' },
  },
  DROPOFF_CONFIRM: {
    endpointId: { sourceType: 'CURRENT_MOVEMENT', path: 'destination.endpointId' },
    containerId: { sourceType: 'STEP_OUTPUT', path: 'PICKUP_CONFIRM.confirmedContainerId' },
  },
}

function buildStep(
  jobKey: string,
  sequenceNo: number,
  stepKey: string,
  stepType: JobStep['stepType'],
  status: JobStepStatus,
  container: string,
): JobStep {
  const resolved: Record<string, Record<string, unknown>> = {
    MOVE_TO_RECEIVING: { targetEndpointId: 'EP-INBOUND-01', purpose: 'PICKUP', speedProfile: 'NORMAL' },
    PICKUP_CONFIRM: { containerId: container, endpointId: 'EP-INBOUND-01' },
    MOVE_TO_STORAGE: { targetEndpointId: 'EP-STORAGE-A', purpose: 'DROPOFF' },
    DROPOFF_CONFIRM: { endpointId: 'EP-STORAGE-A', containerId: container },
  }
  const isDone = status === 'COMPLETED'
  return {
    id: `${jobKey}-step-${sequenceNo}`,
    jobTaskId: `${jobKey}-task-1`,
    workflowStepId: `wfstep-${sequenceNo}`,
    sequenceNo,
    stepType,
    status,
    resolvedInputs: status === 'PENDING' ? {} : resolved[stepKey],
    outputValues: stepKey === 'PICKUP_CONFIRM' && isDone ? { confirmedContainerId: container } : {},
    targetEndpointId: null,
    startedAt: status === 'PENDING' || status === 'READY' ? null : minutesAgo(6),
    completedAt: isDone ? minutesAgo(3) : null,
    errorCode: status === 'FAILED' ? 'NAVIGATION_BLOCKED' : null,
    errorMessage: status === 'FAILED' ? 'Robot could not reach the target Endpoint' : null,
    stepKey,
    name: stepKey,
    inputBindings: BINDINGS[stepKey],
    ...(status === 'WAITING' ? { waitingSince: minutesAgo(2.25), maxWaitSeconds: 300 } : {}),
  }
}

function buildTask(jobKey: string, container: string, statuses: StepStatuses): JobTask {
  const [s1, s2, s3, s4] = statuses
  const taskStatus: JobTaskStatus =
    s4 === 'COMPLETED' ? 'COMPLETED' : s1 === 'PENDING' || s1 === 'READY' ? 'PENDING' : statuses.includes('FAILED') ? 'FAILED' : 'RUNNING'
  return {
    id: `${jobKey}-task-1`,
    jobId: jobKey,
    workflowTaskId: 'wftask-1',
    sequenceNo: 1,
    status: taskStatus,
    startedAt: taskStatus === 'PENDING' ? null : minutesAgo(7),
    completedAt: taskStatus === 'COMPLETED' ? minutesAgo(1) : null,
    failureCode: taskStatus === 'FAILED' ? 'STEP_FAILED' : null,
    taskKey: 'RECEIVE_AND_PUTAWAY',
    name: 'RECEIVE_AND_PUTAWAY',
    steps: [
      buildStep(jobKey, 1, 'MOVE_TO_RECEIVING', 'MOVE', s1, container),
      buildStep(jobKey, 2, 'PICKUP_CONFIRM', 'HUMAN_INTERACTION', s2, container),
      buildStep(jobKey, 3, 'MOVE_TO_STORAGE', 'MOVE', s3, container),
      buildStep(jobKey, 4, 'DROPOFF_CONFIRM', 'HUMAN_INTERACTION', s4, container),
    ],
  }
}

function actionsFor(status: JobStatus, hasWaitingStep: boolean): JobAction[] {
  // Mock of the proposed `availableActions` API field; the real list comes from the backend per user and Job.
  if (status === 'RUNNING') return hasWaitingStep ? ['PAUSE', 'CANCEL', 'REMOTE_CONFIRM', 'SKIP_ENDPOINT'] : ['PAUSE', 'CANCEL']
  if (status === 'PAUSED' || status === 'ASSIGNED' || status === 'QUEUED') return ['CANCEL']
  return []
}

interface JobSeed {
  no: string
  status: JobStatus
  robot: { code: string; batteryPercent: number; status: RobotStatus } | null
  route: string
  container: { barcode: string; productLabel: string }
  steps: StepStatuses
  startedMinutesAgo: number | null
  createdMinutesAgo: number
}

function buildJob(seed: JobSeed): JobView {
  const key = `5a1e0000-0000-4000-8000-${seed.no.slice(-4).padStart(12, '0')}`
  const task = buildTask(key, seed.container.barcode, seed.steps)
  const finished = seed.status === 'COMPLETED' || seed.status === 'FAILED' || seed.status === 'CANCELLED'
  return {
    id: key,
    jobNo: `JOB-20260903-${seed.no.slice(-4)}`,
    transportRequestId: `req-${seed.no}`,
    workflowId: WORKFLOW_ID,
    mapVersionId: MAP_VERSION_ID,
    status: seed.status,
    createdAt: minutesAgo(seed.createdMinutesAgo),
    queuedAt: seed.status === 'CREATED' ? null : minutesAgo(seed.createdMinutesAgo - 0.2),
    startedAt: seed.startedMinutesAgo === null ? null : minutesAgo(seed.startedMinutesAgo),
    completedAt: finished ? minutesAgo(1) : null,
    failureCode: seed.status === 'FAILED' ? 'STEP_FAILED' : null,
    failureMessage: seed.status === 'FAILED' ? 'Robot could not reach the target Endpoint' : null,
    tasks: [task],
    assignedRobot: seed.robot,
    container: seed.container,
    routeLabel: seed.route,
    originLabel: 'Ch-02',
    destinationLabel: 'QA Optical',
    availableActions: actionsFor(seed.status, task.steps.some((step) => step.status === 'WAITING')),
  }
}

const ROBOT_001 = { code: 'RBT-001', batteryPercent: 84, status: 'EXECUTING' as const }
const ROBOT_002 = { code: 'RBT-002', batteryPercent: 71, status: 'EXECUTING' as const }

export const JOBS: JobView[] = [
  buildJob({
    no: '0001',
    status: 'RUNNING',
    robot: ROBOT_001,
    route: 'Charger-B → Line A-03',
    container: { barcode: 'CTN-20260903-000118', productLabel: 'Carton Boxes (SKU 8821)' },
    steps: ['COMPLETED', 'COMPLETED', 'COMPLETED', 'WAITING'],
    startedMinutesAgo: 6.7,
    createdMinutesAgo: 8,
  }),
  buildJob({
    no: '0002',
    status: 'RUNNING',
    robot: ROBOT_002,
    route: 'Buffer North → Quality-01',
    container: { barcode: 'CTN-20260903-000121', productLabel: 'Sensor Modules (SKU 4410)' },
    steps: ['COMPLETED', 'EXECUTING', 'PENDING', 'PENDING'],
    startedMinutesAgo: 1.8,
    createdMinutesAgo: 3,
  }),
  buildJob({
    no: '0003',
    status: 'ASSIGNED',
    robot: { code: 'RBT-004', batteryPercent: 96, status: 'RESERVED' },
    route: 'Inbound 1 → Rack A-12',
    container: { barcode: 'CTN-20260903-000125', productLabel: 'Packing Foam (SKU 1102)' },
    steps: ['READY', 'PENDING', 'PENDING', 'PENDING'],
    startedMinutesAgo: null,
    createdMinutesAgo: 2,
  }),
  buildJob({
    no: '0004',
    status: 'QUEUED',
    robot: null,
    route: 'Rack B-03 → Outbound 1',
    container: { barcode: 'CTN-20260903-000130', productLabel: 'Carton Boxes (SKU 8821)' },
    steps: ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
    startedMinutesAgo: null,
    createdMinutesAgo: 1.5,
  }),
  buildJob({
    no: '0005',
    status: 'QUEUED',
    robot: null,
    route: 'Rack C-07 → Rack A-01',
    container: { barcode: 'CTN-20260903-000133', productLabel: 'Sensor Modules (SKU 4410)' },
    steps: ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
    startedMinutesAgo: null,
    createdMinutesAgo: 1,
  }),
  buildJob({
    no: '0006',
    status: 'PAUSED',
    robot: { code: 'RBT-005', batteryPercent: 62, status: 'PAUSED' },
    route: 'Rack A-02 → Dock 3',
    container: { barcode: 'CTN-20260903-000139', productLabel: 'Carton Boxes (SKU 8821)' },
    steps: ['COMPLETED', 'PAUSED', 'PENDING', 'PENDING'],
    startedMinutesAgo: 2.5,
    createdMinutesAgo: 5,
  }),
  buildJob({
    no: '0007',
    status: 'COMPLETED',
    robot: { code: 'RBT-006', batteryPercent: 55, status: 'AVAILABLE' },
    route: 'Inbound 2 → Rack B-08',
    container: { barcode: 'CTN-20260903-000110', productLabel: 'Packing Foam (SKU 1102)' },
    steps: ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED'],
    startedMinutesAgo: 20,
    createdMinutesAgo: 22,
  }),
  buildJob({
    no: '0008',
    status: 'FAILED',
    robot: { code: 'RBT-003', batteryPercent: 71, status: 'ERROR' },
    route: 'Rack A-09 → Quality-01',
    container: { barcode: 'CTN-20260903-000112', productLabel: 'Sensor Modules (SKU 4410)' },
    steps: ['COMPLETED', 'COMPLETED', 'FAILED', 'PENDING'],
    startedMinutesAgo: 12,
    createdMinutesAgo: 14,
  }),
]

/** DispatchDecision per Job id. TODO(backend): candidateEvaluations JSON shape is not finalized. */
export const DISPATCH_DECISIONS: Record<string, DispatchDecision> = {
  [JOBS[0].id]: {
    id: 'dd-0001',
    jobId: JOBS[0].id,
    robotId: '0d7f3b60-0000-4000-8000-000000000001',
    type: 'SELECTED',
    createdAt: minutesAgo(7),
    candidates: [
      { robotCode: 'RBT-001', batteryPercent: 84, status: 'AVAILABLE', selected: true },
      { robotCode: 'RBT-002', batteryPercent: 71, status: 'AVAILABLE', selected: false },
      { robotCode: 'RBT-004', batteryPercent: 96, status: 'RESERVED', selected: false },
    ],
  },
}

// TODO(backend): live-map label and cursor coordinates are client/realtime values with no endpoint.
export const JOBS_MAP = {
  coordinates: { x: 8.02, y: 9.42 },
  mapLabel: 'Live Map: v2.8 (Production Main)',
  scheduler: 'OPTIMAL_v2.4',
}
