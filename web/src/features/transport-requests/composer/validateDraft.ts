import type { ComposerData, DraftValidation, TransportRequestDraft } from './types'
import { t } from '@/shared/i18n'
export function validateDraft(draft: TransportRequestDraft, data: ComposerData): DraftValidation {

  const errors: string[] = []
  const movementErrors: Record<string, string[]> = {}

  if (!draft.warehouseId) errors.push(t('Warehouse is required.'))
  if (!draft.mapVersionId) errors.push(t('Map is required.'))
  if (!draft.workflowId) errors.push(t('Workflow is required.'))

  const map = data.maps.find((item) => item.id === draft.mapVersionId)
  if (draft.mapVersionId && map && map.warehouseId !== draft.warehouseId) {
    errors.push(t('Selected map does not belong to the warehouse.'))
  }
  if (map && map.status !== 'PUBLISHED') {
    errors.push(t('Only published maps can be used.'))
  }

  for (const field of data.staffInputFields) {
    if (field.required && !(draft.workflowInputs[field.key] ?? '').trim()) {
      errors.push(t('{field} is required.', { field: field.label }))
    }
  }

  if (draft.movements.length === 0) {
    errors.push(t('Add at least one container movement.'))
  }

  const seenContainers = new Set<string>()
  for (const movement of draft.movements) {
    const local: string[] = []
    if (!movement.containerId) local.push(t('Container is required.'))
    else if (seenContainers.has(movement.containerId)) local.push(t('Duplicate container in this request.'))
    else seenContainers.add(movement.containerId)

    if (!movement.sourceEndpointId) local.push(t('Source is required.'))
    if (!movement.destinationEndpointId) local.push(t('Destination is required.'))
    if (
      movement.sourceEndpointId &&
      movement.destinationEndpointId &&
      movement.sourceEndpointId === movement.destinationEndpointId
    ) {
      local.push(t('Source and destination must differ.'))
    }

    if (local.length) movementErrors[movement.localId] = local
  }

  const ok = errors.length === 0 && Object.keys(movementErrors).length === 0
  return { ok, errors, movementErrors }
}
