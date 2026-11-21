import type { MovementDraft } from './types'

/**
 * Puts the workflow's fixed pickup / dropoff Endpoint on every movement (INBOUND starts at its Inbound gate,
 * OUTBOUND_RETRIEVAL ends at its Outbound gate). A gate is not a shelf, so no storage location or level goes with it.
 * Returns the same array when nothing changes, so it can run in an effect without looping.
 */
export function applyFixedStops(
  movements: MovementDraft[],
  pickupEndpointId: string | null,
  dropoffEndpointId: string | null,
): MovementDraft[] {
  let changed = false
  const next = movements.map((movement) => {
    let result = movement
    if (pickupEndpointId && (movement.sourceEndpointId !== pickupEndpointId || movement.sourceStorageLocationId)) {
      result = { ...result, sourceEndpointId: pickupEndpointId, sourceStorageLocationId: null, sourceLevelNo: null, sourceAutoFilled: false }
    }
    if (dropoffEndpointId && (movement.destinationEndpointId !== dropoffEndpointId || movement.destinationStorageLocationId)) {
      result = { ...result, destinationEndpointId: dropoffEndpointId, destinationStorageLocationId: null, destinationLevelNo: null }
    }
    if (result !== movement) changed = true
    return result
  })
  return changed ? next : movements
}
