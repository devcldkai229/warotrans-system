import { apiFetch, ApiError } from './client';
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

export interface OutboundFifoSelection {
  productId: string;
  containerCount: number;
}

export interface OutboundPickPreviewRequest {
  warehouseId: string;
  mapVersionId: string;
  productId: string;
  containerCount: number;
  destinationEndpointId: string;
}

export interface OutboundPickItem {
  barcode: string;
  sourceStorageLocationCode: string;
  admittedAt: string;
  detail: CreateTransportRequestDetailBody;
}

export interface OutboundPickResponse {
  requestedCount: number;
  isComplete: boolean;
  items: OutboundPickItem[];
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
  outboundFifo?: OutboundFifoSelection | null;
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

export interface TransportRequestDetailItem extends TransportRequestDetailResponse {
  containerBarcode: string | null;
  sourceStorageLocationCode: string | null;
  sourceEndpointCode: string | null;
  sourceEndpointName: string | null;
  destinationStorageLocationCode: string | null;
  destinationEndpointCode: string | null;
  destinationEndpointName: string | null;
}
/** BOTH-04: what the server allows on this request now, for this user (the same list the web console reads). */
export type TransportRequestAction = 'QUEUE' | 'CANCEL' | 'REJECT';
export interface ActionAvailability<A extends string = string> { action: A; allowed: boolean; reason?: string | null }
export interface TransportRequestResponse extends CreateTransportRequestResponse {
  availableActions?: ActionAvailability<TransportRequestAction>[];
  queuedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  details: TransportRequestDetailItem[];
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

function validOutboundPickItem(item: OutboundPickItem | null | undefined, destinationEndpointId: string): item is OutboundPickItem {
  const detail = item?.detail;
  return !!item && typeof item.barcode === 'string' && !!item.barcode.trim()
    && typeof item.sourceStorageLocationCode === 'string' && !!item.sourceStorageLocationCode.trim()
    && typeof item.admittedAt === 'string' && !!item.admittedAt.trim()
    && !!detail && Number.isInteger(detail.sequenceNo) && detail.sequenceNo > 0
    && typeof detail.containerId === 'string' && !!detail.containerId.trim()
    && typeof detail.sourceStorageLocationId === 'string' && !!detail.sourceStorageLocationId.trim()
    && typeof detail.sourceEndpointId === 'string' && !!detail.sourceEndpointId.trim()
    && typeof detail.destinationEndpointId === 'string' && detail.destinationEndpointId === destinationEndpointId;
}

export async function previewOutboundPick(body: OutboundPickPreviewRequest, signal?: AbortSignal): Promise<OutboundPickResponse> {
  const result = await apiFetch<OutboundPickResponse>('/api/transportation/transport-requests/outbound-pick-preview', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      warehouseId: body.warehouseId,
      mapVersionId: body.mapVersionId,
      productId: body.productId,
      containerCount: body.containerCount,
      destinationEndpointId: body.destinationEndpointId,
    }),
  });
  if (!result || result.requestedCount !== body.containerCount || typeof result.isComplete !== 'boolean'
    || !Array.isArray(result.items) || result.items.length > body.containerCount
    || (result.isComplete && result.items.length !== body.containerCount)
    || !result.items.every(item => validOutboundPickItem(item, body.destinationEndpointId))) {
    throw new ApiError(502, 'outbound_pick_preview_invalid', 'Could not verify the outbound FIFO preview. Try again.');
  }
  return result;
}

export function createTransportRequest(body: CreateTransportRequestBody) {
  return apiFetch<CreateTransportRequestResponse>('/api/transportation/transport-requests', {
    method: 'POST', body: JSON.stringify({
      warehouseId: body.warehouseId, mapVersionId: body.mapVersionId, workflowId: body.workflowId,
      workflowInputs: body.workflowInputs || {}, note: body.note || null,
      ...(body.outboundFifo ? { outboundFifo: { productId: body.outboundFifo.productId, containerCount: body.outboundFifo.containerCount } } : {}),
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
/**
 * Cancels the request and its Jobs (idempotent; a reason is required: 400 reason_required). Cargo already on a robot keeps
 * the request CANCELLING until it is unloaded.
 */
export function cancelTransportRequest(id: string, reason: string) {
  return apiFetch<TransportRequestResponse>(`/api/transportation/transport-requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
/** Refuses a request before any of its Jobs ran (supervisor right); the requester is notified. */
export function rejectTransportRequest(id: string, reason: string) {
  return apiFetch<TransportRequestResponse>(`/api/transportation/transport-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export function isActionAllowed(request: Pick<TransportRequestResponse, 'availableActions'> | null | undefined, action: TransportRequestAction) {
  return Boolean(request?.availableActions?.some(item => item.action === action && item.allowed));
}
export async function getTransportRequest(id: string) {
  const response = await apiFetch<TransportRequestResponse>(`/api/transportation/transport-requests/${id}`);
  if (response.id !== id) throw new ApiError(502, 'request_identity_mismatch', 'The server returned a different transport request.');
  return response;
}
export async function listTransportRequests(params: { warehouseId?: string; status?: string; search?: string; take?: number } = {}): Promise<ListTransportRequestsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
  const response = await apiFetch<ListTransportRequestsResponse>(`/api/transportation/transport-requests${query.size ? `?${query}` : ''}`);
  if (!response.items.length) return response;
  const [workflows, containerLists] = await Promise.all([
    listPublishedWorkflows().catch(() => ({ items: [] })),
    Promise.all([...new Set(response.items.map(item => item.warehouseId))].map(warehouseId =>
      listContainers({ warehouseId, take: 100 }).then(result => result.items).catch(() => []))),
  ]);
  return { ...response, items: response.items.map(item => {
    const workflow = workflows.items.find(candidate => candidate.id === item.workflowId);
    return { ...item,
      workflowCode: workflow?.code || item.workflowCode,
      workflowName: workflow?.name || item.workflowName || item.workflowCode || 'Workflow',
      details: item.details.map(detail => {
        const container = containerLists.flat().find(candidate => candidate.id === detail.containerId);
        return { ...detail, containerBarcode: container?.barcode || detail.containerBarcode,
          productName: container?.productName || detail.productName, qty: 1 };
      }),
    };
  }) };
}
