import type {
  JobStatus,
  TransportRequestDetailStatus,
  TransportRequestStatus,
  TransportRequestView,
} from '@/shared/api/contracts'

const WAREHOUSE_ID = 'c0000000-0000-4000-8000-000000000001'
const STAFF_ID = 'a0000000-0000-4000-8000-000000000002'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

type Line = [container: string, source: string, destination: string, status: TransportRequestDetailStatus]
type JobRef = [jobNo: number, status: JobStatus, robotCode: string | null]

interface Seed {
  no: number
  status: TransportRequestStatus
  workflow: string
  submittedMinutesAgo: number
  completedMinutesAgo?: number
  note?: string
  failureMessage?: string
  lines: Line[]
  jobs: JobRef[]
}

function build(seed: Seed): TransportRequestView {
  const id = `7a000000-0000-4000-8000-${String(seed.no).padStart(12, '0')}`
  const isQueuedOrLater = seed.status !== 'SUBMITTED' && seed.status !== 'REJECTED'
  return {
    id,
    requestCode: `REQ-20260903-${String(seed.no).padStart(6, '0')}`,
    warehouseId: WAREHOUSE_ID,
    workflowId: 'f0000000-0000-4000-8000-000000000001',
    requestedBy: STAFF_ID,
    status: seed.status,
    note: seed.note ?? null,
    submittedAt: minutesAgo(seed.submittedMinutesAgo),
    queuedAt: isQueuedOrLater ? minutesAgo(seed.submittedMinutesAgo - 1) : null,
    completedAt: seed.completedMinutesAgo === undefined ? null : minutesAgo(seed.completedMinutesAgo),
    failureCode: seed.failureMessage ? 'REQUEST_REJECTED' : null,
    failureMessage: seed.failureMessage ?? null,
    workflowName: seed.workflow,
    requestedByName: 'Warehouse Staff',
    details: seed.lines.map(([containerBarcode, sourceLabel, destinationLabel, status], index) => ({
      id: `${id}-d${index + 1}`,
      transportRequestId: id,
      sequenceNo: index + 1,
      containerId: `c1000000-0000-4000-8000-${containerBarcode.slice(-12)}`,
      sourceStorageLocationId: null,
      sourceEndpointId: `ep-${sourceLabel}`,
      sourceLevelNo: 1,
      destinationStorageLocationId: null,
      destinationEndpointId: `ep-${destinationLabel}`,
      destinationLevelNo: 1,
      status,
      containerBarcode,
      sourceLabel,
      destinationLabel,
    })),
    jobs: seed.jobs.map(([no, status, robotCode]) => ({
      jobNo: `JOB-20260903-${String(no).padStart(4, '0')}`,
      status,
      robotCode,
    })),
    availableActions: ['SUBMITTED', 'QUEUED', 'IN_PROGRESS'].includes(seed.status) ? ['CANCEL'] : [],
  }
}

const P2P = 'Point-to-point transport'

// TODO(backend): Transportation has no read endpoint yet. Jobs 0001-0008 match the Job mock so they open Job Detail.
export const TRANSPORT_REQUESTS: TransportRequestView[] = [
  build({
    no: 419, status: 'IN_PROGRESS', workflow: P2P, submittedMinutesAgo: 95,
    lines: [['CTN-20260903-000118', 'Rack A-12-03', 'Dock 3', 'IN_PROGRESS']],
    jobs: [[1, 'RUNNING', 'RBT-001']],
  }),
  build({
    no: 420, status: 'IN_PROGRESS', workflow: P2P, submittedMinutesAgo: 80,
    lines: [['CTN-20260903-000121', 'Buffer North', 'Quality-01', 'IN_PROGRESS']],
    jobs: [[2, 'RUNNING', 'RBT-002']],
  }),
  build({
    no: 421, status: 'IN_PROGRESS', workflow: P2P, submittedMinutesAgo: 40,
    note: 'Sensor modules for QA batch 7',
    lines: [
      ['CTN-20260903-000112', 'Rack A-09', 'Quality-01', 'IN_PROGRESS'],
      ['CTN-20260903-000113', 'Rack A-09', 'Quality-01', 'QUEUED'],
    ],
    jobs: [[8, 'RECOVERY_REQUIRED', 'RBT-003']],
  }),
  build({
    no: 422, status: 'IN_PROGRESS', workflow: 'Receiving putaway', submittedMinutesAgo: 25,
    lines: [['CTN-20260903-000125', 'Inbound 1', 'Rack A-12', 'IN_PROGRESS']],
    jobs: [[3, 'ASSIGNED', 'RBT-004']],
  }),
  build({
    no: 423, status: 'IN_PROGRESS', workflow: P2P, submittedMinutesAgo: 70,
    lines: [['CTN-20260903-000139', 'Rack A-02', 'Dock 3', 'IN_PROGRESS']],
    jobs: [[6, 'PAUSED', 'RBT-005']],
  }),
  build({
    no: 424, status: 'QUEUED', workflow: 'Replenishment', submittedMinutesAgo: 12,
    lines: [
      ['CTN-20260903-000130', 'Rack B-03', 'Outbound 1', 'QUEUED'],
      ['CTN-20260903-000131', 'Rack B-03', 'Outbound 1', 'QUEUED'],
      ['CTN-20260903-000132', 'Rack B-04', 'Outbound 1', 'QUEUED'],
    ],
    jobs: [[4, 'QUEUED', null]],
  }),
  build({
    no: 425, status: 'QUEUED', workflow: P2P, submittedMinutesAgo: 9,
    lines: [['CTN-20260903-000133', 'Rack C-07', 'Rack A-01', 'QUEUED']],
    jobs: [[5, 'QUEUED', null]],
  }),
  build({
    no: 426, status: 'SUBMITTED', workflow: P2P, submittedMinutesAgo: 2,
    lines: [['CTN-20260903-000140', 'Inbound 3', 'Rack D-02', 'PENDING']],
    jobs: [],
  }),
  build({
    no: 418, status: 'COMPLETED', workflow: 'Receiving putaway', submittedMinutesAgo: 150, completedMinutesAgo: 118,
    lines: [['CTN-20260903-000110', 'Inbound 2', 'Rack B-08', 'COMPLETED']],
    jobs: [[7, 'COMPLETED', 'RBT-006']],
  }),
  build({
    no: 417, status: 'PARTIALLY_COMPLETED', workflow: 'Replenishment', submittedMinutesAgo: 210, completedMinutesAgo: 160,
    lines: [
      ['CTN-20260903-000100', 'Rack C-01', 'Pick Face 2', 'COMPLETED'],
      ['CTN-20260903-000101', 'Rack C-01', 'Pick Face 2', 'COMPLETED'],
      ['CTN-20260903-000102', 'Rack C-02', 'Pick Face 3', 'FAILED'],
    ],
    jobs: [[11, 'COMPLETED', 'RBT-002'], [12, 'FAILED', 'RBT-001']],
  }),
  build({
    no: 415, status: 'CANCELLED', workflow: P2P, submittedMinutesAgo: 260, completedMinutesAgo: 255,
    lines: [['CTN-20260903-000090', 'Rack A-05', 'Dock 1', 'CANCELLED']],
    jobs: [],
  }),
  build({
    no: 414, status: 'REJECTED', workflow: P2P, submittedMinutesAgo: 300, completedMinutesAgo: 300,
    failureMessage: 'Container CTN-20260903-000085 is on HOLD and cannot be transported.',
    lines: [['CTN-20260903-000085', 'Rack A-01', 'Dock 2', 'PENDING']],
    jobs: [],
  }),
]
