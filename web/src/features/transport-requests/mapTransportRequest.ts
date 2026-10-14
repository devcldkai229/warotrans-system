import type {
  JobStatus,
  TransportRequestDetailStatus,
  TransportRequestStatus,
  TransportRequestView,
} from '@/shared/api/contracts'
import type {
  TransportRequestDetailDto,
  TransportRequestListItem,
} from '@/shared/api/transportRequests'

function endpointLabel(code: string | null | undefined, name: string | null | undefined, fallbackId: string) {
  return name?.trim() || code?.trim() || fallbackId.slice(0, 8)
}

function locationOrEndpoint(
  locationCode: string | null | undefined,
  endpointCode: string | null | undefined,
  endpointName: string | null | undefined,
  endpointId: string,
) {
  return locationCode?.trim() || endpointLabel(endpointCode, endpointName, endpointId)
}

export function listItemToView(
  item: TransportRequestListItem,
  workflowNameById: Map<string, string>,
): TransportRequestView {
  return {
    id: item.id,
    requestCode: item.requestCode,
    warehouseId: item.warehouseId,
    workflowId: item.workflowId,
    requestedBy: item.requestedBy,
    status: item.status as TransportRequestStatus,
    note: item.note,
    submittedAt: item.submittedAt,
    queuedAt: null,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    workflowName: workflowNameById.get(item.workflowId) ?? '—',
    requestedByName: item.requestedBy.slice(0, 8),
    details: item.details.map((detail) => ({
      id: detail.id,
      transportRequestId: item.id,
      sequenceNo: detail.sequenceNo,
      containerId: detail.containerId,
      sourceStorageLocationId: null,
      sourceEndpointId: detail.sourceEndpointId,
      sourceLevelNo: 0,
      destinationStorageLocationId: null,
      destinationEndpointId: detail.destinationEndpointId,
      destinationLevelNo: 0,
      status: detail.status as TransportRequestDetailStatus,
      containerBarcode: detail.containerBarcode ?? detail.containerId.slice(0, 8),
      sourceLabel: detail.sourceEndpointCode ?? detail.sourceEndpointId.slice(0, 8),
      destinationLabel: detail.destinationEndpointCode ?? detail.destinationEndpointId.slice(0, 8),
    })),
    jobs: [],
    availableActions: item.status === 'SUBMITTED' || item.status === 'QUEUED' ? ['CANCEL'] : [],
  }
}

export function detailToView(
  detail: TransportRequestDetailDto,
  workflowNameById: Map<string, string>,
): TransportRequestView {
  return {
    id: detail.id,
    requestCode: detail.requestCode,
    warehouseId: detail.warehouseId,
    workflowId: detail.workflowId,
    requestedBy: detail.requestedBy,
    status: detail.status as TransportRequestStatus,
    note: detail.note,
    submittedAt: detail.submittedAt,
    queuedAt: detail.queuedAt,
    completedAt: detail.completedAt,
    failureCode: detail.failureCode,
    failureMessage: detail.failureMessage,
    workflowName: workflowNameById.get(detail.workflowId) ?? '—',
    requestedByName: detail.requestedBy.slice(0, 8),
    details: detail.details.map((line) => ({
      id: line.id,
      transportRequestId: detail.id,
      sequenceNo: line.sequenceNo,
      containerId: line.containerId,
      sourceStorageLocationId: line.sourceStorageLocationId,
      sourceEndpointId: line.sourceEndpointId,
      sourceLevelNo: line.sourceLevelNo ?? 0,
      destinationStorageLocationId: line.destinationStorageLocationId,
      destinationEndpointId: line.destinationEndpointId,
      destinationLevelNo: line.destinationLevelNo ?? 0,
      status: line.status as TransportRequestDetailStatus,
      containerBarcode: line.containerBarcode ?? line.containerId.slice(0, 8),
      sourceLabel: locationOrEndpoint(
        line.sourceStorageLocationCode,
        line.sourceEndpointCode,
        line.sourceEndpointName,
        line.sourceEndpointId,
      ),
      destinationLabel: locationOrEndpoint(
        line.destinationStorageLocationCode,
        line.destinationEndpointCode,
        line.destinationEndpointName,
        line.destinationEndpointId,
      ),
    })),
    jobs: [],
    availableActions: detail.status === 'SUBMITTED' || detail.status === 'QUEUED' ? ['CANCEL'] : [],
  }
}

/** Placeholder until Jobs are linked from a read API. */
export function emptyJobs(): { jobNo: string; status: JobStatus; robotCode: string | null }[] {
  return []
}
