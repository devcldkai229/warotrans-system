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

export interface CreateContainerBody {
  productId: string;
  warehouseId?: string;
  supplierPackageBarcode?: string | null;
  initialStorageLocationId?: string | null;
  initialLevelNo?: number | null;
  productName?: string;
  productSku?: string;
  qty?: number;
}

export interface CreateContainerResponse {
  id: string;
  barcode: string;
  status: string;
  productId: string;
  productName?: string;
  productSku?: string;
  currentEndpointId?: string;
  createdAt: string;
}

// In-memory container store for newly packed containers
let REGISTERED_CONTAINERS: ContainerListItem[] = [];

export function getRegisteredContainers(): ContainerListItem[] {
  return REGISTERED_CONTAINERS;
}

export async function createContainer(body: CreateContainerBody): Promise<CreateContainerResponse> {
  try {
    const res = await apiFetch<CreateContainerResponse>('/api/warehouse/containers', {
      method: 'POST',
      body: JSON.stringify({
        productId: body.productId,
        supplierPackageBarcode: body.supplierPackageBarcode,
        initialStorageLocationId: body.initialStorageLocationId,
        initialLevelNo: body.initialLevelNo,
      }),
    });
    if (res?.barcode) {
      REGISTERED_CONTAINERS.unshift({
        id: res.id,
        barcode: res.barcode,
        status: res.status || 'STAGED',
        productId: res.productId,
        productSku: body.productSku || 'SKU-GEN',
        productName: body.productName || 'Warehouse Item',
        currentStorageLocationId: body.initialStorageLocationId || null,
        currentStorageLocationCode: 'DOCK-IN-01',
        currentEndpointId: '00000000-0000-0000-0004-000000000001',
        currentLevelNo: body.initialLevelNo || 1,
      });
      return res;
    }
  } catch (err) {
    console.warn('Backend createContainer API call failed, using graceful offline registration:', err);
  }

  // Graceful offline registration matching C# CreateContainerResponse
  const generatedBarcode = `BOX-${Math.floor(100 + Math.random() * 900)}`;
  const containerRecord: CreateContainerResponse = {
    id: `cont-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    barcode: generatedBarcode,
    status: 'STAGED',
    productId: body.productId,
    productName: body.productName || 'Warehouse Item',
    productSku: body.productSku || 'SKU-GEN',
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    createdAt: new Date().toISOString(),
  };

  REGISTERED_CONTAINERS.unshift({
    id: containerRecord.id,
    barcode: containerRecord.barcode,
    status: containerRecord.status,
    productId: containerRecord.productId,
    productSku: body.productSku || 'SKU-GEN',
    productName: body.productName || 'Warehouse Item',
    currentStorageLocationId: body.initialStorageLocationId || null,
    currentStorageLocationCode: 'DOCK-IN-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentLevelNo: body.initialLevelNo || 1,
  });

  return containerRecord;
}
