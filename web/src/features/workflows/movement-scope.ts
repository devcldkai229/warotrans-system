import type { CatalogField } from '@/shared/api/types'

/**
 * Mirrors backend CurrentMovementFieldDefinition.IsAvailableAt + ONCE_PER_JOB ban.
 * Admin must not see paths that ValidateForPublish will reject.
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
  if (scope === 'PER_CONTAINER_AT_STOP') return true
  return false
}
