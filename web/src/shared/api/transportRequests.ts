import { apiRequest } from './client'
import type { TransportRequestStatus } from './contracts'

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
  note: string | null
  submittedAt: string
  detailCount: number
  details: TransportRequestListDetail[]
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
  note: string | null
  workflowInputs: Record<string, unknown>
  submittedAt: string
  queuedAt: string | null
  completedAt: string | null
  failureCode: string | null
  failureMessage: string | null
  details: TransportRequestDetailItem[]
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
  take?: number
}) {
  const query = new URLSearchParams()
  if (params?.warehouseId) query.set('warehouseId', params.warehouseId)
  if (params?.status) query.set('status', params.status)
  if (params?.search) query.set('search', params.search)
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
