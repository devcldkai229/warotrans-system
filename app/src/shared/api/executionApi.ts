import { apiFetch } from './client';
import {
  getSeedContainersSnapshot as getContainersSnapshot,
  getStorageLocationsSnapshot,
  getContainer,
  normalizeProductName,
  normalizeWorkflowDisplayName,
  type ContainerListItem,
} from './warehouseApi';
import type {
  HandoverConfirmationBody,
  HandoverConfirmationResponse,
  HandoverType,
  JobContainerResponse,
  JobDetailResponse,
  JobStatus,
  JobStepResponse,
  JobStepStatus,
  JobTaskResponse,
  JobTaskStatus,
  ReportTaskProblemBody,
  ReportTaskProblemResponse,
  StepType,
} from '../types/contracts';

const KNOWN_ENDPOINT_CODES: Record<string, string> = {
  'ee000000-0000-4000-8000-000000000101': 'DOCK-IN-01',
  'ee000000-0000-4000-8000-000000000104': 'DOCK-OUT-04',
  'ee000000-0000-4000-8000-000000000001': 'EP-A',
  'ee000000-0000-4000-8000-000000000002': 'EP-B',
  'ee000000-0000-4000-8000-000000000003': 'EP-C',
  'ee000000-0000-4000-8000-000000000004': 'EP-D',
  'ee000000-0000-4000-8000-000000000005': 'EP-E',
  'ee000000-0000-4000-8000-000000000006': 'EP-F',
  'ee000000-0000-4000-8000-00000000000a': 'EP-A',
  'ee000000-0000-4000-8000-00000000000b': 'EP-B',
  'ee000000-0000-4000-8000-00000000000c': 'EP-C',
  'ee000000-0000-4000-8000-00000000000d': 'EP-D',
  'ee000000-0000-4000-8000-00000000000e': 'EP-E',
  'ee000000-0000-4000-8000-00000000000f': 'EP-F',
  'ee000000-0000-4000-8000-000000000a01': 'RACK-A-01',
  'ee000000-0000-4000-8000-000000000a02': 'RACK-A-02',
  'ee000000-0000-4000-8000-000000000b01': 'RACK-B-01',
  'ee000000-0000-4000-8000-000000000b04': 'RACK-B-04',
  'ee000000-0000-4000-8000-000000000d01': 'RACK-D-01',
  'bde8dfb6-189b-41d0-8f29-6a104879f914': 'EP-CHARGER',
  'ad53b126-812b-442e-afc2-8812d1085ddc': 'EP-INBOUND-1',
  'cfbc965d-6992-4417-bdcd-17b147a16327': 'EP-INBOUND-2',
  'd8dd7555-0cae-47d0-bccb-f7eacd7a586a': 'EP-OUTBOUND-1',
  '0eaf7c51-d27b-4de0-a8ac-79b7d92094d2': 'EP-OUTBOUND-2',
  'e26c3c5e-ac0b-48e8-9e2a-595b93722719': 'EP-PARKING',
  '4357a0a2-fd9a-43a0-b7b0-71d7f92100a3': 'EP-RACK-A',
  '3974cb12-7900-47bd-be7d-6e8e216d7a40': 'EP-RACK-B',
  '39222c6a-e465-4c5a-9e92-078b3b427c66': 'EP-RACK-C',
};

export interface AcceptTaskResponse {
  taskId: string;
  status: string;
  assignedStaffId: string;
  acceptedAt: string;
}

// Backward-compatible alias exports
export type ConfirmHandoverBody = HandoverConfirmationBody;
export type ConfirmHandoverResponse = HandoverConfirmationResponse;

export interface HandoverConfirmRequest {
  jobStepId: string;
  scannedContainerBarcode?: string | null;
  notes?: string | null;
  /** Backward-compatible aliases */
  containerId?: string | null;
  note?: string | null;
  confirmedBy?: string;
  handoverType?: HandoverType;
  evidence?: Record<string, unknown>;
}

/**
 * High-fidelity fallback runtime seed data mirroring Backend .NET 10 Postgres schemas:
 * `Job` -> `JobContainer` -> `JobTask` -> `JobStep` -> `HandoverConfirmation`
 * Strictly enforces 2-AMR (`AMR-01`, `AMR-02`) and 2-Bay (`Bay 1 (Front)`, `Bay 2 (Rear)`) hardware limits.
 */
let SEED_JOBS: JobDetailResponse[] = [
  {
    id: 'JOB-2026-0812',
    jobNo: 'JOB-2026-0812',
    workflowId: 'ad360f97-02ff-4136-86ea-57412bf0c252',
    mapVersionId: '22222222-2222-2222-2222-222222222222',
    provisioningKey: '7439150f379644049f9db894b72dc3f1:BATCH-001',
    status: 'ASSIGNED',
    contextValues: {
      batchKey: 'BATCH-001',
      warehouseId: '11111111-1111-1111-1111-111111111111',
      batchSequenceNo: 1,
      minBatteryPercent: 25,
      transportRequestId: 'TR-2048',
      workflowCode: 'INBOUND_PUTAWAY',
      workflowName: 'Inbound Putaway (2-Bay Batch)',
      assignedRobotCode: 'AMR-01',
      sourceEndpointCode: 'DOCK-IN-01',
      destinationEndpointCode: 'RACK-A-02 · Level 1',
      routeText: 'DOCK-IN-01 ➔ RACK-A-02 (L1) ➔ RACK-A-02 (L3)',
      currentStop: 'Stop 2/3: RACK-A-02',
      containerMeta: [
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
    },
    createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
    queuedAt: new Date(Date.now() - 11 * 60000).toISOString(),
    startedAt: new Date(Date.now() - 8 * 60000).toISOString(),
    containers: [
      {
        id: '632907a7-a0a6-4201-adea-c8ce8e468e75',
        jobId: 'JOB-2026-0812',
        transportRequestId: 'TR-2048',
        containerId: 'BOX-101',
        sequenceNo: 1,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 8 * 60000).toISOString(),
      },
      {
        id: 'a454b0a6-d731-4dc0-aed3-7c53e40c63a8',
        jobId: 'JOB-2026-0812',
        transportRequestId: 'TR-2048',
        containerId: 'BOX-102',
        sequenceNo: 2,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 7 * 60000).toISOString(),
      },
    ],
    tasks: [
      {
        id: 'ebc2fcc0-cbb0-4fc8-8d19-3042d380be0e',
        jobId: 'JOB-2026-0812',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 1,
        status: 'COMPLETED',
        contextValues: {
          executionScope: 'ONCE_PER_JOB',
        },
        steps: [
          {
            id: '13d44e28-ecee-4e9d-b8fe-949db4436b47',
            jobTaskId: 'ebc2fcc0-cbb0-4fc8-8d19-3042d380be0e',
            workflowStepId: 'af7e2ca2-bceb-4e18-8e74-76b316d3d7f7',
            workflowStepKey: 'CHECK_READY',
            operationCode: 'ROBOT_READY',
            stepType: 'CHECK',
            sequenceNo: 1,
            status: 'COMPLETED',
          },
        ],
      },
      {
        id: 'bb35209a-cb3d-49e2-9ba6-f4d42c87430e',
        jobId: 'JOB-2026-0812',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 2,
        status: 'READY',
        contextValues: {
          executionScope: 'PER_CONTAINER_AT_STOP',
          stopAction: 'DROPOFF',
          containerId: 'BOX-101',
          stopSequenceNo: 2,
        },
        steps: [
          {
            id: 'step-dropoff-box101',
            jobTaskId: 'bb35209a-cb3d-49e2-9ba6-f4d42c87430e',
            workflowStepId: '2dabc6d6-839e-47f2-ba1a-d9d3003dc6ca',
            workflowStepKey: 'DROPOFF_CONFIRM',
            operationCode: 'DROPOFF_CONFIRM',
            stepType: 'HUMAN_INTERACTION',
            sequenceNo: 1,
            status: 'WAITING',
          },
        ],
      },
    ],
  },
  {
    id: 'JOB-2026-0819',
    jobNo: 'JOB-2026-0819',
    workflowId: 'ad360f97-02ff-4136-86ea-57412bf0c252',
    mapVersionId: '22222222-2222-2222-2222-222222222222',
    provisioningKey: '7439150f379644049f9db894b72dc3f1:BATCH-RESCUE',
    status: 'RECOVERY_REQUIRED',
    failureCode: 'NAV_MOTOR_STALL',
    failureMessage: 'Drive motor torque fault in Corridor B2. Manual payload recovery required.',
    contextValues: {
      batchKey: 'BATCH-RESCUE',
      warehouseId: '11111111-1111-1111-1111-111111111111',
      batchSequenceNo: 1,
      transportRequestId: 'TR-2047',
      workflowCode: 'REPLENISHMENT',
      workflowName: 'Replenishment (Zone D ➔ Zone A)',
      assignedRobotCode: 'AMR-02',
      sourceEndpointCode: 'RACK-D-01',
      destinationEndpointCode: 'RACK-A-01 · Level 1',
      routeText: 'RACK-D-01 ➔ Corridor B2 (Stalled) ➔ RACK-A-01',
      currentStop: 'Stalled at Corridor B2 · Node 14',
      containerMeta: [
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
    },
    createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
    queuedAt: new Date(Date.now() - 17 * 60000).toISOString(),
    startedAt: new Date(Date.now() - 14 * 60000).toISOString(),
    containers: [
      {
        id: 'c-r01-jc',
        jobId: 'JOB-2026-0819',
        transportRequestId: 'TR-2047',
        containerId: 'BOX-401',
        sequenceNo: 1,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 12 * 60000).toISOString(),
      },
      {
        id: 'c-r02-jc',
        jobId: 'JOB-2026-0819',
        transportRequestId: 'TR-2047',
        containerId: 'BOX-402',
        sequenceNo: 2,
        status: 'ONBOARD',
        loadedAt: new Date(Date.now() - 11 * 60000).toISOString(),
      },
    ],
    tasks: [
      {
        id: 'task-recovery-01',
        jobId: 'JOB-2026-0819',
        workflowTaskId: '73fb5b11-53c8-4ba7-a02a-23656845a1c1',
        sequenceNo: 1,
        status: 'FAILED',
        failureCode: 'NAV_MOTOR_STALL',
        steps: [
          {
            id: 'step-recovery-01',
            jobTaskId: 'task-recovery-01',
            workflowStepId: '8a791129-04aa-4c1b-9b9c-7ee725513c88',
            workflowStepKey: 'PAYLOAD_TRANSFER',
            operationCode: 'PAYLOAD_TRANSFER',
            stepType: 'HUMAN_INTERACTION',
            sequenceNo: 1,
            status: 'PAUSED',
            errorMessage: 'AMR-02 drive stall. Transfer BOX-401 & BOX-402 to rescue carrier AMR-01.',
          },
        ],
      },
    ],
  },
];

/**
 * Registers newly provisioned AMR jobs (max 2 containers per job) created when a Transport Request is queued.
 */
export function registerProvisionedJobs(newJobs: JobDetailResponse[]) {
  const incomingIds = new Set(newJobs.map((j) => j.id));
  SEED_JOBS = [...newJobs, ...SEED_JOBS.filter((j) => !incomingIds.has(j.id))];
}

/**
 * Marks a recovery job as resolved and transfers it to the rescue robot in-memory.
 */
export function completePayloadRecoveryJob(jobId: string, rescueRobotCode: string) {
  SEED_JOBS = SEED_JOBS.map((job) => {
    if (job.id !== jobId && job.jobNo !== jobId) return job;
    return {
      ...job,
      status: 'RUNNING',
      failureCode: null,
      failureMessage: null,
      contextValues: {
        ...job.contextValues,
        assignedRobotCode: rescueRobotCode,
        currentStop: `Resumed on ${rescueRobotCode}`,
      },
    };
  });
}

const executionContainers = new Map<string, ContainerListItem>();
const isUuid = (value: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);

// Warehouse snapshots contain demo/local registrations in this checkout. Cache
// missing backend containers here without changing the warehouse API contract.
async function hydrateJobContainers(jobs: any[]): Promise<void> {
  const ids = new Set<string>(jobs.flatMap((job) =>
    (job.containers || []).map((c: any) => c.containerId).filter((id: string) =>
      typeof id === 'string' && isUuid(id) && !executionContainers.has(id) &&
      !getContainersSnapshot().some((c) => c.id === id || c.barcode === id)),
  ));
  await Promise.allSettled([...ids].map(async (id) => {
    const container = await getContainer(id);
    if (container?.id) executionContainers.set(id, container);
  }));
}

/** Normalizes backend summaries and task graphs into the existing rich UI model. */
function normalizeJobDetail(raw: any): JobDetailResponse {
  if (!raw) return raw;

  const existingSeed = SEED_JOBS.find((j) => j.id === raw.id || j.jobNo === raw.jobNo);
  const locations = getStorageLocationsSnapshot();
  const endpointCode = (id: unknown) => {
    if (typeof id === 'string' && KNOWN_ENDPOINT_CODES[id.toLowerCase()]) return KNOWN_ENDPOINT_CODES[id.toLowerCase()];
    const location = locations.find((loc) => loc.id === id || loc.endpointId === id);
    return location?.endpointCode || location?.code || id;
  };

  // Normalize containers
  const rawContainers =
    Array.isArray(raw.containers) && raw.containers.length > 0
      ? raw.containers
      : existingSeed?.containers || [];

  const containers: JobContainerResponse[] = rawContainers.map((c: any, idx: number) => ({
    id: c.id || `jc-${idx + 1}`,
    jobId: c.jobId || raw.id,
    transportRequestId: c.transportRequestId || (raw.transportRequestIds?.[0] ?? ''),
    containerId: c.containerId || `BOX-${101 + idx}`,
    sequenceNo: c.sequenceNo ?? idx + 1,
    status: c.status || 'ASSIGNED',
    loadedAt: c.loadedAt ?? null,
    deliveredAt: c.deliveredAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  // Normalize tasks & steps
  const rawTasks =
    Array.isArray(raw.tasks) && raw.tasks.length > 0
      ? raw.tasks
      : existingSeed?.tasks || [];

  const tasks: JobTaskResponse[] = rawTasks.map((task: any, tIdx: number) => {
    const rawSteps = Array.isArray(task.steps) ? task.steps : [];
    const steps: JobStepResponse[] = rawSteps.map((step: any, sIdx: number) => {
      const stepKey = step.stepKey ?? step.workflowStepKey ?? step.name ?? `STEP-${sIdx + 1}`;
      return {
        id: step.id || `step-${tIdx + 1}-${sIdx + 1}`,
        jobTaskId: step.jobTaskId || task.id,
        workflowStepId: step.workflowStepId || step.id || `wf-step-${sIdx + 1}`,
        workflowStepKey: step.workflowStepKey ?? step.stepKey ?? step.name ?? stepKey,
        operationCode: step.operationCode || step.name || stepKey,
        stepType: (step.stepType as StepType) || 'CHECK',
        sequenceNo: step.sequenceNo ?? sIdx + 1,
        status: (step.status as JobStepStatus) || 'PENDING',
        resolvedInputs: step.resolvedInputs || {},
        outputValues: step.outputValues || {},
        targetEndpointId: step.targetEndpointId ? String(step.targetEndpointId) : null,
        startedAt: step.startedAt ?? null,
        completedAt: step.completedAt ?? null,
        errorCode: step.errorCode ?? null,
        errorMessage: step.errorMessage ?? null,
        handoverConfirmation: step.handoverConfirmation ?? null,
      };
    });

    const executionScope = task.executionScope ?? task.contextValues?.executionScope;
    const stopAction = task.stopAction ?? task.contextValues?.stopAction ??
      (steps.some((step) => step.operationCode === 'PICKUP_CONFIRM' || step.workflowStepKey === 'PICKUP_CONFIRM') ? 'PICKUP'
        : steps.some((step) => step.operationCode === 'DROPOFF_CONFIRM' || step.workflowStepKey === 'DROPOFF_CONFIRM') ? 'DROPOFF' : undefined);
    const stopEndpointId = task.stopEndpointId ? String(task.stopEndpointId) : task.contextValues?.stopEndpointId;
    const containerId = task.containerId ? String(task.containerId) : task.contextValues?.containerId;

    return {
      id: task.id || `task-${tIdx + 1}`,
      jobId: task.jobId || raw.id,
      workflowTaskId: task.workflowTaskId || task.taskKey || task.id,
      sequenceNo: task.sequenceNo ?? tIdx + 1,
      status: (task.status as JobTaskStatus) || 'PENDING',
      contextValues: {
        ...task.contextValues,
        ...(executionScope ? { executionScope } : {}),
        ...(stopAction ? { stopAction } : {}),
        ...(stopEndpointId ? { stopEndpointId } : {}),
        stopEndpointCode: endpointCode(stopEndpointId),
        ...(containerId ? { containerId } : {}),
      },
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      failureCode: task.failureCode ?? null,
      steps,
    };
  });

  const waitingTask = tasks.find((task) => task.steps.some((step) =>
    step.status === 'WAITING' && (step.stepType === 'HUMAN_INTERACTION' ||
      ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.operationCode) ||
      ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.workflowStepKey)),
  ));
  const waitingStep = waitingTask?.steps.find((step) =>
    step.status === 'WAITING' && (step.stepType === 'HUMAN_INTERACTION' ||
      ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.operationCode) ||
      ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.workflowStepKey)),
  );
  const handoverOperation = waitingStep?.operationCode || waitingStep?.workflowStepKey;
  const activeStepOperation = ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(handoverOperation || '')
    ? handoverOperation
    : ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(waitingStep?.workflowStepKey || '')
    ? waitingStep?.workflowStepKey
    : waitingTask?.contextValues?.stopAction === 'PICKUP' ? 'PICKUP_CONFIRM'
    : waitingTask?.contextValues?.stopAction === 'DROPOFF' ? 'DROPOFF_CONFIRM' : undefined;
  const waitingContainerId = (waitingStep?.resolvedInputs?.containerId as string) ||
    (waitingTask?.contextValues?.containerId as string) || null;
  const containerSnapshot = [...executionContainers.values(), ...getContainersSnapshot()];

  // Determine robot code
  const assignedRobotCode =
    raw.contextValues?.assignedRobotCode ||
    raw.assignedRobotCode ||
    (raw.assignedRobotId
      ? typeof raw.assignedRobotId === 'string' &&
        raw.assignedRobotId.endsWith('2')
        ? 'AMR-02'
        : 'AMR-01'
      : existingSeed?.contextValues?.assignedRobotCode || 'AMR-01');

  // Extract endpoints from tasks/steps or contextValues
  const pickupTask = tasks.find((t) => t.contextValues?.stopAction === 'PICKUP');
  const dropoffTask = tasks.find((t) => t.contextValues?.stopAction === 'DROPOFF');

  const sourceEndpointCode =
    raw.contextValues?.sourceEndpointCode ||
    endpointCode(pickupTask?.contextValues?.stopEndpointId) ||
    existingSeed?.contextValues?.sourceEndpointCode ||
    'DOCK-IN-01';

  const destinationEndpointCode =
    raw.contextValues?.destinationEndpointCode ||
    endpointCode(dropoffTask?.contextValues?.stopEndpointId) ||
    existingSeed?.contextValues?.destinationEndpointCode ||
    'RACK-A-02 · Level 1';

  const routeText =
    raw.contextValues?.routeText ||
    existingSeed?.contextValues?.routeText ||
    `${sourceEndpointCode} ➔ ${destinationEndpointCode}`;

  const currentStop =
    raw.contextValues?.currentStop ||
    existingSeed?.contextValues?.currentStop ||
    `Stop 1/2: ${sourceEndpointCode}`;

  // Enrich containerMeta if not present
  const containerMeta =
    (!isUuid(raw.id) && (raw.contextValues?.containerMeta || existingSeed?.contextValues?.containerMeta)) ||
    (containers.length > 0
      ? containers.map((c, idx) => {
        const item = containerSnapshot.find((item) => item.id === c.containerId || item.barcode === c.containerId);
        // An explicit target must never accidentally select Bay 1 as well.
        const isWaitingTarget = waitingContainerId ? waitingContainerId === c.containerId : idx === 0;
        return {
          containerId: c.containerId,
          status: c.status,
          code: item?.barcode || (isUuid(c.containerId) ? `Container ${c.sequenceNo}` : c.containerId),
          slot: idx === 0 ? 'Bay 1 (Front)' : 'Bay 2 (Rear)',
          action:
            c.status === 'DELIVERED'
              ? 'DELIVERED'
              : waitingStep && activeStepOperation === 'DROPOFF_CONFIRM' && isWaitingTarget
              ? 'UNLOAD'
              : waitingStep && activeStepOperation === 'PICKUP_CONFIRM' && isWaitingTarget
              ? 'PICKUP'
              : c.status === 'ONBOARD' || String(c.status) === 'LOADED'
              ? 'KEEP ONBOARD'
              : 'PICKUP',
          isTarget: Boolean(waitingStep && isWaitingTarget && c.status !== 'DELIVERED'),
          location: item?.currentStorageLocationCode || item?.currentEndpointCode || destinationEndpointCode,
          currentEndpointCode: item?.currentEndpointCode,
          currentStorageLocationCode: item?.currentStorageLocationCode,
          product: normalizeProductName(item?.productName),
          productSku: item?.productSku,
          qty: item?.qty ?? 0,
        };
      })
      : isUuid(raw.id) ? [] : [
          {
            code: 'BOX-101',
            slot: 'Bay 1 (Front)',
            action: 'UNLOAD',
            location: destinationEndpointCode,
            product: 'Electronic Components',
            qty: 45,
          },
        ]);

  const rawWfCode =
    raw.workflowId === 'e86995fe-461a-4329-8724-a7beab6b57ab'
      ? 'INTERNAL_RELOCATION'
      : raw.contextValues?.workflowCode || existingSeed?.contextValues?.workflowCode || 'INBOUND_PUTAWAY';
  const rawWfName =
    raw.contextValues?.workflowName ||
    existingSeed?.contextValues?.workflowName ||
    (raw.workflowId === 'e86995fe-461a-4329-8724-a7beab6b57ab' ? 'Internal Relocation' : 'Inbound Putaway');

  const enrichedContextValues = {
    batchKey: raw.contextValues?.batchKey || existingSeed?.contextValues?.batchKey || 'BATCH-001',
    warehouseId:
      raw.contextValues?.warehouseId ||
      existingSeed?.contextValues?.warehouseId ||
      '11111111-1111-1111-1111-111111111111',
    transportRequestId:
      raw.contextValues?.transportRequestId ||
      raw.transportRequestIds?.[0] ||
      existingSeed?.contextValues?.transportRequestId ||
      'TR-2048',
    assignedRobotCode,
    sourceEndpointCode,
    destinationEndpointCode,
    routeText,
    currentStop,
    ...raw.contextValues,
    workflowCode: rawWfCode,
    workflowName: normalizeWorkflowDisplayName(rawWfCode, rawWfName),
    containerMeta,
    assignedRobotId: raw.assignedRobotId || raw.contextValues?.assignedRobotId,
    activeStepId: waitingStep?.id || (raw.status === 'ASSIGNED' ? raw.currentStepId : undefined),
    activeStepOperation,
    hasWaitingHandover: Boolean(waitingStep),
    waitingContainerId,
  };

  return {
    id: raw.id,
    jobNo: raw.jobNo || raw.id,
    workflowId: raw.workflowId || existingSeed?.workflowId || 'ad360f97-02ff-4136-86ea-57412bf0c252',
    mapVersionId:
      raw.mapVersionId || existingSeed?.mapVersionId || '22222222-2222-2222-2222-222222222222',
    provisioningKey:
      raw.provisioningKey || existingSeed?.provisioningKey || `${raw.id}:BATCH-001`,
    status: (raw.status as JobStatus) || existingSeed?.status || 'CREATED',
    contextValues: enrichedContextValues,
    createdAt: raw.createdAt || existingSeed?.createdAt || new Date().toISOString(),
    queuedAt: raw.queuedAt ?? existingSeed?.queuedAt ?? null,
    startedAt: raw.startedAt ?? existingSeed?.startedAt ?? null,
    completedAt: raw.completedAt ?? existingSeed?.completedAt ?? null,
    failureCode: raw.failureCode ?? existingSeed?.failureCode ?? null,
    failureMessage: raw.failureMessage ?? existingSeed?.failureMessage ?? null,
    containers,
    tasks,
  };
}

const localJobProgression = new Map<string, JobDetailResponse>();

function saveLocalProgression(job: JobDetailResponse) {
  localJobProgression.set(job.id, job);
  if (job.jobNo) localJobProgression.set(job.jobNo, job);
  const index = SEED_JOBS.findIndex((j) => j.id === job.id || j.jobNo === job.jobNo);
  if (index >= 0) {
    SEED_JOBS[index] = job;
  } else {
    SEED_JOBS.unshift(job);
  }
}

/**
 * List active or historical jobs.
 * Connects to Backend REST when available, with automatic high-fidelity seed fallback.
 */
export async function listJobs(filter?: {
  status?: JobStatus;
  zone?: string;
  warehouseId?: string;
  transportRequestId?: string;
  take?: number;
}): Promise<JobDetailResponse[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.zone) params.set('zone', filter.zone);
    if (filter?.warehouseId) params.set('warehouseId', filter.warehouseId);
    if (filter?.transportRequestId) params.set('transportRequestId', filter.transportRequestId);
    if (filter?.take) params.set('take', String(filter.take));

    const query = params.toString() ? `?${params.toString()}` : '';
    const apiRes = await apiFetch<any>(`/api/workflow-execution/jobs${query}`);
    const rawList: any[] = Array.isArray(apiRes) ? apiRes : apiRes?.items;
    if (Array.isArray(rawList)) {
      const pendingDetails = rawList.filter((item) => !(Array.isArray(item.tasks) && item.tasks.length > 0)).slice(0, 8);
      const details = await Promise.allSettled(pendingDetails.map((item) =>
        apiFetch<any>(`/api/workflow-execution/jobs/${item.id}`),
      ));
      details.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value?.id === pendingDetails[index].id) {
          const position = rawList.indexOf(pendingDetails[index]);
          rawList[position] = { ...pendingDetails[index], ...result.value };
        }
      });
      await hydrateJobContainers(rawList);
      return rawList.map((raw) => {
        const progressed = localJobProgression.get(raw.id) || (raw.jobNo ? localJobProgression.get(raw.jobNo) : undefined);
        if (progressed && (raw.status === 'CREATED' || raw.status === 'QUEUED')) {
          return progressed;
        }
        return normalizeJobDetail(raw);
      });
    }
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] Operating in Seed/Demo mode (Backend execution loop pending):', err);
    }
  }

  let result = [...SEED_JOBS];
  if (filter?.status) {
    result = result.filter((j) => j.status === filter.status);
  }
  return result.map(normalizeJobDetail);
}

/**
 * Fetch detailed runtime graph for a specific Job.
 */
export async function getJobDetail(jobId: string): Promise<JobDetailResponse> {
  try {
    const raw = await apiFetch<any>(`/api/workflow-execution/jobs/${jobId}`);
    if (raw) {
      await hydrateJobContainers([raw]);
      const progressed = localJobProgression.get(raw.id) || (raw.jobNo ? localJobProgression.get(raw.jobNo) : undefined);
      if (progressed && (raw.status === 'CREATED' || raw.status === 'QUEUED')) {
        return progressed;
      }
      const normalized = normalizeJobDetail(raw);
      const index = SEED_JOBS.findIndex((j) => j.id === normalized.id || j.jobNo === normalized.jobNo);
      if (index >= 0) {
        SEED_JOBS[index] = normalized;
      } else {
        SEED_JOBS.unshift(normalized);
      }
      return normalized;
    }
  } catch (err) {
    if (__DEV__) {
      console.info(`[ExecutionApi] Job '${jobId}' fallback to seed runtime graph:`, err);
    }
  }

  const progressed = localJobProgression.get(jobId);
  if (progressed) return progressed;
  const match = SEED_JOBS.find((j) => j.id === jobId || j.jobNo === jobId);
  if (match) return normalizeJobDetail(match);
  return SEED_JOBS[0];
}

/**
 * Assigns a robot (or the best AVAILABLE robot) and starts executing the job runtime graph.
 */
export async function startJob(
  jobId: string,
  robotId?: string | null,
): Promise<JobDetailResponse | null> {
  try {
    const res = await apiFetch<any>(`/api/workflow-execution/jobs/${jobId}/start`, {
      method: 'POST',
      body: JSON.stringify({ robotId: robotId ?? null }),
    });
    if (res) {
      await hydrateJobContainers([res]);
      const normalized = normalizeJobDetail(res);
      localJobProgression.delete(normalized.id);
      if (normalized.jobNo) localJobProgression.delete(normalized.jobNo);
      SEED_JOBS = SEED_JOBS.map((j) => (j.id === normalized.id || j.jobNo === normalized.jobNo ? normalized : j));
      return normalized;
    }
  } catch (err) {
    if (__DEV__) {
      console.info(`[ExecutionApi] startJob fallback to local transition for '${jobId}':`, err);
    }
  }

  // Ensure base job exists in SEED_JOBS (e.g. if started directly from Step 3 receipt)
  let baseJob = SEED_JOBS.find((j) => j.id === jobId || j.jobNo === jobId);
  if (!baseJob) {
    try {
      const fetched = await getJobDetail(jobId);
      if (fetched) baseJob = fetched;
    } catch {}
  }
  if (!baseJob) return null;

  const now = new Date().toISOString();
  const robotCode = robotId
    ? robotId.includes('02')
      ? 'AMR-02'
      : 'AMR-01'
    : (baseJob.contextValues?.assignedRobotCode as string) || 'AMR-01';

  let foundFirstHandover = false;
  const progressedTasks = baseJob.tasks.map((task, tIdx) => {
    const steps = task.steps.map((step) => {
      const isConfirm =
        step.stepType === 'HUMAN_INTERACTION' ||
        (step.stepType as string) === 'MANUAL_CONFIRM' ||
        ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.operationCode) ||
        ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.workflowStepKey);
      if (!foundFirstHandover) {
        if (isConfirm) {
          foundFirstHandover = true;
          return { ...step, status: 'WAITING' as JobStepStatus, startedAt: now };
        }
        return { ...step, status: 'COMPLETED' as JobStepStatus, startedAt: now, completedAt: now };
      }
      return step;
    });
    return {
      ...task,
      status: (tIdx === 0 ? 'RUNNING' : task.status) as JobTaskStatus,
      startedAt: tIdx === 0 ? now : task.startedAt,
      steps,
    };
  });

  const sourceCode = (baseJob.contextValues?.sourceEndpointCode as string) || 'EP-A';
  const normalized = normalizeJobDetail({
    ...baseJob,
    status: 'ASSIGNED',
    startedAt: baseJob.startedAt || now,
    assignedRobotId: robotId || baseJob.contextValues?.assignedRobotId,
    contextValues: {
      ...baseJob.contextValues,
      assignedRobotCode: robotCode,
      currentStop: `Stop 1/2: ${sourceCode}`,
    },
    tasks: progressedTasks,
  });

  saveLocalProgression(normalized);
  return normalized;
}

/**
 * Confirm physical container handover at station.
 * Calls backend POST /api/workflow-execution/job-steps/${req.jobStepId}/confirm
 * with local fallback when running against develop or without MQTT simulator.
 */
export async function confirmHandover(
  req: HandoverConfirmRequest,
): Promise<HandoverConfirmationResponse | JobDetailResponse | null>;
export async function confirmHandover(
  jobStepId: string,
  body?: HandoverConfirmationBody,
): Promise<HandoverConfirmationResponse | JobDetailResponse | null>;
export async function confirmHandover(
  reqOrStepId: HandoverConfirmRequest | string,
  maybeBody?: HandoverConfirmationBody,
): Promise<HandoverConfirmationResponse | JobDetailResponse | null> {
  const req: HandoverConfirmRequest =
    typeof reqOrStepId === 'string'
      ? {
          jobStepId: reqOrStepId,
          scannedContainerBarcode: maybeBody?.containerId ?? null,
          containerId: maybeBody?.containerId ?? null,
          notes: maybeBody?.note ?? null,
          note: maybeBody?.note ?? null,
          confirmedBy: maybeBody?.confirmedBy,
          handoverType: maybeBody?.handoverType,
          evidence: maybeBody?.evidence,
        }
      : reqOrStepId;

  const containerBarcode = req.scannedContainerBarcode ?? req.containerId ?? null;
  const note = req.notes ?? req.note ?? null;

  try {
    const apiRes = await apiFetch<any>(
      `/api/workflow-execution/job-steps/${req.jobStepId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          containerId: containerBarcode,
          note: note,
        }),
      },
    );
    if (apiRes?.id && apiRes?.status) {
      await hydrateJobContainers([apiRes]);
      const normalized = normalizeJobDetail(apiRes);
      localJobProgression.delete(normalized.id);
      if (normalized.jobNo) localJobProgression.delete(normalized.jobNo);
      const index = SEED_JOBS.findIndex((j) => j.id === normalized.id || j.jobNo === normalized.jobNo);
      if (index >= 0) {
        SEED_JOBS[index] = normalized;
      }
      return normalized;
    }
    if (apiRes?.id) return apiRes as HandoverConfirmationResponse;
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] confirmHandover fallback to local in-memory state:', err);
    }
  }

  const now = new Date().toISOString();
  const response: HandoverConfirmationResponse = {
    id: `hc-${Date.now()}`,
    jobStepId: req.jobStepId,
    containerId: containerBarcode || 'BOX-101',
    confirmedBy: req.confirmedBy || 'staff-01',
    handoverType: req.handoverType || 'DROPOFF',
    confirmedAt: now,
    note: note,
    evidence: req.evidence,
  };

  let updatedJobResult: JobDetailResponse | null = null;

  SEED_JOBS = SEED_JOBS.map((job) => {
    const hasStep = job.tasks.some((t) => t.steps.some((s) => s.id === req.jobStepId));
    if (!hasStep) return job;

    let confirmedCurrent = false;
    let activatedNextHandover = false;

    const updatedTasks = job.tasks.map((task) => {
      const steps = task.steps.map((step) => {
        if (step.id === req.jobStepId || (!confirmedCurrent && step.status === 'WAITING')) {
          confirmedCurrent = true;
          return {
            ...step,
            status: 'COMPLETED' as JobStepStatus,
            completedAt: now,
            handoverConfirmation: response,
          };
        }
        if (confirmedCurrent && !activatedNextHandover && step.status === 'PENDING') {
          const isConfirm =
            step.stepType === 'HUMAN_INTERACTION' ||
            (step.stepType as string) === 'MANUAL_CONFIRM' ||
            ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.operationCode) ||
            ['PICKUP_CONFIRM', 'DROPOFF_CONFIRM'].includes(step.workflowStepKey);
          if (isConfirm) {
            activatedNextHandover = true;
            return {
              ...step,
              status: 'WAITING' as JobStepStatus,
              startedAt: now,
            };
          }
          return {
            ...step,
            status: 'COMPLETED' as JobStepStatus,
            startedAt: now,
            completedAt: now,
          };
        }
        return step;
      });

      const allDone = steps.every((s) => s.status === 'COMPLETED');
      const anyActive = steps.some((s) => s.status === 'WAITING' || s.status === 'EXECUTING');
      return {
        ...task,
        status: (allDone ? 'COMPLETED' : anyActive ? 'RUNNING' : task.status) as JobTaskStatus,
        completedAt: allDone ? now : task.completedAt,
        steps,
      };
    });

    const isJobDone = updatedTasks.every((t) => t.steps.every((s) => s.status === 'COMPLETED'));
    const nextContainerStatus = isJobDone ? 'DELIVERED' : 'ONBOARD';
    const destCode = (job.contextValues?.destinationEndpointCode as string) || 'EP-D';

    const updatedContainers = job.containers.map((c) => ({
      ...c,
      status: nextContainerStatus as any,
      loadedAt: nextContainerStatus === 'ONBOARD' ? now : c.loadedAt,
      deliveredAt: isJobDone ? now : c.deliveredAt,
    }));

    const normalized = normalizeJobDetail({
      ...job,
      status: isJobDone ? 'COMPLETED' : 'ASSIGNED',
      completedAt: isJobDone ? now : job.completedAt,
      contextValues: {
        ...job.contextValues,
        currentStop: isJobDone ? `Delivered at ${destCode}` : `Stop 2/2: ${destCode}`,
      },
      containers: updatedContainers,
      tasks: updatedTasks,
    });

    localJobProgression.set(normalized.id, normalized);
    if (normalized.jobNo) localJobProgression.set(normalized.jobNo, normalized);
    updatedJobResult = normalized;
    return normalized;
  });

  return updatedJobResult || response;
}

/**
 * Staff confirms a waiting PICKUP_CONFIRM / DROPOFF_CONFIRM step with the scanned container.
 */
export async function confirmJobStep(
  stepId: string,
  containerId: string | null,
  note?: string | null,
): Promise<JobDetailResponse | null> {
  const result = await confirmHandover({
    jobStepId: stepId,
    scannedContainerBarcode: containerId,
    notes: note ?? null,
  });
  return result as JobDetailResponse | null;
}

/**
 * Report an issue on a specific JobTask.
 */
export async function reportTaskProblem(
  jobTaskId: string,
  body: ReportTaskProblemBody,
): Promise<ReportTaskProblemResponse> {
  try {
    return await apiFetch<ReportTaskProblemResponse>(
      `/api/workflow-execution/tasks/${jobTaskId}/report-problem`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] reportTaskProblem recorded in seed mode:', err);
    }
    return {
      reportId: `REP-${Date.now()}`,
      jobTaskId,
      status: 'REPORTED',
      reportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Assign staff operator to a task.
 */
export async function acceptHumanTask(
  taskId: string,
  staffId: string,
): Promise<AcceptTaskResponse> {
  try {
    return await apiFetch<AcceptTaskResponse>(`/api/workflow-execution/tasks/${taskId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ staffId }),
    });
  } catch (err) {
    if (__DEV__) {
      console.info('[ExecutionApi] acceptHumanTask recorded in seed mode:', err);
    }
    return {
      taskId,
      status: 'ASSIGNED',
      assignedStaffId: staffId,
      acceptedAt: new Date().toISOString(),
    };
  }
}
