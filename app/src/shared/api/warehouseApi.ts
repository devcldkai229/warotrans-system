import { apiFetch } from './client';
import type { ContainerStatus } from '../types/contracts';

export interface WarehouseListItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ListWarehousesResponse {
  items: WarehouseListItem[];
  total: number;
}

export interface ContainerListItem {
  id: string;
  barcode: string;
  status: ContainerStatus | string;
  productId: string;
  productSku: string;
  productName: string;
  currentStorageLocationId: string | null;
  currentStorageLocationCode: string | null;
  currentEndpointId: string | null;
  currentLevelNo: number | null;
}

export interface ListContainersResponse {
  items: ContainerListItem[];
  total: number;
}

export interface StorageLocationListItem {
  id: string;
  warehouseId: string;
  endpointId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ListStorageLocationsResponse {
  items: StorageLocationListItem[];
  total: number;
}

export function listWarehouses(params?: { isActive?: boolean; skip?: number; take?: number }) {
  const query = new URLSearchParams();
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params?.skip !== undefined) query.set('skip', String(params.skip));
  if (params?.take !== undefined) query.set('take', String(params.take));
  const qs = query.toString();
  return apiFetch<ListWarehousesResponse>(`/api/warehouse/warehouses${qs ? `?${qs}` : ''}`);
}

export function listContainers(params: {
  warehouseId: string;
  search?: string;
  eligibleOnly?: boolean;
  take?: number;
}) {
  const query = new URLSearchParams();
  query.set('warehouseId', params.warehouseId);
  if (params.search) query.set('search', params.search);
  if (params.eligibleOnly !== undefined) query.set('eligibleOnly', String(params.eligibleOnly));
  if (params.take !== undefined) query.set('take', String(params.take));
  const qs = query.toString();
  return apiFetch<ListContainersResponse>(`/api/warehouse/containers${qs ? `?${qs}` : ''}`);
}

export function getContainer(id: string) {
  return apiFetch<ContainerListItem>(`/api/warehouse/containers/${id}`);
}

export function getContainerByBarcode(barcode: string) {
  return apiFetch<ContainerListItem>(`/api/warehouse/containers/by-barcode/${encodeURIComponent(barcode)}`);
}

export function listStorageLocations(params: {
  warehouseId: string;
  activeOnly?: boolean;
}) {
  const query = new URLSearchParams();
  query.set('warehouseId', params.warehouseId);
  if (params.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));
  const qs = query.toString();
  return apiFetch<ListStorageLocationsResponse>(`/api/warehouse/storage-locations${qs ? `?${qs}` : ''}`);
}
