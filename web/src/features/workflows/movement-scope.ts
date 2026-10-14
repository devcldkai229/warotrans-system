import type { CatalogField } from '@/shared/api/types'

function isSourcePath(key: string): boolean {
  return key === 'source.endpointId' || key.startsWith('source.')
}

function isDestinationPath(key: string): boolean {
  return key === 'destination.endpointId' || key.startsWith('destination.')
}

/** Preferred CURRENT_MOVEMENT endpoint path for a stop action (PICKUP / DROPOFF). */
export function preferredMovementEndpointPath(
  stopAction: string | null | undefined,
): string | null {
  if (stopAction === 'PICKUP') return 'source.endpointId'
  if (stopAction === 'DROPOFF') return 'destination.endpointId'
  return null
}

/**
 * Mirrors backend CurrentMovementFieldDefinition.IsAvailableAt + stop-action affinity.
 * - ONCE_PER_JOB: no CURRENT_MOVEMENT
 * - ONCE_PER_STOP: only the stop endpoint for that action
 * - PER_CONTAINER_AT_STOP: container fields always; source.* only on PICKUP; destination.* only on DROPOFF
 */
export function isMovementFieldAvailable(
  field: CatalogField,
  scope: string | null | undefined,
  stopAction: string | null | undefined,
): boolean {
  if (!scope || scope === 'ONCE_PER_JOB') return false

  if (scope === 'ONCE_PER_STOP') {
    if (field.key === 'source.endpointId') return stopAction === 'PICKUP'
    if (field.key === 'destination.endpointId') return stopAction === 'DROPOFF'
    return false
  }

  if (scope === 'PER_CONTAINER_AT_STOP') {
    if (isSourcePath(field.key)) return stopAction === 'PICKUP' || stopAction == null
    if (isDestinationPath(field.key)) return stopAction === 'DROPOFF' || stopAction == null
    return true
  }

  return false
}
