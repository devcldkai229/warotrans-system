import { apiFetch } from './client'

export interface WarehouseListItem {
  id: string
  code: string
  name: string
  isActive: boolean
  createdAt: string
}

export interface ListWarehousesResponse {
  items: WarehouseListItem[]
  total: number
}

export function listWarehouses(params?: { isActive?: boolean; skip?: number; take?: number }) {
  const query = new URLSearchParams()
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive))
  if (params?.skip !== undefined) query.set('skip', String(params.skip))
  if (params?.take !== undefined) query.set('take', String(params.take))
  const qs = query.toString()
  return apiFetch<ListWarehousesResponse>(`/api/warehouse/warehouses${qs ? `?${qs}` : ''}`)
}
