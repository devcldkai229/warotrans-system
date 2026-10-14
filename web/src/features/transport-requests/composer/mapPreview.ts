import type { MapCallout, MapMovement } from '@/shared/map/WarehouseMap'
import type { Endpoint } from '@/shared/api/contracts'
import type { TransportRequestDraft } from './types'

export interface ComposerMapPreview {
  focusEndpointIds: string[]
  movements: MapMovement[]
  callouts: MapCallout[]
}

function endpointById(endpoints: Endpoint[], id: string | undefined) {
  if (!id) return undefined
  return endpoints.find((item) => item.id === id)
}

/** Build semantic ghost preview for the draft (not a Nav2 route). */
export function buildComposerMapPreview(
  draft: TransportRequestDraft,
  endpoints: Endpoint[],
  activeMovementId: string | null,
): ComposerMapPreview {
  const focusEndpointIds: string[] = []
  const movements: MapMovement[] = []
  const callouts: MapCallout[] = []

  const sourceCounts = new Map<string, number>()
  for (const movement of draft.movements) {
    if (movement.sourceEndpointId) {
      sourceCounts.set(movement.sourceEndpointId, (sourceCounts.get(movement.sourceEndpointId) ?? 0) + 1)
    }
  }

  const sharedSources = new Set(
    [...sourceCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  )

  for (const movement of draft.movements) {
    const from = endpointById(endpoints, movement.sourceEndpointId)
    const to = endpointById(endpoints, movement.destinationEndpointId)
    if (from) focusEndpointIds.push(from.id)
    if (to) focusEndpointIds.push(to.id)
    if (from && to) {
      movements.push({
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        sequence: movement.sequenceNo,
        label: activeMovementId === movement.localId ? `#${movement.sequenceNo}` : undefined,
      })
    }
    if (to) {
      callouts.push({
        x: to.x,
        y: to.y,
        tone: 'dark',
        lines: [`#${movement.sequenceNo}`, 'DESTINATION'],
      })
    }
  }

  for (const endpointId of sharedSources) {
    const ep = endpointById(endpoints, endpointId)
    if (!ep) continue
    callouts.push({
      x: ep.x,
      y: ep.y,
      tone: 'dark',
      lines: [`SOURCE · ${sourceCounts.get(endpointId)}`],
    })
  }

  for (const movement of draft.movements) {
    if (!movement.sourceEndpointId || sharedSources.has(movement.sourceEndpointId)) continue
    const ep = endpointById(endpoints, movement.sourceEndpointId)
    if (!ep) continue
    callouts.push({
      x: ep.x,
      y: ep.y,
      tone: 'dark',
      lines: ['SOURCE'],
    })
  }

  return {
    focusEndpointIds: [...new Set(focusEndpointIds)],
    movements,
    callouts,
  }
}
