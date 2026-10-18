import { apiFetch, apiRequest } from './client'
import type { ContainerStatus } from './contracts'

export interface WarehouseListItem {
  id: string
  code: string
  name: string
  address?: string | null
  timezone?: string
  isActive: boolean
  createdAt: string
}

export interface ListWarehousesResponse {
  items: WarehouseListItem[]
  total: number
}

export interface ContainerListItem {
  id: string
  barcode: string
  status: ContainerStatus | string
  productId: string
  productSku: string
  productName: string
  currentStorageLocationId: string | null
  currentStorageLocationCode: string | null
  currentEndpointId: string | null
  currentLevelNo: number | null
  supplierPackageBarcode: string | null
  updatedAt: string
}

export interface ListContainersResponse {
  items: ContainerListItem[]
  total: number
}

export interface StorageLocationListItem {
  id: string
  warehouseId: string
  endpointId: string
  code: string
  name: string
  isActive: boolean
  warehouseName: string
  /** Null when Navigation no longer knows the Endpoint. */
  endpointCode: string | null
  endpointName: string | null
  endpointType: string | null
  createdAt: string
}

export interface ListStorageLocationsResponse {
  items: StorageLocationListItem[]
  total: number
}

export interface InventoryListItem {
  id: string
  productId: string
  productSku: string
  productName: string
  storageLocationId: string
  storageLocationCode: string
  storageLocationName: string
  levelNo: number
  /** Number of Containers, not product units. */
  containerCount: number
  updatedAt: string
}

export interface ListInventoryResponse {
  items: InventoryListItem[]
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

export interface CreateWarehouseBody {
  code: string
  name: string
  timezone?: string | null
  address?: string | null
  isActive?: boolean | null
}

export interface CreateWarehouseResponse {
  id: string
  code: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
  createdAt: string
}

export function createWarehouse(body: CreateWarehouseBody) {
  return apiRequest<CreateWarehouseResponse>('/api/warehouse/warehouses', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listContainers(params: {
  warehouseId: string
  search?: string
  eligibleOnly?: boolean
  take?: number
}) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.search) query.set('search', params.search)
  if (params.eligibleOnly !== undefined) query.set('eligibleOnly', String(params.eligibleOnly))
  if (params.take !== undefined) query.set('take', String(params.take))
  return apiFetch<ListContainersResponse>(`/api/warehouse/containers?${query}`)
}

export function listInventory(params: { warehouseId: string; search?: string; skip?: number; take?: number }) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.search) query.set('search', params.search)
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.take !== undefined) query.set('take', String(params.take))
  return apiFetch<ListInventoryResponse>(`/api/warehouse/inventory?${query}`)
}

export function createStorageLocation(body: { warehouseId: string; endpointId: string; code: string; name: string }) {
  return apiFetch<StorageLocationListItem>('/api/warehouse/storage-locations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function setStorageLocationStatus(id: string, isActive: boolean) {
  return apiFetch<StorageLocationListItem>(`/api/warehouse/storage-locations/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ isActive }),
  })
}

export function listStorageLocations(params: { warehouseId: string; activeOnly?: boolean }) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly))
  return apiFetch<ListStorageLocationsResponse>(`/api/warehouse/storage-locations?${query}`)
}
