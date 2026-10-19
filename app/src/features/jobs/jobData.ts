import {
  ContainerSlot,
  JobDetailResponse,
  JobStatus,
  JobStepSummary,
  JobSummary,
  WorkflowCode,
} from '../../shared/types/contracts';
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
  containerId?: string;
  status?: string;
  isTarget?: boolean;
  code: string;
  slot: string;
  action: 'UNLOAD' | 'KEEP ONBOARD' | 'PICKUP' | 'DELIVERED';
  location: string;
  product: string;
  qty: number;
}

export interface AppJobItem extends JobSummary {
  activeStepId?: string;
  activeStepOperation?: 'PICKUP_CONFIRM' | 'DROPOFF_CONFIRM' | string;
  hasWaitingHandover?: boolean;
  assignedRobotId?: string;
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
  tone: SemanticTone;
}

export const JOB_STATUS_PRESENTATION: Record<JobStatus, JobStatusPresentation> = {
  CREATED: { label: 'Created', tone: 'neutral' },
  QUEUED: { label: 'Queued', tone: 'neutral' },
  ASSIGNED: { label: 'Waiting Handover', tone: 'warning' },
  RUNNING: { label: 'Running', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  REASSIGNING: { label: 'Reassigning', tone: 'warning' },
  RECOVERY_REQUIRED: { label: 'Needs Recovery', tone: 'danger' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export function countMyActiveJobs(): number {
  return MOCK_JOBS.filter((job) => job.isMine && !isTerminalJobStatus(job.status)).length;
}

/**
 * Transforms a Backend JobDetailResponse into an AppJobItem presentation model,
 * preserving rich container metadata, 2-bay slot labels, and stop steps.
 */
export function mapJobDetailToAppJobItem(detail: JobDetailResponse): AppJobItem {
  const existingMock = MOCK_JOBS.find(
    (j) => j.id === detail.id || j.jobNo === detail.jobNo
  );

  const robotCode =
    (detail.contextValues?.assignedRobotCode as string) ||
    existingMock?.robot ||
    'AMR-01';
  const sourceCode =
    (detail.contextValues?.sourceEndpointCode as string) ||
    existingMock?.sourceEndpointCode ||
    'DOCK-IN-01';
  const destCode =
    (detail.contextValues?.destinationEndpointCode as string) ||
    existingMock?.destinationEndpointCode ||
    'RACK-A-02 · Level 1';
  const wfCode =
    ((detail.contextValues?.workflowCode as string) as WorkflowCode) ||
    existingMock?.workflowCode ||
    'INBOUND_PUTAWAY';
  const wfName =
    (detail.contextValues?.workflowName as string) ||
    existingMock?.workflowName ||
    'Inbound Putaway';
  const routeText =
    (detail.contextValues?.routeText as string) ||
    existingMock?.routeText ||
    `${sourceCode} ➔ ${destCode}`;
  const currentStop =
    (detail.contextValues?.currentStop as string) ||
    existingMock?.currentStop ||
    `Stop 1/2: ${sourceCode}`;

  const rawMeta = Array.isArray(detail.contextValues?.containerMeta)
    ? (detail.contextValues?.containerMeta as JobContainerItem[])
    : null;

  const containers: JobContainerItem[] = rawMeta
    ? rawMeta.slice(0, 2).map((c, idx) => ({
        ...c,
        containerId: c.containerId || detail.containers[idx]?.containerId,
        status: c.status || detail.containers[idx]?.status,
      }))
    : existingMock?.containers
    ? existingMock.containers.slice(0, 2)
    : detail.containers.slice(0, 2).map((c, idx) => ({
        containerId: c.containerId,
        status: c.status,
        code: c.containerId,
        slot: idx === 0 ? 'Bay 1 (Front)' : 'Bay 2 (Rear)',
        action:
          c.status === 'DELIVERED'
            ? 'DELIVERED'
            : c.status === 'ONBOARD' && idx === 0
            ? 'UNLOAD'
            : c.status === 'ONBOARD' || String(c.status) === 'LOADED'
            ? 'KEEP ONBOARD'
            : 'PICKUP',
        location: destCode,
        product: 'Warehouse Tote',
        qty: 20,
      }));

  const slots: ContainerSlot[] = [1, 2].map((bayNo) => {
    const c = containers[bayNo - 1];
    return {
      slotNo: bayNo as 1 | 2,
      slotLabel: bayNo === 1 ? 'Bay 1 (Front)' : 'Bay 2 (Rear)',
      containerBarcode: c?.code,
      productName: c?.product,
      quantity: c?.qty,
      action: c
        ? c.action === 'KEEP ONBOARD'
          ? 'KEEP_ONBOARD'
          : c.action === 'DELIVERED'
          ? 'EMPTY'
          : c.action
        : 'EMPTY',
    };
  });

  const containerCodes = containers.map((c) => c.code).join(', ');
  const steps: JobStepSummary[] =
    existingMock?.steps && existingMock.steps.length > 0
      ? existingMock.steps
      : [...detail.tasks]
          .sort((a, b) => a.sequenceNo - b.sequenceNo)
          .flatMap((t) =>
            [...t.steps]
              .sort((a, b) => a.sequenceNo - b.sequenceNo)
              .map((s) => ({ t, s }))
          )
          .map(({ t, s }, globalIdx) => {
            const pickupEndpointCode =
              (String(t.contextValues?.stopAction) === 'PICKUP' &&
                (t.contextValues?.stopEndpointCode as string)) || sourceCode;
            const dropoffEndpointCode =
              (String(t.contextValues?.stopAction) === 'DROPOFF' &&
                (t.contextValues?.stopEndpointCode as string)) || destCode;
            const stepKey = s.workflowStepKey || s.operationCode;
            const presentation: Record<string, { title: string; description: string }> = {
              MOVE_PICKUP: {
                title: 'Autonomous Transit to Pickup',
                description: `Navigate AMR to pickup endpoint (${pickupEndpointCode})`,
              },
              PICKUP_CONFIRM: {
                title: 'Operator Pickup Verification',
                description: `Scan & confirm loading of ${containerCodes} onto AMR bay`,
              },
              MOVE_DROPOFF: {
                title: 'Autonomous Transit to Dropoff',
                description: `Navigate AMR to destination endpoint (${dropoffEndpointCode})`,
              },
              DROPOFF_CONFIRM: {
                title: 'Operator Dropoff Verification',
                description: `Scan & confirm unloading of ${containerCodes} at destination`,
              },
            };
            const targetIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
              .test(s.targetEndpointId || '');
            return {
              sequenceNo: globalIdx + 1,
              type: s.stepType,
              title: presentation[stepKey]?.title || stepKey,
              description: presentation[stepKey]?.description || s.errorMessage || s.operationCode,
              status: s.status,
              targetEndpointCode: !s.targetEndpointId || targetIsUuid
                ? (t.contextValues?.stopEndpointCode as string) ||
                  (String(t.contextValues?.stopAction) === 'PICKUP' ? sourceCode : destCode)
                : s.targetEndpointId,
            };
          });

  let stopsList: JobStopItem[] =
    existingMock?.stopsList && existingMock.stopsList.length > 0
      ? existingMock.stopsList
      : [
          {
            id: 1,
            name: `STOP 1: ${sourceCode}`,
            description: `Inducted ${containers.length} tote(s) (${containers
              .map((c) => c.code)
              .join(', ')})`,
            state: 'done',
          },
          {
            id: 2,
            name: `STOP 2: ${destCode}`,
            description: `Handover & slot verification for ${containers
              .map((c) => `${c.code} ➔ ${c.location}`)
              .join(', ')}`,
            state: 'active',
            current: true,
          },
        ];

  // Preserve the demo tour; backend stops follow the actual ordered task graph.
  const isBackendJob = !['JOB-2026-0812', 'JOB-2026-0819'].includes(detail.id);
  const stopTasks = [...detail.tasks]
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .filter((task) => ['PICKUP', 'DROPOFF'].includes(String(task.contextValues?.stopAction)));
  if (isBackendJob && stopTasks.length > 0) {
    const activeIndex = stopTasks.findIndex((task) => !['COMPLETED', 'SKIPPED'].includes(task.status));
    stopsList = stopTasks.map((task, index): JobStopItem => {
      const pickup = task.contextValues?.stopAction === 'PICKUP';
      const done = ['COMPLETED', 'SKIPPED'].includes(task.status);
      const active = !done && index === activeIndex && !['CREATED', 'QUEUED'].includes(detail.status) &&
        !isTerminalJobStatus(detail.status);
      const location = String(task.contextValues?.stopEndpointCode || (pickup ? sourceCode : destCode));
      const target = containers.find((c) => c.containerId === task.contextValues?.containerId);
      return {
        id: index + 1,
        name: `Stop ${index + 1}: ${pickup ? 'Pickup' : 'Dropoff'} · ${location}`,
        description: `${pickup ? 'Load' : 'Unload'} ${target?.code || containers.map((c) => c.code).join(', ')} · ${location}`,
        state: done ? 'done' : active ? 'active' : 'future',
        current: active,
        steps: task.steps.map((step) => ({
          type: step.stepType,
          label: step.workflowStepKey || step.operationCode,
          status: step.status === 'COMPLETED' ? 'done'
            : step.status === 'WAITING' ? 'waiting'
            : step.status === 'EXECUTING' ? 'running' : 'future',
        })),
      };
    });
  }

  return {
    id: detail.id,
    jobNo: detail.jobNo,
    workflowCode: wfCode,
    workflowName: wfName,
    status: detail.status,
    activeStepId: (detail.contextValues?.activeStepId as string) || undefined,
    activeStepOperation: (detail.contextValues?.activeStepOperation as string) || undefined,
    hasWaitingHandover: Boolean(detail.contextValues?.hasWaitingHandover || detail.status === 'ASSIGNED'),
    assignedRobotId: (detail.contextValues?.assignedRobotId as string) || undefined,
    assignedRobotCode: robotCode,
    sourceEndpointCode: sourceCode,
    destinationEndpointCode: destCode,
    activeStepTitle:
      detail.status === 'RECOVERY_REQUIRED'
        ? detail.failureMessage || 'AMR stalled. Immediate payload rescue required.'
        : existingMock?.activeStepTitle ||
          'AMR positioned at waypoint. Ready for operator verification.',
    containerCount: containers.length,
    slots,
    steps,
    createdAtUtc: detail.createdAt,
    target: destCode,
    route: routeText,
    robot: robotCode,
    isMine: !isTerminalJobStatus(detail.status),
    battery: robotCode === 'AMR-02' ? '92%' : '85%',
    speed: detail.status === 'RUNNING' ? '0.65 m/s' : '0.0 m/s',
    distanceRemaining:
      detail.status === 'RUNNING' ? '14m' : '0m (At Waypoint)',
    progressPercent:
      detail.status === 'COMPLETED'
        ? 100
        : detail.status === 'RECOVERY_REQUIRED'
        ? 55
        : detail.status === 'ASSIGNED'
        ? 90
        : 45,
    currentStop,
    stopsCount: stopsList.length,
    routeText,
    payloadSummary: `${containers.length} ${
      containers.length === 1 ? 'Container' : 'Containers'
    } (${containers.map((c) => c.code).join(', ')})`,
    containers,
    stopsList,
  };
}

export const MOCK_JOBS: AppJobItem[] = [
  {
    id: 'JOB-2026-0812',
    jobNo: 'JOB-2026-0812',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway (2-Bay Batch)',
    status: 'ASSIGNED',
    target: 'RACK-A-02 · Level 1',
    route: 'DOCK-IN-01 ➔ RACK-A-02 (L1) ➔ RACK-A-02 (L3)',
    robot: 'AMR-01',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '2 Containers (BOX-101, BOX-102)',
    stopsCount: 3,
    currentStop: 'Stop 2/3: RACK-A-02',
    isMine: true,
    battery: '85%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m (At Station)',
    progressPercent: 90,
    sourceEndpointCode: 'DOCK-IN-01',
    destinationEndpointCode: 'RACK-A-02 · Level 1',
    activeStepTitle: 'AMR docked at RACK-A-02. Waiting for operator unload verification',
    containerCount: 2,
    routeText: 'DOCK-IN-01 ➔ RACK-A-02 (L1) ➔ RACK-A-02 (L3)',
    createdAtUtc: new Date(Date.now() - 10 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Bay 1 (Front)',
        containerBarcode: 'BOX-101',
        productName: 'Electronic Components',
        quantity: 45,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Bay 2 (Rear)',
        containerBarcode: 'BOX-102',
        productName: 'Control Modules (CM-3100)',
        quantity: 25,
        action: 'KEEP_ONBOARD',
      },
    ],
    containers: [
      {
        code: 'BOX-101',
        slot: 'Bay 1 (Front)',
        action: 'UNLOAD',
        location: 'RACK-A-02 · Level 1',
        product: 'Electronic Components',
        qty: 45,
      },
      {
        code: 'BOX-102',
        slot: 'Bay 2 (Rear)',
        action: 'KEEP ONBOARD',
        location: 'RACK-A-02 · Level 3 (Stop 3)',
        product: 'Control Modules (CM-3100)',
        qty: 25,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'CHECK',
        title: 'Payload Pre-Check',
        description: 'Verify 2-bay container latch & weight limit at DOCK-IN-01',
        status: 'COMPLETED',
        targetEndpointCode: 'DOCK-IN-01',
      },
      {
        sequenceNo: 2,
        type: 'MOVE',
        title: 'Transit to Storage Zone A',
        description: 'Autonomous navigation along Main Transit Corridor',
        status: 'COMPLETED',
        targetEndpointCode: 'RACK-A-02',
      },
      {
        sequenceNo: 3,
        type: 'HUMAN_INTERACTION',
        title: 'Operator Handover & Verification',
        description: 'Confirm physical placement of BOX-101 into RACK-A-02 · Level 1',
        status: 'WAITING',
        targetEndpointCode: 'RACK-A-02',
        timeRemainingSeconds: 285,
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Receiving Dock 01',
        description: 'Batch Pickup: Loaded 2 Totes (BOX-101, BOX-102) onto Bay 1 & Bay 2 · Completed at 09:32',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: RACK-A-02 · Level 1',
        description: 'Unload TOTE BOX-101 from Bay 1 (Front) into RACK-A-02 · Level 1',
        state: 'active',
        current: true,
        steps: [
          {
            type: 'MOVE',
            label: 'MOVE: Arrived at RACK-A-02 Endpoint (Nav2 Succeeded)',
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
            label: 'CHECK: Verify Barcode & Shelf Level 1 Placement',
            status: 'future',
          },
        ],
      },
      {
        id: 3,
        name: 'STOP 3: RACK-A-02 · Level 3',
        description: 'Unload TOTE BOX-102 from Bay 2 (Rear) into RACK-A-02 · Level 3',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0819',
    jobNo: 'JOB-2026-0819',
    workflowCode: 'REPLENISHMENT',
    workflowName: 'Replenishment (Zone D ➔ Zone A)',
    status: 'RECOVERY_REQUIRED',
    target: 'RACK-A-01 · Level 1',
    route: 'RACK-D-01 ➔ Corridor B2 (Stalled) ➔ RACK-A-01',
    robot: 'AMR-02',
    assignedRobotCode: 'AMR-02',
    payloadSummary: '2 Containers (BOX-401, BOX-402)',
    stopsCount: 2,
    currentStop: 'Stalled at Corridor B2 · Node 14',
    isMine: true,
    battery: '92%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '22m (Stalled)',
    progressPercent: 55,
    sourceEndpointCode: 'RACK-D-01',
    destinationEndpointCode: 'RACK-A-01 · Level 1',
    activeStepTitle: 'Drive motor torque fault in Corridor B2. Payload rescue required.',
    containerCount: 2,
    routeText: 'RACK-D-01 ➔ Corridor B2 (Stalled) ➔ RACK-A-01',
    createdAtUtc: new Date(Date.now() - 14 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Bay 1 (Front)',
        containerBarcode: 'BOX-401',
        productName: 'Sensor Array (SA-8820)',
        quantity: 50,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Bay 2 (Rear)',
        containerBarcode: 'BOX-402',
        productName: 'Control Module (CM-3100)',
        quantity: 30,
        action: 'KEEP_ONBOARD',
      },
    ],
    containers: [
      {
        code: 'BOX-401',
        slot: 'Bay 1 (Front)',
        action: 'UNLOAD',
        location: 'RACK-A-01 · Level 1',
        product: 'Sensor Array (SA-8820)',
        qty: 50,
      },
      {
        code: 'BOX-402',
        slot: 'Bay 2 (Rear)',
        action: 'KEEP ONBOARD',
        location: 'RACK-A-03 · Level 2',
        product: 'Control Module (CM-3100)',
        qty: 30,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'MOVE',
        title: 'Bulk Yard D Pickup',
        description: 'Loaded BOX-401 & BOX-402 at RACK-D-01',
        status: 'COMPLETED',
        targetEndpointCode: 'RACK-D-01',
      },
      {
        sequenceNo: 2,
        type: 'HUMAN_INTERACTION',
        title: 'Emergency Payload Recovery',
        description: 'Transfer stranded totes BOX-401 & BOX-402 from AMR-02 to rescue carrier AMR-01',
        status: 'PAUSED',
        targetEndpointCode: 'Corridor B2 · Node 14',
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Bulk Yard RACK-D-01',
        description: 'Picked 2 replenishment totes (BOX-401, BOX-402) · Completed',
        state: 'done',
      },
      {
        id: 2,
        name: 'INCIDENT: Corridor B2 · Node 14',
        description: 'AMR-02 drive motor stalled. Initiate cargo rescue to transfer 2 totes to AMR-01.',
        state: 'active',
        current: true,
      },
    ],
  },
  {
    id: 'JOB-2026-0813',
    jobNo: 'JOB-2026-0813',
    workflowCode: 'OUTBOUND_RETRIEVAL',
    workflowName: 'Outbound Retrieval Tour',
    status: 'RUNNING',
    target: 'DOCK-OUT-04',
    route: 'RACK-B-04 · Level 2 ➔ DOCK-OUT-04',
    robot: 'AMR-02',
    assignedRobotCode: 'AMR-02',
    payloadSummary: '1 Container (BOX-204)',
    stopsCount: 2,
    currentStop: 'Stop 1/2: En Route to RACK-B-04',
    isMine: true,
    battery: '92%',
    speed: '0.45 m/s',
    etaSeconds: 84,
    distanceRemaining: '18m',
    progressPercent: 75,
    sourceEndpointCode: 'RACK-B-04',
    destinationEndpointCode: 'DOCK-OUT-04',
    activeStepTitle: 'AMR moving along Aisle B for pickup',
    containerCount: 1,
    routeText: 'RACK-B-04 · Level 2 ➔ DOCK-OUT-04',
    createdAtUtc: new Date(Date.now() - 4 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Bay 1 (Front)',
        containerBarcode: 'BOX-204',
        productName: 'Hydraulic Valves',
        quantity: 16,
        action: 'PICKUP',
      },
      {
        slotNo: 2,
        slotLabel: 'Bay 2 (Rear)',
        action: 'EMPTY',
      },
    ],
    containers: [
      {
        code: 'BOX-204',
        slot: 'Bay 1 (Front)',
        action: 'PICKUP',
        location: 'RACK-B-04 · Level 2',
        product: 'Hydraulic Valves',
        qty: 16,
      },
    ],
    steps: [
      {
        sequenceNo: 1,
        type: 'MOVE',
        title: 'Navigate to RACK-B-04',
        description: 'Autonomous navigation via Corridor B',
        status: 'EXECUTING',
        targetEndpointCode: 'RACK-B-04',
        timeRemainingSeconds: 84,
      },
      {
        sequenceNo: 2,
        type: 'HUMAN_INTERACTION',
        title: 'Staff Pickup Handover',
        description: 'Load BOX-204 onto AMR-02 Bay 1 (Front)',
        status: 'PENDING',
        targetEndpointCode: 'RACK-B-04',
      },
    ],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: RACK-B-04 · Level 2 (Storage Zone B)',
        description: 'Retrieve TOTE BOX-204 onto Bay 1 (Front)',
        state: 'active',
        current: true,
      },
      {
        id: 2,
        name: 'STOP 2: Outbound Dock 04 (Shipping Bay)',
        description: 'Deliver BOX-204 to outbound dispatch staging',
        state: 'future',
      },
    ],
  },
  {
    id: 'JOB-2026-0814',
    jobNo: 'JOB-2026-0814',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Internal Reallocation (Zone A ➔ Zone B)',
    status: 'QUEUED',
    target: 'RACK-B-01 · Level 1 & 3',
    route: 'RACK-A-08 ➔ RACK-B-01',
    robot: 'AMR-01 (Next Available)',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '2 Containers (BOX-301, BOX-302)',
    stopsCount: 2,
    currentStop: 'Queued for AMR-01 (Batch #2)',
    isMine: false,
    battery: '85%',
    speed: '0.0 m/s',
    etaSeconds: 120,
    distanceRemaining: 'N/A',
    progressPercent: 0,
    sourceEndpointCode: 'RACK-A-08',
    destinationEndpointCode: 'RACK-B-01 · Level 1',
    activeStepTitle: 'Queued for AMR-01 upon completion of current mission',
    containerCount: 2,
    routeText: 'RACK-A-08 ➔ RACK-B-01 (L1 & L3)',
    createdAtUtc: new Date(Date.now() - 2 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Bay 1 (Front)',
        containerBarcode: 'BOX-301',
        productName: 'Excess Buffer Stock (EB-101)',
        quantity: 40,
        action: 'PICKUP',
      },
      {
        slotNo: 2,
        slotLabel: 'Bay 2 (Rear)',
        containerBarcode: 'BOX-302',
        productName: 'Seasonal Spares (SS-302)',
        quantity: 25,
        action: 'PICKUP',
      },
    ],
    containers: [
      {
        code: 'BOX-301',
        slot: 'Bay 1 (Front)',
        action: 'PICKUP',
        location: 'RACK-B-01 · Level 1',
        product: 'Excess Buffer Stock (EB-101)',
        qty: 40,
      },
      {
        code: 'BOX-302',
        slot: 'Bay 2 (Rear)',
        action: 'PICKUP',
        location: 'RACK-B-01 · Level 3',
        product: 'Seasonal Spares (SS-302)',
        qty: 25,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Source RACK-A-08 (Level 1 & 2)',
        description: 'Pick 2 totes (BOX-301, BOX-302) onto 2-Bay deck',
        state: 'future',
      },
      {
        id: 2,
        name: 'STOP 2: Target RACK-B-01 (Level 1 & 3)',
        description: 'Consolidate into Heavy Reserve Zone B',
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
    target: 'RACK-B-01 · Level 2',
    route: 'DOCK-IN-01 ➔ RACK-B-01 (L2) ➔ RACK-B-02 (L1)',
    robot: 'AMR-01',
    assignedRobotCode: 'AMR-01',
    payloadSummary: '2 Containers Delivered (BOX-105, BOX-210)',
    stopsCount: 3,
    currentStop: 'Completed',
    isMine: false,
    battery: '78%',
    speed: '0.0 m/s',
    etaSeconds: 0,
    distanceRemaining: '0m',
    progressPercent: 100,
    completedAt: '09:50 AM (Today)',
    duration: '06m 40s (On Time)',
    operator: 'Alex Tran (STF-042)',
    sourceEndpointCode: 'DOCK-IN-01',
    destinationEndpointCode: 'RACK-B-01 · Level 2',
    activeStepTitle: 'Mission completed and verified',
    containerCount: 2,
    routeText: 'DOCK-IN-01 ➔ RACK-B-01 (L2) ➔ RACK-B-02 (L1)',
    createdAtUtc: new Date(Date.now() - 60 * 60000).toISOString(),
    slots: [
      {
        slotNo: 1,
        slotLabel: 'Bay 1 (Front)',
        containerBarcode: 'BOX-105',
        productName: 'Control Relays',
        quantity: 30,
        action: 'UNLOAD',
      },
      {
        slotNo: 2,
        slotLabel: 'Bay 2 (Rear)',
        containerBarcode: 'BOX-210',
        productName: 'Drive Assembly Kit',
        quantity: 15,
        action: 'UNLOAD',
      },
    ],
    containers: [
      {
        code: 'BOX-105',
        slot: 'Bay 1 (Front)',
        action: 'DELIVERED',
        location: 'RACK-B-01 · Level 2',
        product: 'Control Relays',
        qty: 30,
      },
      {
        code: 'BOX-210',
        slot: 'Bay 2 (Rear)',
        action: 'DELIVERED',
        location: 'RACK-B-02 · Level 1',
        product: 'Drive Assembly Kit',
        qty: 15,
      },
    ],
    steps: [],
    stopsList: [
      {
        id: 1,
        name: 'STOP 1: Inbound Dock 01',
        description: 'Inducted 2 totes onto Bay 1 & Bay 2 · Completed 09:43 AM',
        state: 'done',
      },
      {
        id: 2,
        name: 'STOP 2: RACK-B-01 · Level 2',
        description: 'Unloaded BOX-105 · Completed 09:47 AM',
        state: 'done',
      },
      {
        id: 3,
        name: 'STOP 3: RACK-B-02 · Level 1',
        description: 'Unloaded BOX-210 · Completed 09:50 AM',
        state: 'done',
      },
    ],
  },
];
