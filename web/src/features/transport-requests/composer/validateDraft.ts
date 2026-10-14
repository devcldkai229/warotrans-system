import type { ComposerData, DraftValidation, TransportRequestDraft } from './types'

export function validateDraft(draft: TransportRequestDraft, data: ComposerData): DraftValidation {
  const errors: string[] = []
  const movementErrors: Record<string, string[]> = {}

  if (!draft.warehouseId) errors.push('Warehouse is required.')
  if (!draft.mapVersionId) errors.push('Map is required.')
  if (!draft.workflowId) errors.push('Workflow is required.')

  const map = data.maps.find((item) => item.id === draft.mapVersionId)
  if (draft.mapVersionId && map && map.warehouseId !== draft.warehouseId) {
    errors.push('Selected map does not belong to the warehouse.')
  }
  if (map && map.status !== 'PUBLISHED') {
    errors.push('Only published maps can be used.')
  }

  for (const field of data.staffInputFields) {
    if (field.required && !(draft.workflowInputs[field.key] ?? '').trim()) {
      errors.push(`${field.label} is required.`)
    }
  }

  if (draft.movements.length === 0) {
    errors.push('Add at least one container movement.')
  }

  const seenContainers = new Set<string>()
  for (const movement of draft.movements) {
    const local: string[] = []
    if (!movement.containerId) local.push('Container is required.')
    else if (seenContainers.has(movement.containerId)) local.push('Duplicate container in this request.')
    else seenContainers.add(movement.containerId)

    if (!movement.sourceEndpointId) local.push('Source is required.')
    if (!movement.destinationEndpointId) local.push('Destination is required.')
    if (
      movement.sourceEndpointId &&
      movement.destinationEndpointId &&
      movement.sourceEndpointId === movement.destinationEndpointId
    ) {
      local.push('Source and destination must differ.')
    }

    if (local.length) movementErrors[movement.localId] = local
  }

  const ok = errors.length === 0 && Object.keys(movementErrors).length === 0
  return { ok, errors, movementErrors }
}
