import { apiFetch } from './client';
import type { JobDetailResponse, TransportRequestStatus } from '../types/contracts';
import { listJobs, registerProvisionedJobs } from './executionApi';
import { listPublishedWorkflows } from './workflowApi';
import { getSeedContainersSnapshot as getContainersSnapshot, listContainers, reserveStorageSlots } from './warehouseApi';

export interface CreateTransportRequestDetailBody {
  sequenceNo: number;
  containerId: string;
  sourceStorageLocationId: string | null;
  sourceEndpointId: string;
  sourceLevelNo: number | null;
  destinationStorageLocationId: string | null;
  destinationEndpointId: string;
  destinationLevelNo: number | null;
  // Optional client-side display metadata for offline/seed reactive continuity
  containerBarcode?: string;
  productName?: string;
  productSku?: string;
  qty?: number;
  sourceEndpointCode?: string;
  destinationEndpointCode?: string;
  destinationStorageLocationCode?: string | null;
}

export interface CreateTransportRequestBody {
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
  workflowCode?: string;
  workflowName?: string;
  workflowInputs?: Record<string, unknown>;
  note?: string | null;
  details: CreateTransportRequestDetailBody[];
}

export interface TransportRequestDetailResponse {
  id: string;
  sequenceNo: number;
  containerId: string;
  sourceStorageLocationId: string | null;
  sourceEndpointId: string;
  sourceLevelNo: number | null;
  destinationStorageLocationId: string | null;
  destinationEndpointId: string;
  destinationLevelNo: number | null;
  status: string;
}

export interface CreateTransportRequestResponse {
  id: string;
  requestCode: string;
  status: string;
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
  planSchemaVersion: number;
  requestedBy: string;
  note: string | null;
  workflowInputs: Record<string, unknown>;
  submittedAt: string;
  details: TransportRequestDetailResponse[];
}

export interface TransportRequestListDetail {
  id: string;
  sequenceNo: number;
  containerId: string;
  containerBarcode: string | null;
  productName?: string | null;
  qty?: number;
  sourceStorageLocationId?: string | null;
  sourceEndpointId: string;
  sourceEndpointCode: string | null;
  sourceLevelNo?: number | null;
  destinationStorageLocationId?: string | null;
  destinationStorageLocationCode?: string | null;
  destinationEndpointId: string;
  destinationEndpointCode: string | null;
  destinationLevelNo?: number | null;
  status: string;
}

export interface TransportRequestListItem {
  id: string;
  requestCode: string;
  status: TransportRequestStatus | string;
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
  workflowCode: string | null;
  workflowName?: string | null;
  assignedRobotCode?: string | null;
  linkedJobId?: string | null;
  note: string | null;
  submittedAt: string;
  details: TransportRequestListDetail[];
}

export interface ListTransportRequestsResponse {
  items: TransportRequestListItem[];
  total: number;
}

export interface QueuedJobResponse {
  jobId: string;
  jobNo: string;
  batchKey: string;
  jobContainerCount: number;
  jobTaskCount: number;
  jobStepCount: number;
  assignedRobotCode?: string;
}

export interface QueueTransportRequestResponse {
  transportRequestId: string;
  requestCode: string;
  status: string;
  queuedAt: string | null;
  jobs: QueuedJobResponse[];
}

const DEFAULT_WAREHOUSE_ID = '11111111-1111-1111-1111-111111111111';
const DEFAULT_MAP_VERSION_ID = '00000000-0000-0000-0001-000000000001';

let SEED_TRANSPORT_REQUESTS: TransportRequestListItem[] = [
  {
    id: '7439150f-3796-4404-9f9d-b894b72dc3f1',
    requestCode: 'TR-2048',
    status: 'IN_PROGRESS',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    mapVersionId: DEFAULT_MAP_VERSION_ID,
    workflowId: 'ad360f97-02ff-4136-86ea-57412bf0c252',
    workflowCode: 'INBOUND_PUTAWAY',
    workflowName: 'Inbound Putaway',
    assignedRobotCode: 'AMR-01',
    linkedJobId: 'JOB-2026-0812',
    note: 'Electronic Components & Control Modules (2 Totes · 1 AMR Mission)',
    submittedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    details: [
      {
        id: 'trd-2048-1',
        sequenceNo: 1,
        containerId: '632907a7-a0a6-4201-adea-c8ce8e468e75',
        containerBarcode: 'BOX-101',
        productName: 'Electronic Components',
        qty: 45,
        sourceStorageLocationId: null,
        sourceEndpointId: '00000000-0000-0000-0004-000000000001',
        sourceEndpointCode: 'DOCK-IN-01',
        sourceLevelNo: null,
        destinationStorageLocationId: 'a0000000-0000-0000-0005-000000000002',
        destinationStorageLocationCode: 'RACK-A-02',
        destinationEndpointId: '00000000-0000-0000-0004-000000000012',
        destinationEndpointCode: 'RACK-A-02 · Level 1',
        destinationLevelNo: 1,
        status: 'IN_PROGRESS',
      },
      {
        id: 'trd-2048-2',
        sequenceNo: 2,
        containerId: 'a454b0a6-d731-4dc0-aed3-7c53e40c63a8',
        containerBarcode: 'BOX-102',
        productName: 'Control Modules (CM-3100)',
        qty: 25,
        sourceStorageLocationId: null,
        sourceEndpointId: '00000000-0000-0000-0004-000000000001',
        sourceEndpointCode: 'DOCK-IN-01',
        sourceLevelNo: null,
        destinationStorageLocationId: 'a0000000-0000-0000-0005-000000000002',
        destinationStorageLocationCode: 'RACK-A-02',
        destinationEndpointId: '00000000-0000-0000-0004-000000000012',
        destinationEndpointCode: 'RACK-A-02 · Level 3',
        destinationLevelNo: 3,
        status: 'IN_PROGRESS',
      },
    ],
  },
  {
    id: 'tr-seed-2047',
    requestCode: 'TR-2047',
    status: 'IN_PROGRESS',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    mapVersionId: DEFAULT_MAP_VERSION_ID,
    workflowId: '00000000-0000-0000-0002-000000000005',
    workflowCode: 'REPLENISHMENT',
    workflowName: 'Replenishment',
    assignedRobotCode: 'AMR-02',
    linkedJobId: 'JOB-2026-0819',
    note: 'Sensor Array & Control Module restock from Yard D (2 Totes)',
    submittedAt: new Date(Date.now() - 18 * 60000).toISOString(),
    details: [
      {
        id: 'trd-2047-1',
        sequenceNo: 1,
        containerId: 'c-r01',
        containerBarcode: 'BOX-401',
        productName: 'Sensor Array (SA-8820)',
        qty: 50,
        sourceStorageLocationId: 'd0000000-0000-0000-0005-000000000001',
        sourceEndpointId: '00000000-0000-0000-0004-000000000041',
        sourceEndpointCode: 'RACK-D-01 · Level 1',
        sourceLevelNo: 1,
        destinationStorageLocationId: 'a0000000-0000-0000-0005-000000000001',
        destinationStorageLocationCode: 'RACK-A-01',
        destinationEndpointId: '00000000-0000-0000-0004-000000000011',
        destinationEndpointCode: 'RACK-A-01 · Level 1',
        destinationLevelNo: 1,
        status: 'IN_PROGRESS',
      },
      {
        id: 'trd-2047-2',
        sequenceNo: 2,
        containerId: 'c-r02',
        containerBarcode: 'BOX-402',
        productName: 'Control Module (CM-3100)',
        qty: 30,
        sourceStorageLocationId: 'd0000000-0000-0000-0005-000000000001',
        sourceEndpointId: '00000000-0000-0000-0004-000000000041',
        sourceEndpointCode: 'RACK-D-01 · Level 2',
        sourceLevelNo: 2,
        destinationStorageLocationId: 'a0000000-0000-0000-0005-000000000003',
        destinationStorageLocationCode: 'RACK-A-03',
        destinationEndpointId: '00000000-0000-0000-0004-000000000013',
        destinationEndpointCode: 'RACK-A-03 · Level 2',
        destinationLevelNo: 2,
        status: 'IN_PROGRESS',
      },
    ],
  },
  {
    id: 'tr-seed-2046',
    requestCode: 'TR-2046',
    status: 'IN_PROGRESS',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    mapVersionId: DEFAULT_MAP_VERSION_ID,
    workflowId: '00000000-0000-0000-0002-000000000002',
    workflowCode: 'OUTBOUND_RETRIEVAL',
    workflowName: 'Outbound Retrieval',
    assignedRobotCode: 'AMR-02',
    linkedJobId: 'JOB-2026-0813',
    note: 'Hydraulic Valves retrieval for Outbound Shipping Bay 01',
    submittedAt: new Date(Date.now() - 25 * 60000).toISOString(),
    details: [
      {
        id: 'trd-2046-1',
        sequenceNo: 1,
        containerId: 'c-204',
        containerBarcode: 'BOX-204',
        productName: 'Hydraulic Valves',
        qty: 16,
        sourceStorageLocationId: 'b0000000-0000-0000-0005-000000000004',
        sourceEndpointId: '00000000-0000-0000-0004-000000000024',
        sourceEndpointCode: 'RACK-B-04 · Level 2',
        sourceLevelNo: 2,
        destinationStorageLocationId: null,
        destinationStorageLocationCode: null,
        destinationEndpointId: '00000000-0000-0000-0004-000000000004',
        destinationEndpointCode: 'DOCK-OUT-04',
        destinationLevelNo: null,
        status: 'IN_PROGRESS',
      },
    ],
  },
  {
    id: 'tr-seed-2045',
    requestCode: 'TR-2045',
    status: 'COMPLETED',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    mapVersionId: DEFAULT_MAP_VERSION_ID,
    workflowId: '00000000-0000-0000-0002-000000000003',
    workflowCode: 'INTERNAL_RELOCATION',
    workflowName: 'Reallocation',
    assignedRobotCode: 'AMR-01',
    linkedJobId: 'JOB-2026-0808',
    note: 'Zone A to Zone B consolidation completed',
    submittedAt: new Date(Date.now() - 65 * 60000).toISOString(),
    details: [
      {
        id: 'trd-2045-1',
        sequenceNo: 1,
        containerId: 'c-310',
        containerBarcode: 'BOX-105',
        productName: 'Control Relays',
        qty: 30,
        sourceStorageLocationId: 'a0000000-0000-0000-0005-000000000001',
        sourceEndpointId: '00000000-0000-0000-0004-000000000011',
        sourceEndpointCode: 'RACK-A-01 · Level 1',
        sourceLevelNo: 1,
        destinationStorageLocationId: 'b0000000-0000-0000-0005-000000000001',
        destinationStorageLocationCode: 'RACK-B-01',
        destinationEndpointId: '00000000-0000-0000-0004-000000000021',
        destinationEndpointCode: 'RACK-B-01 · Level 2',
        destinationLevelNo: 2,
        status: 'COMPLETED',
      },
    ],
  },
  {
    id: 'tr-seed-2044',
    requestCode: 'TR-2044',
    status: 'COMPLETED',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    mapVersionId: DEFAULT_MAP_VERSION_ID,
    workflowId: '00000000-0000-0000-0002-000000000004',
    workflowCode: 'POINT_TO_POINT_TRANSPORT',
    workflowName: 'Point-to-Point',
    assignedRobotCode: 'AMR-01',
    linkedJobId: 'JOB-2026-0808',
    note: 'Direct station transfer QA-02 ➔ ASSEMBLY-01',
    submittedAt: new Date(Date.now() - 110 * 60000).toISOString(),
    details: [
      {
        id: 'trd-2044-1',
        sequenceNo: 1,
        containerId: 'c-p01',
        containerBarcode: 'TOTE-QA-01',
        productName: 'Drive Assembly Kit',
        qty: 15,
        sourceStorageLocationId: null,
        sourceEndpointId: '00000000-0000-0000-0004-000000000031',
        sourceEndpointCode: 'QA-02',
        sourceLevelNo: null,
        destinationStorageLocationId: null,
        destinationStorageLocationCode: null,
        destinationEndpointId: '00000000-0000-0000-0004-000000000032',
        destinationEndpointCode: 'ASSEMBLY-01',
        destinationLevelNo: null,
        status: 'COMPLETED',
      },
    ],
  },
];

let nextTrSequence = 2049;
let nextJobSequence = 821;

export function getSeedTransportRequestsSnapshot(): TransportRequestListItem[] {
  return SEED_TRANSPORT_REQUESTS;
}

export async function createTransportRequest(
  body: CreateTransportRequestBody
): Promise<CreateTransportRequestResponse> {
  // Always reserve target rack slots in our local warehouse slotting state
  reserveStorageSlots(
    body.details.map((d) => ({
      storageLocationId: d.destinationStorageLocationId,
      levelNo: d.destinationLevelNo,
      barcode: d.containerBarcode || d.containerId,
      sku: d.productSku,
      productName: d.productName,
    }))
  );

  try {
    const res = await apiFetch<CreateTransportRequestResponse>(
      '/api/transportation/transport-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: body.warehouseId,
          mapVersionId: body.mapVersionId,
          workflowId: body.workflowId,
          workflowInputs: body.workflowInputs || {},
          note: body.note ?? null,
          details: body.details.map((d) => ({
            sequenceNo: d.sequenceNo,
            containerId: d.containerId,
            sourceStorageLocationId: d.sourceStorageLocationId,
            sourceEndpointId: d.sourceEndpointId,
            sourceLevelNo: d.sourceLevelNo,
            destinationStorageLocationId: d.destinationStorageLocationId,
            destinationEndpointId: d.destinationEndpointId,
            destinationLevelNo: d.destinationLevelNo,
          })),
        }),
      }
    );
    if (res?.id) {
      return res;
    }
  } catch (err) {
    if (__DEV__) {
      console.info('[TransportApi] Operating in reactive local store mode:', err);
    }
  }

  const requestCode = `TR-${nextTrSequence++}`;
  const reqId = `tr-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const detailItems: TransportRequestListDetail[] = body.details.map((d, idx) => {
    const dstCode = d.destinationStorageLocationCode
      ? `${d.destinationStorageLocationCode}${d.destinationLevelNo ? ` · Level ${d.destinationLevelNo}` : ''}`
      : d.destinationEndpointCode || 'Target Endpoint';
    const srcCode = d.sourceEndpointCode || 'Origin Station';

    return {
      id: `${reqId}-d-${idx + 1}`,
      sequenceNo: d.sequenceNo,
      containerId: d.containerId,
      containerBarcode: d.containerBarcode || d.containerId,
      productName: d.productName || 'Warehouse Tote',
      qty: d.qty || 1,
      sourceStorageLocationId: d.sourceStorageLocationId,
      sourceEndpointId: d.sourceEndpointId,
      sourceEndpointCode: srcCode,
      sourceLevelNo: d.sourceLevelNo,
      destinationStorageLocationId: d.destinationStorageLocationId,
      destinationStorageLocationCode: d.destinationStorageLocationCode || null,
      destinationEndpointId: d.destinationEndpointId,
      destinationEndpointCode: dstCode,
      destinationLevelNo: d.destinationLevelNo,
      status: 'SUBMITTED',
    };
  });

  const newListItem: TransportRequestListItem = {
    id: reqId,
    requestCode,
    status: 'SUBMITTED',
    warehouseId: body.warehouseId,
    mapVersionId: body.mapVersionId,
    workflowId: body.workflowId,
    workflowCode: body.workflowCode || 'INBOUND_PUTAWAY',
    workflowName: body.workflowName || 'Inbound Putaway',
    assignedRobotCode: 'AMR-01',
    linkedJobId: null,
    note: body.note || null,
    submittedAt: nowIso,
    details: detailItems,
  };

  SEED_TRANSPORT_REQUESTS = [newListItem, ...SEED_TRANSPORT_REQUESTS];

  return {
    id: reqId,
    requestCode,
    status: 'SUBMITTED',
    warehouseId: body.warehouseId,
    mapVersionId: body.mapVersionId,
    workflowId: body.workflowId,
    planSchemaVersion: 1,
    requestedBy: 'staff-operator',
    note: body.note || null,
    workflowInputs: body.workflowInputs || {},
    submittedAt: nowIso,
    details: detailItems.map((d) => ({
      id: d.id,
      sequenceNo: d.sequenceNo,
      containerId: d.containerId,
      sourceStorageLocationId: d.sourceStorageLocationId || null,
      sourceEndpointId: d.sourceEndpointId,
      sourceLevelNo: d.sourceLevelNo ?? null,
      destinationStorageLocationId: d.destinationStorageLocationId || null,
      destinationEndpointId: d.destinationEndpointId,
      destinationLevelNo: d.destinationLevelNo ?? null,
      status: 'SUBMITTED',
    })),
  };
}

export async function queueTransportRequest(id: string): Promise<QueueTransportRequestResponse> {
  try {
    const res = await apiFetch<QueueTransportRequestResponse>(
      `/api/transportation/transport-requests/${id}/queue`,
      {
        method: 'POST',
      }
    );
    if (res?.transportRequestId) {
      return res;
    }
  } catch {
    // Graceful local provisioning with strict 2-tote-max per AMR mission chunking
  }

  const targetReq = SEED_TRANSPORT_REQUESTS.find((r) => r.id === id || r.requestCode === id);
  const details = targetReq?.details || [];
  const requestCode = targetReq?.requestCode || `TR-${nextTrSequence}`;
  const nowIso = new Date().toISOString();

  // Chunk into batches of maximum 2 containers per AMR mission across AMR-01 and AMR-02
  const chunks: TransportRequestListDetail[][] = [];
  for (let i = 0; i < details.length; i += 2) {
    chunks.push(details.slice(i, i + 2));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const queuedJobs: QueuedJobResponse[] = [];
  const provisionedJobDetails: JobDetailResponse[] = [];

  chunks.forEach((chunk, chunkIdx) => {
    const jobNo = `JOB-2026-0${nextJobSequence++}`;
    const robotCode = chunkIdx % 2 === 0 ? 'AMR-01' : 'AMR-02';
    const batchKey = `BATCH-00${chunkIdx + 1}`;
    const firstDetail = chunk[0];
    const sourceCode = firstDetail?.sourceEndpointCode || 'DOCK-IN-01';
    const destSummary =
      chunk.map((c) => c.destinationEndpointCode).filter(Boolean).join(' ➔ ') || 'RACK-A-01 · Level 1';

    queuedJobs.push({
      jobId: jobNo,
      jobNo,
      batchKey,
      jobContainerCount: chunk.length,
      jobTaskCount: 2 + chunk.length,
      jobStepCount: 4 + chunk.length,
      assignedRobotCode: robotCode,
    });

    provisionedJobDetails.push({
      id: jobNo,
      jobNo,
      workflowId: targetReq?.workflowId || '00000000-0000-0000-0002-000000000001',
      mapVersionId: targetReq?.mapVersionId || DEFAULT_MAP_VERSION_ID,
      provisioningKey: `${id}:${batchKey}`,
      status: chunkIdx === 0 ? 'ASSIGNED' : 'QUEUED',
      contextValues: {
        batchKey,
        warehouseId: targetReq?.warehouseId || DEFAULT_WAREHOUSE_ID,
        batchSequenceNo: chunkIdx + 1,
        transportRequestId: requestCode,
        workflowCode: targetReq?.workflowCode || 'INBOUND_PUTAWAY',
        workflowName: targetReq?.workflowName || 'Inbound Putaway',
        assignedRobotCode: robotCode,
        sourceEndpointCode: sourceCode,
        destinationEndpointCode: firstDetail?.destinationEndpointCode || 'RACK-A-01 · Level 1',
        routeText: `${sourceCode} ➔ ${destSummary}`,
        currentStop: chunkIdx === 0 ? `Stop 1/${chunk.length + 1}: ${sourceCode}` : 'Queued for Next Carrier',
        containerMeta: chunk.map((c, idx) => ({
          code: c.containerBarcode || c.containerId,
          slot: idx === 0 ? 'Bay 1 (Front)' : 'Bay 2 (Rear)',
          action: 'UNLOAD',
          location: c.destinationEndpointCode || 'Storage Rack',
          product: c.productName || 'Warehouse Tote',
          qty: c.qty || 1,
        })),
      },
      createdAt: nowIso,
      queuedAt: nowIso,
      startedAt: chunkIdx === 0 ? nowIso : null,
      containers: chunk.map((c, idx) => ({
        id: `${jobNo}-c-${idx + 1}`,
        jobId: jobNo,
        transportRequestId: requestCode,
        containerId: c.containerBarcode || c.containerId,
        sequenceNo: idx + 1,
        status: chunkIdx === 0 ? 'ONBOARD' : 'ASSIGNED',
        loadedAt: chunkIdx === 0 ? nowIso : null,
      })),
      tasks: [
        {
          id: `${jobNo}-task-1`,
          jobId: jobNo,
          workflowTaskId: 'wf-task-pickup',
          sequenceNo: 1,
          status: chunkIdx === 0 ? 'READY' : 'PENDING',
          contextValues: {
            executionScope: 'PER_CONTAINER_AT_STOP',
            stopAction: 'DROPOFF',
            containerId: firstDetail?.containerBarcode || 'BOX-101',
            stopSequenceNo: 1,
          },
          steps: [
            {
              id: `${jobNo}-step-1`,
              jobTaskId: `${jobNo}-task-1`,
              workflowStepId: 'wf-step-handover',
              workflowStepKey: 'HANDOVER_CONFIRM',
              operationCode: 'DROPOFF_CONFIRM',
              stepType: 'HUMAN_INTERACTION',
              sequenceNo: 1,
              status: chunkIdx === 0 ? 'WAITING' : 'PENDING',
            },
          ],
        },
      ],
    });
  });

  if (provisionedJobDetails.length > 0) {
    registerProvisionedJobs(provisionedJobDetails);
  }

  // Update the transport request in SEED_TRANSPORT_REQUESTS to IN_PROGRESS and link its primary job
  SEED_TRANSPORT_REQUESTS = SEED_TRANSPORT_REQUESTS.map((r) => {
    if (r.id !== id && r.requestCode !== id) return r;
    return {
      ...r,
      status: 'IN_PROGRESS',
      assignedRobotCode: queuedJobs.length > 1 ? 'AMR-01 & AMR-02' : queuedJobs[0]?.assignedRobotCode || 'AMR-01',
      linkedJobId: queuedJobs[0]?.jobId || 'JOB-2026-0812',
      details: r.details.map((d) => ({ ...d, status: 'IN_PROGRESS' })),
    };
  });

  return {
    transportRequestId: id,
    requestCode,
    status: 'QUEUED',
    queuedAt: nowIso,
    jobs: queuedJobs,
  };
}

export async function listTransportRequests(params?: {
  warehouseId?: string;
  status?: string;
  search?: string;
  take?: number;
}): Promise<ListTransportRequestsResponse> {
  try {
    const query = new URLSearchParams();
    if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.take !== undefined) query.set('take', String(params.take));
    const qs = query.toString();
    const res = await apiFetch<ListTransportRequestsResponse>(
      `/api/transportation/transport-requests${qs ? `?${qs}` : ''}`
    );
    if (res?.items) {
      const [jobs, publishedWorkflows, liveContainers] = await Promise.all([
        listJobs().catch(() => []),
        listPublishedWorkflows().catch(() => ({ items: [] })),
        // The warehouse snapshot currently contains seeds only; prefer live metadata.
        Promise.all(Array.from(new Set(res.items.map((item) => item.warehouseId))).map(
          (warehouseId) => listContainers({ warehouseId }).then((result) => result.items).catch(() => []),
        )),
      ]);
      const containers = [...liveContainers.flat(), ...getContainersSnapshot()];
      const friendlyWorkflows = [
        { name: 'Inbound Putaway', code: 'INBOUND_PUTAWAY' },
        { name: 'Outbound Retrieval', code: 'OUTBOUND_RETRIEVAL' },
        { name: 'Reallocation', code: 'INTERNAL_RELOCATION' },
        { name: 'Replenishment', code: 'REPLENISHMENT' },
        { name: 'Point-to-Point', code: 'POINT_TO_POINT_TRANSPORT' },
      ];
      return {
        ...res,
        items: res.items.map((item) => {
          const workflow = publishedWorkflows.items.find((w) => w.id === item.workflowId);
          const friendly = friendlyWorkflows.find((w) => item.note?.startsWith(`${w.name}:`));
          const matchedJob = jobs.find((job) => {
            if (['JOB-2026-0812', 'JOB-2026-0819'].includes(job.id)) return false;
            const requestIds = (job as JobDetailResponse & { transportRequestIds?: string[] }).transportRequestIds;
            return (Array.isArray(requestIds) && requestIds.includes(item.id)) ||
              job.contextValues?.transportRequestId === item.id ||
              job.contextValues?.transportRequestId === item.requestCode ||
              job.containers?.some((c) => c.transportRequestId === item.id);
          });
          return {
            ...item,
            workflowCode: friendly?.code || workflow?.code || item.workflowCode,
            workflowName: friendly?.name || workflow?.name || item.workflowName,
            linkedJobId: matchedJob?.id || item.linkedJobId || null,
            assignedRobotCode: (matchedJob?.contextValues?.assignedRobotCode as string) || item.assignedRobotCode || 'AMR-01',
            details: (item.details || []).map((d) => {
              const matchedContainer = containers.find((c) => c.id === d.containerId || c.barcode === d.containerBarcode);
              return {
                ...d,
                containerBarcode: matchedContainer?.barcode || d.containerBarcode,
                productName: matchedContainer?.productName || 'Thùng linh kiện demo',
                qty: matchedContainer?.qty || 20,
              };
            }),
          };
        }),
      };
    }
  } catch {
    // Fallback to reactive in-memory transport request store
  }

  let items = [...SEED_TRANSPORT_REQUESTS];
  if (params?.status) {
    items = items.filter((i) => i.status === params.status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase().trim();
    items = items.filter(
      (i) =>
        i.requestCode.toLowerCase().includes(q) ||
        (i.workflowCode || '').toLowerCase().includes(q) ||
        (i.note || '').toLowerCase().includes(q) ||
        i.details.some((d) => (d.containerBarcode || '').toLowerCase().includes(q))
    );
  }
  const sliced = params?.take ? items.slice(0, params.take) : items;
  return {
    items: sliced,
    total: items.length,
  };
}

export function getTransportRequest(id: string) {
  return apiFetch<CreateTransportRequestResponse>(
    `/api/transportation/transport-requests/${id}`
  );
}
