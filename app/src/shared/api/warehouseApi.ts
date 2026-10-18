import { apiFetch } from './client'
import type { ContainerStatus } from '../types/contracts'

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
}

export interface ListStorageLocationsResponse {
  items: StorageLocationListItem[]
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

export function listStorageLocations(params: { warehouseId: string; activeOnly?: boolean }) {
  const query = new URLSearchParams()
  query.set('warehouseId', params.warehouseId)
  if (params.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly))
  return apiFetch<ListStorageLocationsResponse>(`/api/warehouse/storage-locations?${query}`)
}

export interface ContainerDetailsResponse extends Omit<ContainerListItem, 'currentEndpointId'> {
  supplierPackageBarcode: string | null;
  currentStorageLocationName: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
}
export function getContainer(id: string) {
  return apiFetch<ContainerDetailsResponse>(`/api/warehouse/containers/${id}`);
}
export function getContainerByBarcode(barcode: string) {
  return apiFetch<ContainerDetailsResponse>(`/api/warehouse/containers/by-barcode/${encodeURIComponent(barcode)}`);
}
export interface ProductDto {
  id: string; categoryId: string; sku: string; supplierBarcode: string | null;
  name: string; description: string | null; isActive: boolean;
}
export function resolveProduct(params: { barcode?: string; query?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.barcode) query.set('barcode', params.barcode);
  if (params.query) query.set('query', params.query);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  return apiFetch<{ exactMatch: ProductDto | null; items: ProductDto[] }>(`/api/warehouse/products/resolve?${query}`);
}
export interface ProductInventoryContext {
  productId: string; sku: string; productName: string; totalContainers: number;
  containersByStatus: Record<string, number>;
  storageLocations: { storageLocationId: string; storageLocationCode: string; storageLocationName: string; levelNo: number; containerCount: number }[];
  recentContainers: { id: string; barcode: string; status: string; currentStorageLocationId: string | null; currentLevelNo: number | null; createdAt: string }[];
}
export function getProductInventoryContext(productId: string) {
  return apiFetch<ProductInventoryContext>(`/api/warehouse/products/${productId}/inventory-context`);
}
export interface CreateContainerRequest {
  productId: string; supplierPackageBarcode?: string | null;
  initialStorageLocationId?: string | null; initialLevelNo?: number | null;
}
export interface CreateContainerResponse {
  id: string; productId: string; barcode: string; supplierPackageBarcode: string | null; status: string;
  currentStorageLocationId: string | null; currentLevelNo: number | null;
  createdBy: string; createdAt: string; updatedAt: string;
}
export function createContainer(body: CreateContainerRequest) {
  return apiFetch<CreateContainerResponse>('/api/warehouse/containers', { method: 'POST', body: JSON.stringify(body) });
}
