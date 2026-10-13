import { apiFetch } from './client'

export interface MapVersionListItem {
  id: string
  warehouseId: string
  versionNo: number
  name: string
  status: string
  mapUri: string
  resolution: number
  originX: number
  originY: number
  originYaw: number
  createdAt: string
  publishedAt: string | null
}

export function listMapVersionsForWarehouse(warehouseId: string) {
  return apiFetch<MapVersionListItem[]>(`/api/navigation/warehouses/${warehouseId}/maps`)
}
