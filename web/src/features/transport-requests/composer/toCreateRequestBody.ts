import type { CreateTransportRequestBody } from '@/shared/api/transportRequests'
import type { TransportRequestDraft } from './types'

/** Coerce STAFF_INPUT string values to JSON-friendly types for the create payload. */
export function coerceWorkflowInputValue(dataType: string, raw: string): unknown {
  const trimmed = raw.trim()
  switch (dataType.toUpperCase()) {
    case 'INTEGER': {
      const n = Number.parseInt(trimmed, 10)
      return Number.isFinite(n) ? n : trimmed
    }
    case 'DECIMAL': {
      const n = Number.parseFloat(trimmed)
      return Number.isFinite(n) ? n : trimmed
    }
    case 'BOOLEAN': {
      const lower = trimmed.toLowerCase()
      if (lower === 'true' || lower === 'yes' || lower === '1') return true
      if (lower === 'false' || lower === 'no' || lower === '0') return false
      return trimmed
    }
    case 'UUID':
    case 'DATETIME':
    case 'STRING':
    default:
      return trimmed
  }
}

/**
 * Maps the UI draft to the backend create body.
 * Never sends id, requestCode, requestedBy, status, or planSchemaVersion.
 */
export function toCreateRequestBody(
  draft: TransportRequestDraft,
  staffInputTypes: Record<string, string> = {},
): CreateTransportRequestBody {
  const workflowInputs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft.workflowInputs)) {
    if (value === '') continue
    workflowInputs[key] = coerceWorkflowInputValue(staffInputTypes[key] ?? 'STRING', value)
  }

  return {
    warehouseId: draft.warehouseId,
    mapVersionId: draft.mapVersionId,
    workflowId: draft.workflowId,
    workflowInputs,
    note: draft.note,
    details: draft.movements.map((movement) => ({
      sequenceNo: movement.sequenceNo,
      containerId: movement.containerId,
      sourceStorageLocationId: movement.sourceStorageLocationId,
      sourceEndpointId: movement.sourceEndpointId,
      sourceLevelNo: movement.sourceLevelNo,
      destinationStorageLocationId: movement.destinationStorageLocationId,
      destinationEndpointId: movement.destinationEndpointId,
      destinationLevelNo: movement.destinationLevelNo,
    })),
  }
}
