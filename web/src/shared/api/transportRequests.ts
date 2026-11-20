import { apiRequest } from './client'
import type { ActionAvailability, TransportRequestAction, TransportRequestStatus } from './contracts'

export interface CreateTransportRequestDetailBody {
  sequenceNo: number
  containerId: string
  sourceStorageLocationId: string | null
  sourceEndpointId: string
  sourceLevelNo: number | null
  destinationStorageLocationId: string | null
  destinationEndpointId: string
  destinationLevelNo: number | null
}

export interface CreateTransportRequestBody {
  warehouseId: string
  mapVersionId: string
  workflowId: string
  workflowInputs: Record<string, unknown>
  note: string | null
  details: CreateTransportRequestDetailBody[]
  /** FL-07: -1 low, 0 normal, 1 high. */
  priority?: number
  deadlineAt?: string | null
}

export interface TransportRequestDetailResponse {
  id: string
  sequenceNo: number
  containerId: string
  sourceStorageLocationId: string | null
  sourceEndpointId: string
  sourceLevelNo: number | null
  destinationStorageLocationId: string | null
  destinationEndpointId: string
  destinationLevelNo: number | null
  status: string
}

export interface CreateTransportRequestResponse {
  id: string
  requestCode: string
  status: string
  warehouseId: string
  mapVersionId: string
  workflowId: string
  planSchemaVersion: number
  requestedBy: string
  requestedByName?: string | null
  note: string | null
  workflowInputs: Record<string, unknown>
  submittedAt: string
  details: TransportRequestDetailResponse[]
}

export interface TransportRequestListDetail {
  id: string
  sequenceNo: number
  containerId: string
  containerBarcode: string | null
  sourceEndpointId: string
  sourceEndpointCode: string | null
  destinationEndpointId: string
  destinationEndpointCode: string | null
  status: string
}

export interface TransportRequestListItem {
  id: string
  requestCode: string
  status: TransportRequestStatus | string
  warehouseId: string
  mapVersionId: string
  workflowId: string
  requestedBy: string
  requestedByName?: string | null
  note: string | null
  submittedAt: string
  detailCount: number
  details: TransportRequestListDetail[]
  availableActions: ActionAvailability<TransportRequestAction>[]
}

export interface ListTransportRequestsResponse {
  items: TransportRequestListItem[]
  total: number
}

export interface TransportRequestDetailItem {
  id: string
  sequenceNo: number
  containerId: string
  containerBarcode: string | null
  sourceStorageLocationId: string | null
  sourceStorageLocationCode: string | null
  sourceEndpointId: string
  sourceEndpointCode: string | null
  sourceEndpointName: string | null
  sourceLevelNo: number | null
  destinationStorageLocationId: string | null
  destinationStorageLocationCode: string | null
  destinationEndpointId: string
  destinationEndpointCode: string | null
  destinationEndpointName: string | null
  destinationLevelNo: number | null
  status: string
}

export interface TransportRequestDetailDto {
  id: string
  requestCode: string
  status: TransportRequestStatus | string
  warehouseId: string
  mapVersionId: string
  workflowId: string
  planSchemaVersion: number
  requestedBy: string
  requestedByName?: string | null
  note: string | null
  workflowInputs: Record<string, unknown>
  submittedAt: string
  queuedAt: string | null
  completedAt: string | null
  failureCode: string | null
  failureMessage: string | null
  details: TransportRequestDetailItem[]
  cancelledBy: string | null
  cancelReason: string | null
  cancelRequestedAt: string | null
  rejectedBy: string | null
  rejectReason: string | null
  rejectedAt: string | null
  jobs: { jobId: string; jobNo: string; status: string; transportRequestId: string }[]
  availableActions: ActionAvailability<TransportRequestAction>[]
}

export function createTransportRequest(body: CreateTransportRequestBody) {
  return apiRequest<CreateTransportRequestResponse>('/api/transportation/transport-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listTransportRequests(params?: {
  warehouseId?: string
  status?: string
  search?: string
  /** Only these requests (at most 100): turns the request ids on a Job list into codes. */
  ids?: string[]
  skip?: number
  take?: number
}) {
  const query = new URLSearchParams()
  if (params?.warehouseId) query.set('warehouseId', params.warehouseId)
  if (params?.status) query.set('status', params.status)
  if (params?.search) query.set('search', params.search)
  for (const id of params?.ids ?? []) query.append('ids', id)
  if (params?.skip !== undefined) query.set('skip', String(params.skip))
  if (params?.take !== undefined) query.set('take', String(params.take))
  const qs = query.toString()
  return apiRequest<ListTransportRequestsResponse>(
    `/api/transportation/transport-requests${qs ? `?${qs}` : ''}`,
  )
}

export function getTransportRequest(id: string) {
  return apiRequest<TransportRequestDetailDto>(`/api/transportation/transport-requests/${id}`)
}

/** POST /api/transportation/transport-requests/{id}/queue result: the Jobs planned for the request. */
export interface QueueTransportRequestResponse {
  transportRequestId: string
  requestCode: string
  status: string
  queuedAt: string | null
  jobs: { jobId: string; jobNo: string; batchKey: string; jobContainerCount: number; jobTaskCount: number; jobStepCount: number }[]
}

/** Plans the request into Job(s) (status QUEUED). The Jobs stay CREATED until started. */
export function queueTransportRequest(id: string) {
  return apiRequest<QueueTransportRequestResponse>(`/api/transportation/transport-requests/${id}/queue`, {
    method: 'POST',
  })
}

/** TRN-03 options of a cancel: why (as a code), a key that makes a retry safe, and some details only. */
export interface CancelTransportRequestOptions {
  reasonCode?: string
  /** Same key, same cancellation: a double click or a retried request never cancels twice. */
  idempotencyKey?: string
  /** Cancel only these details (not picked up yet). Empty = the whole request. */
  detailIds?: string[]
}

/**
 * TRN-01 / TRN-03: starts the cancellation of the request. Containers not picked up are cancelled; a robot carrying
 * cargo is stopped and its Job held, and the request stays CANCELLING until that cargo is delivered or unloaded by
 * scan. Follow it with getCancellation. Idempotent.
 */
export function cancelTransportRequest(id: string, reason: string, options: CancelTransportRequestOptions = {}) {
  return apiRequest<TransportRequestDetailDto>(`/api/transportation/transport-requests/${id}/cancel`, {
    method: 'POST',
    headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    body: JSON.stringify({ reason, reasonCode: options.reasonCode, detailIds: options.detailIds }),
  })
}

export interface CancelPreviewJob {
  jobId: string
  jobNo: string
  jobStatus: string
  robotId: string | null
  robotCode: string | null
  robotOnline: boolean
  delivered: number
  onRobot: number
  notPickedUp: number
  total: number
}

export interface CancelPreviewDetail {
  detailId: string
  sequenceNo: number
  containerId: string
  containerBarcode: string | null
  detailStatus: string
  jobContainerStatus: string | null
  jobNo: string | null
  canCancelAlone: boolean
  cannotCancelAloneReason: string | null
}

/** GET .../cancel-preview: what a cancel would do now. The cancel itself checks everything again. */
export interface CancelPreview {
  transportRequestId: string
  requestCode: string
  requestStatus: string
  canCancel: boolean
  cannotCancelReason: string | null
  totalContainers: number
  delivered: number
  onRobot: number
  notPickedUp: number
  alreadyClosed: number
  jobs: CancelPreviewJob[]
  details: CancelPreviewDetail[]
  reasonCodes: string[]
}

export type CancellationStatus = 'REQUESTED' | 'STOPPING' | 'WAITING_ROBOT' | 'RECOVERING' | 'MANUAL_INTERVENTION' | 'FINALIZED'
export type CancellationStage =
  | 'PENDING'
  | 'STOP_REQUESTED'
  | 'WAITING_ROBOT'
  | 'CARGO_ON_ROBOT'
  | 'DELIVERING'
  | 'MANUAL'
  | 'DONE'

export interface CancellationContainer {
  containerId: string
  barcode: string | null
  jobContainerStatus: string
  resolution: string | null
  storageLocationId: string | null
  levelNo: number | null
  handedOverAt: string | null
}

export interface CancellationItem {
  jobId: string
  jobNo: string
  jobStatus: string
  robotId: string | null
  robotCode: string | null
  robotOnline: boolean
  robotMotionHeld: boolean
  stage: CancellationStage
  canHandOver: boolean
  canDeliver: boolean
  containers: CancellationContainer[]
}

/** GET .../cancellation: the latest cancellation of a request and where it stands. */
export interface Cancellation {
  id: string
  transportRequestId: string
  scope: 'REQUEST' | 'DETAILS'
  targetDetailIds: string[] | null
  status: CancellationStatus
  reasonCode: string
  reason: string | null
  requestedBy: string | null
  requestedAt: string
  finalizedAt: string | null
  lastError: string | null
  delivered: number
  handedOver: number
  notPickedUp: number
  onRobot: number
  needsAttention: number
  items: CancellationItem[]
}

export function getCancelPreview(id: string) {
  return apiRequest<CancelPreview>(`/api/transportation/transport-requests/${id}/cancel-preview`)
}

/** Null when the request was never cancelled (204). */
export async function getCancellation(id: string): Promise<Cancellation | null> {
  return (await apiRequest<Cancellation | undefined>(`/api/transportation/transport-requests/${id}/cancellation`)) ?? null
}

/** Deliver the cargo on a stopped robot anyway: its Job resumes and only drops off what is on board. */
export function deliverCancelledCargo(requestId: string, jobId: string) {
  return apiRequest<Cancellation>(`/api/transportation/transport-requests/${requestId}/cancellation/jobs/${jobId}/deliver`, {
    method: 'POST',
  })
}

/** TRN-02: refuses a request before any of its Jobs ran. The requester is notified. */
export function rejectTransportRequest(id: string, reason: string) {
  return apiRequest<TransportRequestDetailDto>(`/api/transportation/transport-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
