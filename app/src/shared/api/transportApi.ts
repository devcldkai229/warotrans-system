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

export type WarehouseStockPostingStatus = 'PENDING' | 'RETRYING' | 'POSTED';

export interface WarehouseStockPostingResponse {
  jobId: string;
  status: WarehouseStockPostingStatus | string;
  recordedAt: string;
  postedAt: string | null;
  nextAttemptAt: string | null;
}

export interface WarehouseHandoverSyncResponse {
  pickup: WarehouseStockPostingResponse | null;
  delivery: WarehouseStockPostingResponse | null;
}

export interface TransportRequestDetailItem extends TransportRequestDetailResponse {
  containerBarcode: string | null;
  sourceStorageLocationCode: string | null;
  sourceEndpointCode: string | null;
  sourceEndpointName: string | null;
  destinationStorageLocationCode: string | null;
  destinationEndpointCode: string | null;
  destinationEndpointName: string | null;
  warehouseSync?: WarehouseHandoverSyncResponse | null;
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
export function cancelTransportRequest(id: string, reason: string, options: CancelTransportRequestOptions = {}) {
  return apiFetch<TransportRequestResponse>(`/api/transportation/transport-requests/${id}/cancel`, {
    method: 'POST',
    headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    body: JSON.stringify({ reason, reasonCode: options.reasonCode, detailIds: options.detailIds }),
  });
}
/** TRN-03: why (code), a key that makes a retry safe, and optionally only some details not picked up yet. */
export interface CancelTransportRequestOptions { reasonCode?: string; idempotencyKey?: string; detailIds?: string[] }
export interface CancelPreviewJob {
  jobId: string; jobNo: string; jobStatus: string; robotId: string | null; robotCode: string | null; robotOnline: boolean;
  delivered: number; onRobot: number; notPickedUp: number; total: number;
}
export interface CancelPreviewDetail {
  detailId: string; sequenceNo: number; containerId: string; containerBarcode: string | null; detailStatus: string;
  jobContainerStatus: string | null; jobNo: string | null; canCancelAlone: boolean; cannotCancelAloneReason: string | null;
}
/** What a cancel would do now (TRN-03 Cancel Impact Preview). The cancel checks everything again. */
export interface CancelPreview {
  transportRequestId: string; requestCode: string; requestStatus: string; canCancel: boolean; cannotCancelReason: string | null;
  totalContainers: number; delivered: number; onRobot: number; notPickedUp: number; alreadyClosed: number;
  jobs: CancelPreviewJob[]; details: CancelPreviewDetail[]; reasonCodes: string[];
}
export type CancellationStatus =
  | 'REQUESTED' | 'STOPPING' | 'WAITING_ROBOT' | 'RECOVERING' | 'MANUAL_INTERVENTION' | 'PARKING_ROBOTS' | 'FINALIZED';
export type CancellationStage =
  | 'PENDING' | 'STOP_REQUESTED' | 'WAITING_ROBOT' | 'CARGO_ON_ROBOT' | 'DELIVERING' | 'TO_RECOVERY' | 'AT_RECOVERY' | 'AT_DROPOFF'
  | 'HANDOVER_REQUESTED' | 'SAFE_STOP' | 'MANUAL' | 'DONE';
/** Where the robot is in its trip (TRN-03 destination policy). */
export type CancelRobotPhase =
  | 'UNKNOWN' | 'NOT_STARTED' | 'TO_PICKUP' | 'AT_PICKUP' | 'IN_TRANSIT' | 'AT_DROPOFF' | 'TO_RECOVERY' | 'AT_RECOVERY' | 'DONE';
export type CancellationAction = 'CONTINUE_DELIVERY' | 'SEND_TO_RECOVERY' | 'REQUEST_MANUAL_HANDOVER' | 'UNLOAD_BY_SCAN';
/** A wait / queue point (Wait = Queue = Recovery Point). */
export interface RecoveryPoint { endpointId: string; code: string; name: string; free: boolean; distanceMeters: number | null }
export interface CancellationContainer {
  containerId: string; barcode: string | null; jobContainerStatus: string; resolution: string | null;
  storageLocationId: string | null; levelNo: number | null; handedOverAt: string | null;
}
export interface CancellationItem {
  jobId: string; jobNo: string; jobStatus: string; robotId: string | null; robotCode: string | null; robotOnline: boolean;
  robotMotionHeld: boolean; stage: CancellationStage; canHandOver: boolean; canDeliver: boolean; containers: CancellationContainer[];
  phase?: CancelRobotPhase | null; initialPhase?: CancelRobotPhase | null; robotLocalized?: boolean; recoveryPointCode?: string | null;
  handoverRequestedAt?: string | null; destinationStatus?: 'PENDING' | 'SENT' | 'NOT_NEEDED' | 'SKIPPED' | 'OFF' | null;
  destinationEndpointCode?: string | null; destinationNote?: string | null;
  actions?: CancellationAction[] | null; blockedActions?: Partial<Record<CancellationAction, string>> | null;
}
/** The latest cancellation of a request and where it stands (TRN-03). */
export interface Cancellation {
  id: string; transportRequestId: string; scope: 'REQUEST' | 'DETAILS'; targetDetailIds: string[] | null; status: CancellationStatus;
  reasonCode: string; reason: string | null; requestedBy: string | null; requestedAt: string; finalizedAt: string | null;
  lastError: string | null; delivered: number; handedOver: number; notPickedUp: number; onRobot: number; needsAttention: number;
  items: CancellationItem[];
}
export function getCancelPreview(id: string) {
  return apiFetch<CancelPreview>(`/api/transportation/transport-requests/${id}/cancel-preview`);
}
/** Null when the request was never cancelled (204). */
export async function getCancellation(id: string): Promise<Cancellation | null> {
  return (await apiFetch<Cancellation | undefined>(`/api/transportation/transport-requests/${id}/cancellation`)) ?? null;
}
/** A container was taken off a stopped robot, scanned, and put on this shelf (it leaves the Job; Warehouse stores it there). */
export function handOverCancelledCargo(requestId: string, jobId: string, body: {
  containerId: string; scannedBarcode: string; storageLocationId: string; levelNo?: number; note?: string;
}) {
  return apiFetch<Cancellation>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/handover`, {
    method: 'POST', body: JSON.stringify(body),
  });
}
/** Deliver the cargo on a stopped robot anyway: its Job resumes and only drops off what is on board. */
export function deliverCancelledCargo(requestId: string, jobId: string) {
  return apiFetch<Cancellation>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/deliver`, { method: 'POST' });
}
/** Wait / queue points the Job's robot could take its cancelled cargo to, free and nearest first. */
export function getRecoveryPoints(requestId: string, jobId: string) {
  return apiFetch<RecoveryPoint[]>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/recovery-points`);
}
/** The stopped robot takes its cargo to a recovery point (nearest free when none is given) and holds still there. */
export function sendCancelledCargoToRecovery(requestId: string, jobId: string, endpointId?: string | null) {
  return apiFetch<Cancellation>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/recovery`, {
    method: 'POST', body: JSON.stringify({ endpointId: endpointId ?? null }),
  });
}
/** Ask a person to come and unload the stopped robot where it stands (an issue for the staff). */
export function requestManualCargoHandover(requestId: string, jobId: string, note?: string | null) {
  return apiFetch<Cancellation>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/manual-handover`, {
    method: 'POST', body: JSON.stringify({ note: note ?? null }),
  });
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
