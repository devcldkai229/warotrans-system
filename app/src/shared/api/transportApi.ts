import { apiFetch } from './client';
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
}

export interface CreateTransportRequestBody {
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
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
  sourceEndpointId: string;
  sourceEndpointCode: string | null;
  destinationEndpointId: string;
  destinationEndpointCode: string | null;
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
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function queueTransportRequest(id: string) {
  return apiFetch<QueueTransportRequestResponse>(
    `/api/transportation/transport-requests/${id}/queue`,
    {
      method: 'POST',
    },
  );
}

export function listTransportRequests(params?: {
  warehouseId?: string;
  status?: string;
  search?: string;
  take?: number;
}) {
  const query = new URLSearchParams();
  if (params?.warehouseId) query.set('warehouseId', params.warehouseId);
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.take !== undefined) query.set('take', String(params.take));
  const qs = query.toString();
  return apiFetch<ListTransportRequestsResponse>(
    `/api/transportation/transport-requests${qs ? `?${qs}` : ''}`,
  );
}

export function getTransportRequest(id: string) {
  return apiFetch<CreateTransportRequestResponse>(
    `/api/transportation/transport-requests/${id}`,
  );
}
