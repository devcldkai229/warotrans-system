import { ContainerSlot, JobStepSummary, JobSummary, WorkflowCode } from '../../shared/types/contracts';

export type JobKind = 'waiting' | 'transit' | 'complete' | 'queued';

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
  kind: JobKind;
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

export const MOCK_JOBS: AppJobItem[] = [
  {
    id: 'JOB-2026-0812',
    jobNo: 'JOB-2026-0812',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway (Multi-Drop)',
    status: 'ASSIGNED',
    kind: 'waiting',
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
    kind: 'transit',
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
    kind: 'complete',
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
    kind: 'queued',
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
];
