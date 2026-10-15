import { ContainerSlot, JobDetailResponse, JobStatus, JobStepSummary, JobSummary, WorkflowCode } from '../../shared/types/contracts';
import { SemanticTone } from '../../shared/theme/colors';

export interface JobStopStep {
  type: string;
  label: string;
  status: 'done' | 'waiting' | 'running' | 'future';
  timeRemaining?: string;
}

export interface JobStopItem {
  id: number;
  name: string;
  description: string;
  state: 'done' | 'active' | 'future';
  current?: boolean;
  steps?: JobStopStep[];
}

export interface JobContainerItem {
  code: string;
  slot: string;
  action: 'UNLOAD' | 'KEEP ONBOARD' | 'PICKUP' | 'DELIVERED';
  location: string;
  product: string;
  qty: number;
}

export interface AppJobItem extends JobSummary {
  target: string;
  route: string;
  robot: string;
  isMine: boolean;
  battery: string;
  speed: string;
  distanceRemaining?: string;
  progressPercent?: number;
  completedAt?: string;
  duration?: string;
  operator?: string;
  currentStop: string;
  stopsCount: number;
  routeText: string;
  payloadSummary: string;
  containers: JobContainerItem[];
  stopsList: JobStopItem[];
}

/**
 * Lifecycle predicates, derived from the backend's `JobStatus`.
 *
 * There used to be a second, parallel lifecycle axis on this fixture — a
 * `kind` of `waiting | transit | complete | queued` — and every screen switched
 * on it. Two axes describing the same state is one too many: the Home screen
 * read `45 pcs` off one job while the Jobs screen read `12` off another, and
 * nothing in the type system noticed. The domain enum is now the only one.
 */
const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

/** The job is over: it will not change state again, so it belongs in History. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface JobStatusPresentation {
  /** What the operator reads on the chip. */
  label: string;
  /**
   * Passed explicitly rather than derived, because "does this need me?" is an
   * operator decision, not a property of the enum. An `ASSIGNED` job maps to
   * `info` in the shared `StatusPill` table — correct for a robot picking up
   * work on its own, wrong for a card where a human is the next actor.
   */
  tone: SemanticTone;
}

/**
 * How every `JobStatus` is presented, in one table, for every screen.
 *
 * This used to live inside `JobCard`, which meant the Transport hub kept its own
 * hand-written badge copy — "ALLOCATING AMR" on a job the Jobs list calls
 * *Waiting Handover*, "EN ROUTE" on one it calls *Running*. Two screens, one
 * state, two vocabularies: exactly the defect the `kind` removal existed to
 * kill. One table, imported by whoever has to name a status.
 */
export const JOB_STATUS_PRESENTATION: Record<JobStatus, JobStatusPresentation> = {
  CREATED: { label: 'Created', tone: 'neutral' },
  QUEUED: { label: 'Queued', tone: 'neutral' },
  // Robot parked, human next. Warning, not info: this card is waiting on *you*.
  ASSIGNED: { label: 'Waiting Handover', tone: 'warning' },
  RUNNING: { label: 'Running', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  REASSIGNING: { label: 'Reassigning', tone: 'warning' },
  RECOVERY_REQUIRED: { label: 'Needs Recovery', tone: 'danger' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * Open jobs assigned to the signed-in operator.
 *
 * Exported so the bottom bar's count badge and the Jobs screen's "My Tasks (n)"
 * read the *same* definition. They used to disagree — the badge was hardcoded
 * to `1` while the screen counted four — which on a mission-critical handheld
 * is worse than showing nothing at all.
 */
export function countMyActiveJobs(): number {
  return MOCK_JOBS.filter((job) => job.isMine && !isTerminalJobStatus(job.status)).length;
}

/**
 * Transforms a Backend JobDetailResponse into an AppJobItem presentation model.
 */
export function mapJobDetailToAppJobItem(detail: JobDetailResponse): AppJobItem {
  const robotCode = (detail.contextValues?.assignedRobotCode as string) || 'AMR-01';
  const sourceCode = (detail.contextValues?.sourceEndpointCode as string) || 'Dock 01';
  const destCode = (detail.contextValues?.destinationEndpointCode as string) || 'Storage Rack A-02';

  const containers: JobContainerItem[] = detail.containers.map((c, idx) => ({
    code: c.containerId,
    slot: `Bay ${c.sequenceNo || idx + 1}`,
    action: c.status === 'DELIVERED' ? 'DELIVERED' : c.status === 'ONBOARD' ? 'KEEP ONBOARD' : 'PICKUP',
    location: destCode,
    product: 'Warehouse Tote',
    qty: 1,
  }));

  const steps: JobStepSummary[] = detail.tasks.flatMap((t) =>
    t.steps.map((s) => ({
      sequenceNo: s.sequenceNo,
      type: s.stepType,
      title: s.workflowStepKey || s.operationCode,
      description: s.operationCode,
      status: s.status,
      targetEndpointCode: s.targetEndpointId || undefined,
    }))
  );

  return {
    id: detail.id,
    jobNo: detail.jobNo,
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway',
    status: detail.status,
    assignedRobotCode: robotCode,
    sourceEndpointCode: sourceCode,
    destinationEndpointCode: destCode,
    containerCount: detail.containers.length,
    slots: [],
    steps,
    createdAtUtc: detail.createdAt,
    target: destCode,
    route: `${sourceCode} ➔ ${destCode}`,
    robot: robotCode,
    isMine: detail.status === 'ASSIGNED' || detail.status === 'RUNNING',
    battery: '85%',
    speed: detail.status === 'RUNNING' ? '0.8 m/s' : '0.0 m/s',
    currentStop: sourceCode,
    stopsCount: 2,
    routeText: `${sourceCode} ➔ ${destCode}`,
    payloadSummary: `${detail.containers.length} Totes (${detail.containers.map((c) => c.containerId).join(', ')})`,
    containers,
    stopsList: [
      { id: 1, name: sourceCode, description: 'Pickup Container', state: 'done' },
      { id: 2, name: destCode, description: 'Dropoff Container', state: 'active' },
    ],
  };
}

export const MOCK_JOBS: AppJobItem[] = [
  {
    id: 'JOB-2026-0812',
    jobNo: 'JOB-2026-0812',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway (Multi-Drop)',
    status: 'ASSIGNED',
    target: 'Rack A · Level 2 · Bin 03',
    route: 'Dock 01 ➔ Rack A-02 ➔ Rack B-04',
    robot: 'AMR-01',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '3 Containers (BOX-101, BOX-102, BOX-103)',
    stopsCount: 3,
    currentStop: 'Stop 2/3: Rack A-02',
    isMine: true,
    battery: '85%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m (At Station)',
    progressPercent: 100,
    sourceEndpointCode: 'Dock 01',
    destinationEndpointCode: 'Rack A · Level 2 · Bin 03',
    activeStepTitle: 'AMR docked. Waiting for operator unload verification',
    containerCount: 3,
    routeText: 'Dock 01 ➔ Rack A-02 ➔ Rack B-04',
    createdAtUtc: new Date(Date.now() - 10 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-101',
        productName: 'Electronic Components',
        quantity: 12,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-102',
        productName: 'Microcontroller Modules',
        quantity: 8,
        action: 'KEEP_ONBOARD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        containerBarcode: 'BOX-103',
        productName: 'Wiring Harness Bundles',
        quantity: 20,
        action: 'KEEP_ONBOARD',
      },
    ],
    containers: [
      {
        code: 'BOX-101',
        slot: 'Slot 1 (Front)',
        action: 'UNLOAD',
        location: 'Rack A · Level 2 · Bin 03',
        product: 'Electronic Components',
        qty: 12,
      },
      {
        code: 'BOX-102',
        slot: 'Slot 2 (Mid)',
        action: 'KEEP ONBOARD',
        location: 'Rack B · Level 1 · Bin 01 (Stop 3)',
        product: 'Microcontroller Modules',
        qty: 8,
      },
      {
        code: 'BOX-103',
        slot: 'Slot 3 (Rear)',
        action: 'KEEP ONBOARD',
        location: 'Outbound Dock Out 01 (Stop 4)',
        product: 'Wiring Harness Bundles',
        qty: 20,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'CHECK',
        title: 'Payload Pre-Check',
        description: 'Verify container latch & weight limit at Dock 01',
        status: 'COMPLETED',
        targetEndpointCode: 'Dock 01',
      },
      {
        sequenceNo: 2,
        type: 'MOVE',
        title: 'Transit to Zone A',
        description: 'Autonomous navigation along Main Transit Corridor',
        status: 'COMPLETED',
        targetEndpointCode: 'Rack A-02',
      },
      {
        sequenceNo: 3,
        type: 'HUMAN_INTERACTION',
        title: 'Operator Handover & Verification',
        description: 'Confirm physical placement of BOX-101 into Rack A · Level 2 · Bin 03',
        status: 'WAITING',
        targetEndpointCode: 'Rack A-02',
        timeRemainingSeconds: 285,
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Receiving Dock 01',
        description: 'Batch Pickup: Loaded 3 Totes (BOX-101, 102, 103) · Completed at 09:32',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Rack A-02',
        description: 'Unload TOTE BOX-101 into Rack A (Level 2 · Bin 03)',
        state: 'active',
        current: true,
        steps: [
          {
            type: 'MOVE',
            label: 'MOVE: Arrived at Rack A-02 Endpoint (Nav2 Succeeded)',
            status: 'done',
          },
          {
            type: 'HUMAN_INTERACTION',
            label: 'HUMAN_INTERACTION: Awaiting Staff Unload of BOX-101',
            status: 'waiting',
            timeRemaining: '04:45 remaining',
          },
          {
            type: 'CHECK',
            label: 'CHECK: Verify Barcode & Rack Alignment',
            status: 'future',
          },
        ],
      },
      {
        id: 3,
        name: 'STOP 3: Rack B-04 (Storage Zone B)',
        description: 'Unload TOTE BOX-102 & Retrieve empty tote BOX-055',
        state: 'future',
      },
      {
        id: 4,
        name: 'STOP 4: Autonomous Return to Charging Depot',
        description: 'Multi-stop transport tour completed, auto dock',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0813',
    jobNo: 'JOB-2026-0813',
    workflowCode: 'OUTBOUND_RETRIEVAL',
    workflowName: 'Outbound Retrieval Tour',
    status: 'RUNNING',
    target: 'Outbound Dock Out 01',
    route: 'Rack B-04 ➔ Dock Out 01',
    robot: 'AMR-02',
    assignedRobotCode: 'AMR-02',
    payloadSummary: '1 Container (BOX-204)',
    stopsCount: 2,
    currentStop: 'Stop 1/2: En Route to Rack B-04',
    isMine: true,
    battery: '92%',
    speed: '0.45 m/s',
    etaSeconds: 84,
    distanceRemaining: '18m',
    progressPercent: 75,
    sourceEndpointCode: 'Rack B-04',
    destinationEndpointCode: 'Outbound Dock Out 01',
    activeStepTitle: 'AMR moving along Aisle B for pickup',
    containerCount: 1,
    routeText: 'Rack B-04 ➔ Dock Out 01',
    createdAtUtc: new Date(Date.now() - 4 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-204',
        productName: 'Hydraulic Valves',
        quantity: 8,
        action: 'PICKUP',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        action: 'EMPTY',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-204',
        slot: 'Slot 1 (Front)',
        action: 'PICKUP',
        location: 'Rack B-04 · Level 2 · Bin 01',
        product: 'Hydraulic Valves',
        qty: 8,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'MOVE',
        title: 'Navigate to Rack B-04',
        description: 'Autonomous navigation via Corridor B',
        status: 'EXECUTING',
        targetEndpointCode: 'Rack B-04',
        timeRemainingSeconds: 84,
      },
      {
        sequenceNo: 2,
        type: 'HUMAN_INTERACTION',
        title: 'Staff Pickup Handover',
        description: 'Load BOX-204 onto AMR-02 Slot 1',
        status: 'PENDING',
        targetEndpointCode: 'Rack B-04',
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Rack B-04 (Storage Zone B)',
        description: 'Retrieve TOTE BOX-204 for export shipping',
        state: 'active',
        current: true,
        steps: [
          {
            type: 'MOVE',
            label: 'MOVE: Navigating to Rack B-04 Endpoint (Nav2 Active)',
            status: 'running',
            timeRemaining: '01m 24s ETA',
          },
          {
            type: 'HUMAN_INTERACTION',
            label: 'HUMAN_INTERACTION: Staff picks BOX-204 onto AMR-02 Slot 1',
            status: 'future',
          },
        ],
      },
      {
        id: 2,
        name: 'STOP 2: Outbound Shipping Bay 01',
        description: 'Deliver BOX-204 to dispatch packing staging area',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0808',
    jobNo: 'JOB-2026-0808',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway',
    status: 'COMPLETED',
    target: 'Rack C · Level 1 · Bin 01',
    route: 'Dock 01 ➔ Rack C-05 ➔ Rack D-02',
    robot: 'AMR-01',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '2 Containers Delivered',
    stopsCount: 3,
    currentStop: 'Completed',
    isMine: false,
    battery: '78%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m',
    progressPercent: 100,
    completedAt: '08:45 AM (Today)',
    duration: '14m 20s (On Time)',
    operator: 'Alex Tran (STF-042)',
    sourceEndpointCode: 'Dock 01',
    destinationEndpointCode: 'Rack C · Level 1 · Bin 01',
    activeStepTitle: 'Mission completed successfully',
    containerCount: 2,
    routeText: 'Dock 01 ➔ Rack C-05 ➔ Rack D-02',
    createdAtUtc: new Date(Date.now() - 60 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-105',
        productName: 'Control Relays',
        quantity: 30,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-106',
        productName: 'Sensor Enclosures',
        quantity: 15,
        action: 'UNLOAD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-105',
        slot: 'Slot 1 (Front)',
        action: 'DELIVERED',
        location: 'Rack C-05 · Bin 02',
        product: 'Control Relays',
        qty: 30,
      },
      {
        code: 'BOX-106',
        slot: 'Slot 2 (Mid)',
        action: 'DELIVERED',
        location: 'Rack D-02 · Bin 01',
        product: 'Sensor Enclosures',
        qty: 15,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Dock 01',
        description: 'Inducted 2 totes · Completed 08:31 AM',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Rack C-05',
        description: 'Unloaded BOX-105 into Bin 02 · Completed 08:38 AM',
        state: 'done',
      },
      {
        id: 3,
        name: 'STOP 3: Rack D-02',
        description: 'Unloaded BOX-106 into Bin 01 · Completed 08:45 AM',
        state: 'done',
      },
    ],
  },
  {
    id: 'JOB-2026-0814',
    jobNo: 'JOB-2026-0814',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Internal Reallocation',
    status: 'QUEUED',
    target: 'Rack A · Level 1 · Bin 04',
    route: 'Dock 01 ➔ Rack A-01',
    robot: 'Pending Auto-assign',
    assignedRobotCode: 'Pending Auto-assign',
    payloadSummary: '1 Container (BOX-301)',
    stopsCount: 2,
    currentStop: 'Pending Dispatch',
    isMine: false,
    battery: 'N/A',
    speed: '0.0 m/s',
    etaSeconds: 120,
    distanceRemaining: 'N/A',
    progressPercent: 0,
    sourceEndpointCode: 'Dock 01',
    destinationEndpointCode: 'Rack A · Level 1 · Bin 04',
    activeStepTitle: 'Awaiting AMR dispatch allocation',
    containerCount: 1,
    routeText: 'Dock 01 ➔ Rack A-01',
    createdAtUtc: new Date(Date.now() - 2 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-301',
        productName: 'Optical Encoders',
        quantity: 5,
        action: 'PICKUP',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        action: 'EMPTY',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-301',
        slot: 'Slot 1 (Front)',
        action: 'PICKUP',
        location: 'Rack A-01 · Level 1 · Bin 04',
        product: 'Optical Encoders',
        qty: 5,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Staging Area Dock 01',
        description: 'Waiting for available AMR (Queue #1 · Est: ~2 mins)',
        state: 'future',
      },
      {
        id: 2,
        name: 'STOP 2: Rack A-01 (Bin 04)',
        description: 'Reallocate stock to pick-face slot',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0815',
    jobNo: 'JOB-2026-0815',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Dock Bulk Induction',
    status: 'ASSIGNED',
    target: 'Dock 01 (Receiving Staging)',
    route: 'Dock 01 ➔ Rack C-02 ➔ Rack D-04',
    robot: 'AMR-03',
    assignedRobotCode: 'AMR-03',
    payloadSummary: '3 Containers (BOX-107, BOX-108, BOX-109)',
    stopsCount: 3,
    currentStop: 'Stop 1/3: Inbound Dock 01',
    isMine: true,
    battery: '94%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m (At Station)',
    progressPercent: 15,
    sourceEndpointCode: 'Dock 01',
    destinationEndpointCode: 'Rack C · Level 3 · Bin 02',
    activeStepTitle: 'AMR docked at Dock 01. Waiting for bulk batch load',
    containerCount: 3,
    routeText: 'Dock 01 ➔ Rack C-02 ➔ Rack D-04',
    createdAtUtc: new Date(Date.now() - 5 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-107',
        productName: 'Precision Bearings',
        quantity: 40,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-108',
        productName: 'Servo Actuators',
        quantity: 12,
        action: 'UNLOAD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        containerBarcode: 'BOX-109',
        productName: 'Linear Bushings',
        quantity: 25,
        action: 'UNLOAD',
      },
    ],
    containers: [
      {
        code: 'BOX-107',
        slot: 'Slot 1 (Front)',
        action: 'UNLOAD',
        location: 'Inbound Dock 01',
        product: 'Precision Bearings',
        qty: 40,
      },
      {
        code: 'BOX-108',
        slot: 'Slot 2 (Mid)',
        action: 'UNLOAD',
        location: 'Inbound Dock 01',
        product: 'Servo Actuators',
        qty: 12,
      },
      {
        code: 'BOX-109',
        slot: 'Slot 3 (Rear)',
        action: 'UNLOAD',
        location: 'Inbound Dock 01',
        product: 'Linear Bushings',
        qty: 25,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'HUMAN_INTERACTION',
        title: 'Batch Dock Induction',
        description: 'Verify 3 totes loaded from Inbound Dock 01 onto AMR-03',
        status: 'WAITING',
        targetEndpointCode: 'Dock 01',
        timeRemainingSeconds: 270,
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Dock 01 (Bulk Staging)',
        description: 'Induct 3 totes into AMR-03 slots',
        state: 'active',
        current: true,
      },
      {
        id: 2,
        name: 'STOP 2: Rack C-02',
        description: 'Drop tote BOX-107',
        state: 'future',
      },
      {
        id: 3,
        name: 'STOP 3: Rack D-04',
        description: 'Drop totes BOX-108 & BOX-109',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0816',
    jobNo: 'JOB-2026-0816',
    workflowCode: 'OUTBOUND_RETRIEVAL',
    workflowName: 'Outbound Bulk Staging & Dispatch',
    status: 'ASSIGNED',
    target: 'Outbound Dock Out 02',
    route: 'Rack B-02 ➔ Dock Out 02',
    robot: 'AMR-01',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '3 Containers (BOX-210, BOX-211, BOX-212)',
    stopsCount: 2,
    currentStop: 'Stop 2/2: Outbound Dock Out 02',
    isMine: false,
    battery: '81%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m (At Station)',
    progressPercent: 100,
    sourceEndpointCode: 'Rack B-02',
    destinationEndpointCode: 'Outbound Dock Out 02',
    activeStepTitle: 'AMR docked. Waiting for operator dispatch verification',
    containerCount: 3,
    routeText: 'Rack B-02 ➔ Dock Out 02',
    createdAtUtc: new Date(Date.now() - 15 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-210',
        productName: 'Hydraulic Couplers',
        quantity: 16,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-211',
        productName: 'Pneumatic Valves',
        quantity: 10,
        action: 'UNLOAD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        containerBarcode: 'BOX-212',
        productName: 'Gasket Kits',
        quantity: 35,
        action: 'UNLOAD',
      },
    ],
    containers: [
      {
        code: 'BOX-210',
        slot: 'Slot 1 (Front)',
        action: 'UNLOAD',
        location: 'Outbound Dock Out 02',
        product: 'Hydraulic Couplers',
        qty: 16,
      },
      {
        code: 'BOX-211',
        slot: 'Slot 2 (Mid)',
        action: 'UNLOAD',
        location: 'Outbound Dock Out 02',
        product: 'Pneumatic Valves',
        qty: 10,
      },
      {
        code: 'BOX-212',
        slot: 'Slot 3 (Rear)',
        action: 'UNLOAD',
        location: 'Outbound Dock Out 02',
        product: 'Gasket Kits',
        qty: 35,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'HUMAN_INTERACTION',
        title: 'Dispatch Batch Unload',
        description: 'Confirm all 3 containers transferred to Outbound Shipping Bay',
        status: 'WAITING',
        targetEndpointCode: 'Outbound Dock Out 02',
        timeRemainingSeconds: 240,
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Rack B-02 Pick Zone',
        description: 'Picked 3 totes · Completed',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Outbound Dock Out 02',
        description: 'Unload all 3 totes for truck loading',
        state: 'active',
        current: true,
      },
    ],
  },
  {
    id: 'JOB-2026-0817',
    jobNo: 'JOB-2026-0817',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Rack-to-Rack Replenishment',
    status: 'RUNNING',
    target: 'Pick-Face Rack A-03',
    route: 'Reserve Rack D-01 ➔ Pick-Face Rack A-03',
    robot: 'AMR-02',
    assignedRobotCode: 'AMR-02',
    payloadSummary: '2 Containers (BOX-305, BOX-306)',
    stopsCount: 2,
    currentStop: 'Stop 2/2: En Route to Rack A-03',
    isMine: true,
    battery: '88%',
    speed: '0.55 m/s',
    etaSeconds: 52,
    distanceRemaining: '12m',
    progressPercent: 82,
    sourceEndpointCode: 'Rack D-01',
    destinationEndpointCode: 'Rack A-03',
    activeStepTitle: 'Navigating along Main Corridor towards Rack A-03',
    containerCount: 2,
    routeText: 'Rack D-01 ➔ Rack A-03',
    createdAtUtc: new Date(Date.now() - 3 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-305',
        productName: 'Industrial Fasteners',
        quantity: 50,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-306',
        productName: 'Terminal Blocks',
        quantity: 30,
        action: 'UNLOAD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-305',
        slot: 'Slot 1 (Front)',
        action: 'UNLOAD',
        location: 'Pick-Face Rack A-03 · Level 1 · Bin 02',
        product: 'Industrial Fasteners',
        qty: 50,
      },
      {
        code: 'BOX-306',
        slot: 'Slot 2 (Mid)',
        action: 'UNLOAD',
        location: 'Pick-Face Rack A-03 · Level 2 · Bin 01',
        product: 'Terminal Blocks',
        qty: 30,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'MOVE',
        title: 'Corridor Transit',
        description: 'Autonomous transfer between Reserve and Pick zones',
        status: 'EXECUTING',
        targetEndpointCode: 'Rack A-03',
        timeRemainingSeconds: 52,
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Reserve Rack D-01',
        description: 'Retrieved 2 bulk totes · Completed',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Pick-Face Rack A-03',
        description: 'Replenish active pick slots',
        state: 'active',
        current: true,
      },
    ],
  },
  {
    id: 'JOB-2026-0818',
    jobNo: 'JOB-2026-0818',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Cross-Docking Fast Transfer',
    status: 'ASSIGNED',
    target: 'Dock Out 01',
    route: 'Dock In 02 ➔ Dock Out 01',
    robot: 'AMR-03',
    assignedRobotCode: 'AMR-03',
    payloadSummary: '1 Container (BOX-401 Priority)',
    stopsCount: 2,
    currentStop: 'Stop 2/2: Dock Out 01',
    isMine: false,
    battery: '91%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m',
    progressPercent: 100,
    sourceEndpointCode: 'Dock In 02',
    destinationEndpointCode: 'Dock Out 01',
    activeStepTitle: 'Cross-dock payload arrived at dispatch',
    containerCount: 1,
    routeText: 'Dock In 02 ➔ Dock Out 01',
    createdAtUtc: new Date(Date.now() - 8 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-401',
        productName: 'Priority Medical Sensors',
        quantity: 14,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        action: 'EMPTY',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-401',
        slot: 'Slot 1 (Front)',
        action: 'UNLOAD',
        location: 'Dock Out 01 · Express Lane',
        product: 'Priority Medical Sensors',
        qty: 14,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Receiving Dock 02',
        description: 'Priority intake · Completed',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Outbound Express Dock Out 01',
        description: 'Direct transfer for priority courier dispatch',
        state: 'active',
        current: true,
      },
    ],
  },
  {
    id: 'JOB-2026-0819',
    jobNo: 'JOB-2026-0819',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Replenishment Run 04',
    status: 'COMPLETED',
    target: 'Rack B-01 · Level 2',
    route: 'Rack D-05 ➔ Rack B-01',
    robot: 'AMR-02',
    assignedRobotCode: 'AMR-02',
    payloadSummary: '2 Containers Delivered',
    stopsCount: 2,
    currentStop: 'Completed',
    isMine: true,
    battery: '74%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m',
    progressPercent: 100,
    completedAt: '11:15 AM (Today)',
    duration: '08m 42s (On Time)',
    operator: 'Minh Pham (STF-088)',
    sourceEndpointCode: 'Rack D-05',
    destinationEndpointCode: 'Rack B-01',
    activeStepTitle: 'All transfer steps verified',
    containerCount: 2,
    routeText: 'Rack D-05 ➔ Rack B-01',
    createdAtUtc: new Date(Date.now() - 90 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Slot 1 (Front)',
        containerBarcode: 'BOX-310',
        productName: 'Heat Sink Modules',
        quantity: 20,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Slot 2 (Mid)',
        containerBarcode: 'BOX-311',
        productName: 'Power Cables',
        quantity: 45,
        action: 'UNLOAD',
      },
      {
        slotNo: 3,
        slotLabel: 'Slot 3 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-310',
        slot: 'Slot 1 (Front)',
        action: 'DELIVERED',
        location: 'Rack B-01 · Level 2 · Bin 03',
        product: 'Heat Sink Modules',
        qty: 20,
      },
      {
        code: 'BOX-311',
        slot: 'Slot 2 (Mid)',
        action: 'DELIVERED',
        location: 'Rack B-01 · Level 2 · Bin 04',
        product: 'Power Cables',
        qty: 45,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Bulk Storage D-05',
        description: 'Picked 2 replenishment totes',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: Rack B-01',
        description: 'Delivered both totes to pick line',
        state: 'done',
      },
    ],
  },
];
