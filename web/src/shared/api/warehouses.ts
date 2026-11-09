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
  /** On an open Transport Request, so it cannot go on a stock voucher right now. */
  inActiveTransport: boolean
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

/* ------------------------------------------------------------------------------------------ stock vouchers */

/** INBOUND = phiếu nhập (PN-), OUTBOUND = phiếu xuất (PX-). */
export type StockVoucherType = 'INBOUND' | 'OUTBOUND'
/** Set by people only; robot progress is `doneCount`, read from the Containers. */
export type StockVoucherStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'

export interface StockVoucherListItem {
  id: string
  code: string
  type: StockVoucherType
  status: StockVoucherStatus
  referenceNo: string | null
  note: string | null
  createdBy: string
  createdAt: string
  confirmedAt: string | null
  updatedAt: string
  /** The voucher quantity: one line per Container. */
  containerCount: number
  /** Containers already on a shelf (inbound) or issued (outbound). */
  doneCount: number
}

export interface StockVoucherLine {
  id: string
  lineNo: number
  containerId: string
  containerBarcode: string
  containerStatus: ContainerStatus
  productId: string
  productSku: string
  productName: string
  currentStorageLocationId: string | null
  currentStorageLocationCode: string | null
  currentEndpointId: string | null
  currentLevelNo: number | null
  done: boolean
}

export interface StockVoucherProductSummary {
  productId: string
  productSku: string
  productName: string
  containerCount: number
  doneCount: number
}

export interface StockVoucherDetail extends StockVoucherListItem {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  confirmedBy: string | null
  cancelledBy: string | null
  cancelledAt: string | null
  products: StockVoucherProductSummary[]
  lines: StockVoucherLine[]
}

export function listStockVouchers(params: {
  warehouseId: string
  type?: StockVoucherType
  status?: StockVoucherStatus
  search?: string
  take?: number
}) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.type) query.set('type', params.type)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.take !== undefined) query.set('take', String(params.take))
  return apiRequest<{ items: StockVoucherListItem[]; total: number }>(`/api/warehouse/stock-vouchers?${query}`)
}

export function getStockVoucher(id: string) {
  return apiRequest<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${id}`)
}

export function createStockVoucher(body: { warehouseId: string; type: StockVoucherType; referenceNo?: string; note?: string }) {
  return apiRequest<StockVoucherDetail>('/api/warehouse/stock-vouchers', { method: 'POST', body: JSON.stringify(body) })
}

/**
 * Either name Containers, or (outbound only) ask for `count` stored Containers of a product, oldest first.
 * Rejects with `voucher_container_on_other_voucher` (409), `not_enough_stored_containers`, `voucher_not_draft` (400).
 */
export function addStockVoucherLines(
  id: string,
  body: { containerIds: string[] } | { productId: string; count: number },
) {
  return apiRequest<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${id}/lines`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function removeStockVoucherLine(id: string, lineId: string) {
  return apiRequest<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${id}/lines/${lineId}`, { method: 'DELETE' })
}

/** Rejects with `voucher_lines_required` or `voucher_container_not_eligible` (400). */
export function confirmStockVoucher(id: string) {
  return apiRequest<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${id}/confirm`, { method: 'POST' })
}

/** Only a DRAFT can be cancelled. */
export function cancelStockVoucher(id: string) {
  return apiRequest<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${id}/cancel`, { method: 'POST' })
}

export function listStorageLocations(params: { warehouseId: string; activeOnly?: boolean }) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly))
  return apiFetch<ListStorageLocationsResponse>(`/api/warehouse/storage-locations?${query}`)
}
