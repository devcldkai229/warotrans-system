import { apiFetch, ApiError, getAccessToken } from './client';
import { requireMobileCapability } from './capabilities';
import type { ContainerStatus, ShelfSlotOccupancy, StockVoucherStatus, StockVoucherType } from '../types/contracts';
export interface WarehouseListItem { id: string; code: string; name: string; isActive: boolean; createdAt: string }
export interface ListWarehousesResponse { items: WarehouseListItem[]; total: number }
export interface ContainerVoucherSummary {
  id: string; code: string; type: StockVoucherType; status: StockVoucherStatus; createdAt: string; confirmedAt: string | null;
}
export interface ContainerListItem {
  id: string; barcode: string; status: ContainerStatus | string; productId: string; productSku: string; productName: string;
  currentStorageLocationId: string | null; currentStorageLocationCode: string | null;
  currentEndpointId: string | null; currentEndpointCode?: string | null; currentLevelNo: number | null;
  supplierPackageBarcode?: string | null; contentsQuantity?: number | null; contentsUnit?: string | null;
  updatedAt?: string; inActiveTransport?: boolean; voucher?: ContainerVoucherSummary | null;
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
export function listWarehouses(params: { isActive?: boolean; skip?: number; take?: number } = {}, signal?: AbortSignal) {
  return apiFetch<ListWarehousesResponse>(`/api/warehouse/warehouses${queryString(params)}`, { signal });
}
export async function listContainers(params: { warehouseId: string; status?: string; search?: string; eligibleOnly?: boolean; take?: number; skip?: number }, signal?: AbortSignal): Promise<ListContainersResponse> {
  const response = await apiFetch<ListContainersResponse>(`/api/warehouse/containers${queryString(params)}`, { signal });
  containersSnapshot = response.items;
  return response;
}
export interface ContainerDetailResponse extends Omit<ContainerListItem, 'currentEndpointId' | 'currentEndpointCode'> {
  currentStorageLocationName: string | null; createdBy: string; createdAt: string; updatedAt: string;
}
async function getContainerDetails(path: string): Promise<ContainerListItem> {
  const response = await apiFetch<ContainerDetailResponse>(path);
  // The detail route does not return a Navigation endpoint. Callers may resolve it
  // from currentStorageLocationId; never reuse an endpoint from another snapshot.
  return { ...response, currentEndpointId: null };
}
export function getContainer(id: string) { return getContainerDetails(`/api/warehouse/containers/${id}`); }
export function getContainerByBarcode(barcode: string) {
  return getContainerDetails(`/api/warehouse/containers/by-barcode/${encodeURIComponent(barcode.trim())}`);
}
export function listInventory(params: { warehouseId: string; search?: string; skip?: number; take?: number }) {
  return apiFetch<{ items: InventoryStockItem[]; total: number; warehouseContainerCount?: number; unallocatedContainerCount?: number }>(`/api/warehouse/inventory${queryString(params)}`);
}
export function listProducts(params: { search?: string; categoryId?: string; isActive?: boolean; skip?: number; take?: number } = {}, signal?: AbortSignal) {
  return apiFetch<{ items: ProductItem[]; total: number }>(`/api/warehouse/products${queryString(params)}`, { signal });
}
export function listProductCategories(signal?: AbortSignal) {
  return apiFetch<{ items: ProductCategoryItem[]; total: number }>('/api/warehouse/product-categories', { signal });
}
export interface ResolveProductResponse { exactMatch: ProductItem | null; items: ProductItem[] }
export function resolveProduct(params: { barcode?: string; search?: string }, signal?: AbortSignal) {
  requireMobileCapability('resolveProduct');
  // The API names the keyword `query`.
  return apiFetch<ResolveProductResponse>(`/api/warehouse/products/resolve${queryString({ barcode: params.barcode?.trim(), query: params.search?.trim() })}`, { signal });
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
  /** A DRAFT phiếu nhập; the new Container is added to it in the same transaction. */
  stockVoucherId?: string | null;
}
export interface CreateContainerResponse {
  id: string; barcode: string; status: string; productId: string;
  productName?: string; productSku?: string; currentEndpointId?: string; currentStorageLocationId?: string | null;
  currentLevelNo?: number | null; createdAt: string;
}
export interface CreateContainerBatchGroupInput {
  groupKey: string; productId: string; containerCount: number; quantityPerContainer: number;
  unit: string; quantityOverrides?: { containerNo: number; quantity: number }[] | null; supplierPackageBarcode?: string | null;
}
export interface CreateContainerBatchBody {
  warehouseId: string; requestId: string; stockVoucherId?: string | null; containerCount: number; groups: CreateContainerBatchGroupInput[];
  /** A pre-printed label scanned for this one container (containerCount 1): the server checks it was issued and is unused. */
  labelBarcode?: string;
}
/** Codes for pre-printed container labels. Nothing is created until a label is scanned with a product. */
export function issueContainerLabels(count: number) {
  return apiFetch<{ codes: string[]; issuedAt: string }>('/api/warehouse/container-labels', { method: 'POST', body: JSON.stringify({ count }) });
}
export interface CreatedBatchContainerItem {
  id: string; barcode: string; productId: string; groupKey: string; containerNo: number;
  contentsQuantity: number; contentsUnit: string; supplierPackageBarcode: string | null;
  status: ContainerStatus | string; currentStorageLocationId: string | null; currentEndpointId: string | null; createdAt: string;
}
export interface CreateContainerBatchResponse {
  requestId: string; warehouseId: string; containerCount: number; replayed: boolean; items: CreatedBatchContainerItem[];
  stockVoucher?: StockVoucherDetail | null;
}
export async function createContainer(body: CreateContainerBody): Promise<CreateContainerResponse> {
  void body;
  throw new ApiError(501, 'backend_capability_unavailable', 'This action is not supported by the current backend. Contact the supervisor.');
}
function validContainerBatchResponse(result: CreateContainerBatchResponse | null, body: CreateContainerBatchBody): result is CreateContainerBatchResponse {
  if (!result || result.requestId !== body.requestId || result.warehouseId !== body.warehouseId || typeof result.replayed !== 'boolean'
    || result.containerCount !== body.containerCount || !Array.isArray(result.items) || result.items.length !== body.containerCount) {
    return false;
  }
  const itemValid = result.items.every(item => !!item && typeof item.id === 'string' && !!item.id.trim()
    && typeof item.barcode === 'string' && !!item.barcode.trim() && typeof item.productId === 'string' && !!item.productId.trim()
    && typeof item.groupKey === 'string' && !!item.groupKey.trim() && Number.isInteger(item.containerNo) && item.containerNo >= 1
    && typeof item.contentsQuantity === 'number' && Number.isFinite(item.contentsQuantity) && item.contentsQuantity > 0
    && typeof item.contentsUnit === 'string' && !!item.contentsUnit.trim());
  if (!itemValid) return false;
  if (new Set(result.items.map(item => item.id)).size !== result.items.length
    || new Set(result.items.map(item => item.barcode)).size !== result.items.length) {
    return false;
  }
  if (body.stockVoucherId) {
    if (!result.stockVoucher || !validVoucherDetail(result.stockVoucher)
      || result.stockVoucher.id !== body.stockVoucherId || result.stockVoucher.warehouseId !== body.warehouseId
      || result.stockVoucher.type !== 'INBOUND' || result.stockVoucher.lines.length < body.containerCount) {
      return false;
    }
    const lineIds = new Set(result.stockVoucher.lines.map(line => line.containerId));
    if (result.items.some(item => !lineIds.has(item.id))) return false;
  }
  return true;
}
export async function createContainerBatch(body: CreateContainerBatchBody, signal?: AbortSignal): Promise<CreateContainerBatchResponse> {
  requireMobileCapability('createContainer');
  const result = await apiFetch<CreateContainerBatchResponse>('/api/warehouse/containers', {
    method: 'POST', signal, body: JSON.stringify(body),
  }, getAccessToken());
  if (!validContainerBatchResponse(result, body)) {
    throw new ApiError(502, 'container_batch_unverified', 'Could not verify the allocated containers. Check the voucher before trying again.');
  }
  return result;
}
/** `Warehouse/Features/ListStockVouchers/Response.cs`. Quantities are Containers; `doneCount` is robot progress. */
export interface StockVoucherListItem {
  id: string; code: string; type: StockVoucherType; status: StockVoucherStatus; referenceNo: string | null; note: string | null;
  createdAt: string; confirmedAt: string | null; containerCount: number; doneCount: number;
}
export interface StockVoucherPage { items: StockVoucherListItem[]; total: number }
export interface StockVoucherLine {
  id: string; lineNo: number; containerId: string; containerBarcode: string; containerStatus: string;
  productId: string; productSku: string; productName: string;
  contentsQuantity?: number | null; contentsUnit?: string | null;
  currentStorageLocationId: string | null; currentStorageLocationCode: string | null;
  currentEndpointId: string | null; currentLevelNo: number | null; done: boolean;
}
export async function addStockVoucherLines(voucherId: string, containerIds: string[], signal?: AbortSignal): Promise<StockVoucherDetail> {
  requireMobileCapability('createStockVoucherDraft');
  const cleanIds = containerIds.map(id => id.trim()).filter(Boolean);
  if (!cleanIds.length || new Set(cleanIds).size !== cleanIds.length) {
    throw new ApiError(400, 'validation_failed', 'Select unique containers for this voucher.');
  }
  let latest: StockVoucherDetail | null = null;
  for (let index = 0; index < cleanIds.length; index += 200) {
    const chunk = cleanIds.slice(index, index + 200);
    latest = await apiFetch<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${encodeURIComponent(voucherId)}/lines`, {
      method: 'POST', signal, body: JSON.stringify({ containerIds: chunk }),
    }, getAccessToken());
  }
  if (!latest || !validVoucherDetail(latest) || latest.id !== voucherId) {
    throw new ApiError(502, 'voucher_lines_unverified', 'Could not verify the saved voucher containers. Refresh and try again.');
  }
  const savedIds = new Set(latest.lines.map(line => line.containerId));
  if (cleanIds.some(id => !savedIds.has(id))) {
    throw new ApiError(502, 'voucher_lines_unverified', 'Could not verify the saved voucher containers. Refresh and try again.');
  }
  return latest;
}
export interface StockVoucherDetail extends StockVoucherListItem {
  warehouseId: string; warehouseCode: string; warehouseName: string; createdBy: string; updatedAt: string;
  confirmedBy: string | null; cancelledBy: string | null; cancelledAt: string | null; stockPostedAt?: string | null;
  products: { productId: string; productSku: string; productName: string; containerCount: number; doneCount: number }[];
  lines: StockVoucherLine[];
}
export function listStockVouchers(params: { warehouseId: string; type?: StockVoucherType; status?: StockVoucherStatus; search?: string; skip?: number; take?: number }, signal?: AbortSignal) {
  return apiFetch<StockVoucherPage>(`/api/warehouse/stock-vouchers${queryString(params)}`, { signal });
}
function validVoucherDetail(result: StockVoucherDetail | null): result is StockVoucherDetail {
  return !!result && typeof result.id === 'string' && !!result.id && typeof result.code === 'string'
    && typeof result.warehouseId === 'string' && ['INBOUND', 'OUTBOUND'].includes(result.type)
    && ['DRAFT', 'CONFIRMED', 'CANCELLED'].includes(result.status) && Number.isInteger(result.containerCount) && result.containerCount >= 0
    && Array.isArray(result.lines) && result.containerCount === result.lines.length && result.lines.every(line => line && typeof line.id === 'string' && !!line.id
      && typeof line.containerId === 'string' && !!line.containerId.trim()
      && typeof line.containerBarcode === 'string' && !!line.containerBarcode.trim() && typeof line.containerStatus === 'string'
      && typeof line.productName === 'string' && typeof line.productSku === 'string')
    && new Set(result.lines.map(line => line.id)).size === result.lines.length
    && new Set(result.lines.map(line => line.containerId)).size === result.lines.length
    && new Set(result.lines.map(line => line.containerBarcode)).size === result.lines.length;
}
export async function getStockVoucher(id: string, signal?: AbortSignal) {
  const result = await apiFetch<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${encodeURIComponent(id)}`, { signal });
  if (result?.id !== id) throw new ApiError(502, 'voucher_identity_mismatch', 'This voucher could not be verified. Refresh and try again.');
  if (!validVoucherDetail(result)) throw new ApiError(502, 'voucher_response_invalid', 'The voucher details could not be read. Refresh and try again.');
  return result;
}
export interface CreateStockVoucherDraftBody {
  warehouseId: string; type: StockVoucherType; referenceNo?: string; note?: string;
}
/** Creates only document metadata. No stock is posted and no Container codes are allocated. */
export async function createStockVoucherDraft(body: CreateStockVoucherDraftBody, signal?: AbortSignal) {
  requireMobileCapability('createStockVoucherDraft');
  const result = await apiFetch<StockVoucherDetail>('/api/warehouse/stock-vouchers', {
    method: 'POST', signal,
    body: JSON.stringify({ warehouseId: body.warehouseId, type: body.type, referenceNo: body.referenceNo?.trim() || null, note: body.note?.trim() || null }),
  }, getAccessToken());
  if (!validVoucherDetail(result) || !result.code || result.warehouseId !== body.warehouseId || result.type !== body.type || result.status !== 'DRAFT') {
    throw new ApiError(502, 'voucher_creation_unverified', 'Could not verify the created draft. Check the voucher list before creating again.');
  }
  return result;
}
/** WH-01: names the shelf of an IN_TRANSIT or HOLD Container. 409 `container_in_active_transport` while a request moves it. */
export function recoverContainer(id: string, body: { storageLocationId: string; levelNo: number; note?: string }) {
  return apiFetch<unknown>(`/api/warehouse/containers/${id}/recover`, { method: 'POST', body: JSON.stringify(body) });
}
/** Atomically confirms INBOUND and OUTBOUND vouchers and posts stock once with stockPostedAt. */
export async function confirmStockVoucher(id: string, type?: StockVoucherType, signal?: AbortSignal): Promise<StockVoucherDetail> {
  requireMobileCapability('confirmStockVoucher');
  if (type !== 'INBOUND' && type !== 'OUTBOUND') {
    throw new ApiError(501, 'backend_capability_unavailable', 'This action is not supported by the current backend. Contact the supervisor.');
  }
  const result = await apiFetch<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${encodeURIComponent(id)}/confirm`, {
    method: 'POST', signal,
  }, getAccessToken());
  if (!validVoucherDetail(result) || result.id !== id || result.type !== type || result.status !== 'CONFIRMED'
    || typeof result.stockPostedAt !== 'string' || !result.stockPostedAt.trim()) {
    throw new ApiError(502, 'voucher_confirmation_unverified', 'Could not verify the voucher confirmation. Refresh and try again.');
  }
  return result;
}
/** Cancels a DRAFT voucher and frees any attached Containers for reuse. */
export async function cancelStockVoucher(id: string, signal?: AbortSignal): Promise<StockVoucherDetail> {
  const result = await apiFetch<StockVoucherDetail>(`/api/warehouse/stock-vouchers/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', signal,
  }, getAccessToken());
  if (!validVoucherDetail(result) || result.id !== id || result.status !== 'CANCELLED'
    || typeof result.cancelledAt !== 'string' || !result.cancelledAt.trim()) {
    throw new ApiError(502, 'voucher_cancellation_unverified', 'Could not verify the voucher cancellation. Refresh and try again.');
  }
  return result;
}
