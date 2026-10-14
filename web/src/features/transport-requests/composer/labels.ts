import type { ComposerContainer, ComposerData, MovementDraft } from './types'

export function containerById(data: ComposerData, id: string) {
  return data.containers.find((item) => item.id === id)
}

export function locationById(data: ComposerData, id: string | null | undefined) {
  if (!id) return null
  return data.storageLocations.find((item) => item.id === id) ?? null
}

export function endpointById(data: ComposerData, id: string | undefined) {
  if (!id) return null
  return data.endpoints.find((item) => item.id === id) ?? null
}

export function shortPlace(
  data: ComposerData,
  storageLocationId: string | null,
  endpointId: string,
  levelNo: number | null,
): string {
  const location = locationById(data, storageLocationId)
  if (location) {
    const level = levelNo != null ? ` / L${levelNo}` : ''
    return `${location.code}${level}`
  }
  const endpoint = endpointById(data, endpointId)
  return endpoint?.name ?? '—'
}

export function movementCollapseLine(data: ComposerData, movement: MovementDraft, container?: ComposerContainer) {
  const code = container?.barcode ?? '—'
  const from = shortPlace(data, movement.sourceStorageLocationId, movement.sourceEndpointId, movement.sourceLevelNo)
  const to = shortPlace(
    data,
    movement.destinationStorageLocationId,
    movement.destinationEndpointId,
    movement.destinationLevelNo,
  )
  return { code, from, to }
}

export function newLocalId() {
  return `mv-${crypto.randomUUID().slice(0, 8)}`
}
