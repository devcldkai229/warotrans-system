import { apiFetch } from './client';
import { listJobs } from './executionApi';
import { listPublishedWorkflows } from './workflowApi';
import { listContainers } from './warehouseApi';
import type { TransportRequestStatus } from '../types/contracts';

export interface CreateTransportRequestDetailBody {
  sequenceNo: number;
  containerId: string;
  sourceStorageLocationId: string | null;
  sourceEndpointId: string;
  sourceLevelNo: number | null;
  destinationStorageLocationId: string | null;
  destinationEndpointId: string;
  destinationLevelNo: number | null;
  // Client display metadata is omitted from the command payload.
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

export function createTransportRequest(body: CreateTransportRequestBody) {
  return apiFetch<CreateTransportRequestResponse>('/api/transportation/transport-requests', {
    method: 'POST', body: JSON.stringify({
      warehouseId: body.warehouseId, mapVersionId: body.mapVersionId, workflowId: body.workflowId,
      workflowInputs: body.workflowInputs || {}, note: body.note || null,
      details: body.details.map(({ sequenceNo, containerId, sourceStorageLocationId, sourceEndpointId, sourceLevelNo,
        destinationStorageLocationId, destinationEndpointId, destinationLevelNo }) => ({
        sequenceNo, containerId, sourceStorageLocationId, sourceEndpointId, sourceLevelNo,
        destinationStorageLocationId, destinationEndpointId, destinationLevelNo,
      })),
    }),
  });
}
export function queueTransportRequest(id: string) {
  return apiFetch<QueueTransportRequestResponse>(`/api/transportation/transport-requests/${id}/queue`, { method: 'POST' });
}
export function getTransportRequest(id: string) {
  return apiFetch<CreateTransportRequestResponse>(`/api/transportation/transport-requests/${id}`);
}
export async function listTransportRequests(params: { warehouseId?: string; status?: string; search?: string; take?: number } = {}): Promise<ListTransportRequestsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
  const response = await apiFetch<ListTransportRequestsResponse>(`/api/transportation/transport-requests${query.size ? `?${query}` : ''}`);
  if (!response.items.length) return response;
  const [jobs, workflows, containerLists] = await Promise.all([
    listJobs().catch(() => []), listPublishedWorkflows().catch(() => ({ items: [] })),
    Promise.all([...new Set(response.items.map(item => item.warehouseId))].map(warehouseId =>
      listContainers({ warehouseId, take: 100 }).then(result => result.items).catch(() => []))),
  ]);
  return { ...response, items: response.items.map(item => {
    const workflow = workflows.items.find(candidate => candidate.id === item.workflowId);
    const job = jobs.find(candidate => candidate.containers.some(container => container.transportRequestId === item.id));
    return { ...item,
      workflowCode: workflow?.code || item.workflowCode,
      workflowName: workflow?.name || item.workflowName || item.workflowCode || 'Workflow',
      linkedJobId: job?.id || item.linkedJobId || null,
      assignedRobotCode: String(job?.contextValues?.assignedRobotCode || item.assignedRobotCode || 'Unassigned'),
      details: item.details.map(detail => {
        const container = containerLists.flat().find(candidate => candidate.id === detail.containerId);
        return { ...detail, containerBarcode: container?.barcode || detail.containerBarcode,
          productName: container?.productName || detail.productName, qty: 1 };
      }),
    };
  }) };
}
