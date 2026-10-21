import { apiFetch } from './client';
import { requireMobileCapability } from './capabilities';
import type { ContainerStatus, ShelfSlotOccupancy } from '../types/contracts';
export interface WarehouseListItem { id: string; code: string; name: string; isActive: boolean; createdAt: string }
export interface ListWarehousesResponse { items: WarehouseListItem[]; total: number }
export interface ContainerListItem {
  id: string; barcode: string; status: ContainerStatus | string; productId: string; productSku: string; productName: string;
  currentStorageLocationId: string | null; currentStorageLocationCode: string | null;
  currentEndpointId: string | null; currentEndpointCode?: string | null; currentLevelNo: number | null;
  qty?: number; category?: string; zoneLabel?: string;
}
export interface ListContainersResponse { items: ContainerListItem[]; total: number }
export type WarehouseZoneCode = 'ZONE_A' | 'ZONE_B' | 'ZONE_D' | 'DOCK' | 'STATION';
export interface StorageLocationListItem {
  id: string; warehouseId: string; endpointId: string; endpointCode: string; code: string; name: string;
  zone: WarehouseZoneCode; zoneLabel: string; isActive: boolean; shelfSlots: ShelfSlotOccupancy[];
}
export interface ListStorageLocationsResponse { items: StorageLocationListItem[]; total: number }
export interface AllocatedStorageSlot {
  storageLocationId: string; storageLocationCode: string; storageLocationName: string;
  endpointId: string; endpointCode: string; levelNo: number; zone: WarehouseZoneCode; zoneLabel: string; displayLabel: string;
}
export interface InventoryStockItem {
  id: string; productId: string; productSku: string; productName: string; storageLocationId: string;
  storageLocationCode: string; storageLocationName: string; levelNo: number; containerCount: number; updatedAt: string;
}
export interface ProductItem {
  id: string; categoryId: string; sku: string; supplierBarcode: string | null; name: string; description: string | null; isActive: boolean;
}
export interface ProductCategoryItem { id: string; code: string; name: string; description: string | null }
let containersSnapshot: ContainerListItem[] = [];
let locationsSnapshot: StorageLocationListItem[] = [];
export function clearWarehouseSnapshots() { containersSnapshot = []; locationsSnapshot = []; }
export function getRegisteredContainers() { return containersSnapshot; }
// Legacy names used by screen initializers; these contain only the last server snapshot.
export function getSeedContainersSnapshot() { return [...containersSnapshot]; }
export function getStorageLocationsSnapshot() { return [...locationsSnapshot]; }
export function normalizeProductName(name?: string | null) { return name || 'Unknown Product'; }
export function normalizeWarehouseName(name?: string | null) { return name || 'Warehouse'; }
export function normalizeStorageLocationName(name?: string | null, code?: string | null) { return name || code || 'Storage Location'; }
export function normalizeWorkflowDisplayName(code?: string | null, name?: string | null) { return name || code?.replace(/_/g, ' ') || 'Workflow'; }
function queryString(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined) query.set(key, String(value)); });
  return query.size ? `?${query}` : '';
}
export function listWarehouses(params: { isActive?: boolean; skip?: number; take?: number } = {}) {
  return apiFetch<ListWarehousesResponse>(`/api/warehouse/warehouses${queryString(params)}`);
}
export async function listContainers(params: { warehouseId: string; search?: string; eligibleOnly?: boolean; skip?: number; take?: number }): Promise<ListContainersResponse> {
  const response = await apiFetch<ListContainersResponse>(`/api/warehouse/containers${queryString(params)}`);
  containersSnapshot = response.items;
  return response;
}
export function getContainer(id: string) { return apiFetch<ContainerListItem>(`/api/warehouse/containers/${id}`); }
export function getContainerByBarcode(barcode: string) {
  return apiFetch<ContainerListItem>(`/api/warehouse/containers/by-barcode/${encodeURIComponent(barcode)}`);
}
export function listInventory(params: { warehouseId: string; search?: string; skip?: number; take?: number }) {
  return apiFetch<{ items: InventoryStockItem[]; total: number }>(`/api/warehouse/inventory${queryString(params)}`);
}
export function listProducts(params: { search?: string; categoryId?: string; isActive?: boolean; skip?: number; take?: number } = {}) {
  return apiFetch<{ items: ProductItem[]; total: number }>(`/api/warehouse/products${queryString(params)}`);
}
export function listProductCategories() {
  return apiFetch<{ items: ProductCategoryItem[]; total: number }>('/api/warehouse/product-categories');
}
export function resolveProduct(params: { barcode?: string; search?: string }) {
  requireMobileCapability('resolveProduct');
  return apiFetch<{ exactMatch: ProductItem | null; items: ProductItem[] }>(`/api/warehouse/products/resolve${queryString(params)}`);
}
export async function listStorageLocations(params: { warehouseId: string; activeOnly?: boolean }): Promise<ListStorageLocationsResponse> {
  const response = await apiFetch<{ items: Omit<StorageLocationListItem, 'shelfSlots' | 'zone' | 'zoneLabel'>[]; total: number }>(
    `/api/warehouse/storage-locations${queryString(params)}`);
  locationsSnapshot = response.items.map(location => ({
    ...location, endpointCode: location.endpointCode || location.code,
    // No capacity is exposed by this API. Never invent three empty levels.
    zone: 'ZONE_A', zoneLabel: location.name, shelfSlots: [],
  }));
  return { ...response, items: locationsSnapshot };
}
export function autoAllocateStorageSlots(zone: WarehouseZoneCode, count: number, excludeSlotKeys: string[] = []): AllocatedStorageSlot[] {
  const excluded = new Set(excludeSlotKeys);
  return locationsSnapshot.filter(location => location.zone === zone).flatMap(location =>
    location.shelfSlots.filter(slot => slot.status === 'AVAILABLE' && !excluded.has(`${location.id}:${slot.levelNo}`)).map(slot => ({
      storageLocationId: location.id, storageLocationCode: location.code, storageLocationName: location.name,
      endpointId: location.endpointId, endpointCode: location.endpointCode, levelNo: slot.levelNo,
      zone: location.zone, zoneLabel: location.zoneLabel, displayLabel: `${location.code} · Level ${slot.levelNo}`,
    }))).slice(0, count);
}
export interface CreateContainerBody {
  productId: string; warehouseId?: string; supplierPackageBarcode?: string | null; initialStorageLocationId?: string | null;
  initialLevelNo?: number | null; productName?: string; productSku?: string; qty?: number; category?: string;
}
export interface CreateContainerResponse {
  id: string; barcode: string; status: string; productId: string;
  productName?: string; productSku?: string; currentEndpointId?: string; currentStorageLocationId?: string | null;
  currentLevelNo?: number | null; createdAt: string;
}
export async function createContainer(body: CreateContainerBody): Promise<CreateContainerResponse> {
  requireMobileCapability('createContainer');
  const response = await apiFetch<CreateContainerResponse>('/api/warehouse/containers', {
    method: 'POST', body: JSON.stringify({
      productId: body.productId, supplierPackageBarcode: body.supplierPackageBarcode ?? null,
      initialStorageLocationId: body.initialStorageLocationId ?? null, initialLevelNo: body.initialLevelNo ?? null,
    }),
  });
  return response;
}
