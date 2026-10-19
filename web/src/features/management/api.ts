import { apiRequest } from '@/shared/api/client'
import type {
  ContainerView,
  CreateCategoryBody,
  CreateProductBody,
  InventoryStockView,
  Product,
  ProductCategory,
  StorageLocationView,
} from '@/shared/api/contracts'
import { getActiveMapVersion, listEndpoints } from '@/shared/api/navigation'
import {
  createStorageLocation,
  listContainers,
  listInventory,
  listStorageLocations,
  listWarehouses,
  setStorageLocationStatus,
  type StorageLocationListItem,
} from '@/shared/api/warehouses'
import { CATEGORIES, CONTAINERS, ENDPOINT_OPTIONS, INVENTORY, PRODUCTS, STORAGE_LOCATIONS, WAREHOUSES } from './mock'

// Mock auto-login has no real session, so the API would answer 401; this mode keeps working on local rows.
const MOCK_MODE = import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true'

/** The API sends null for a missing barcode or description; the screens use undefined. */
interface ProductPayload extends Omit<Product, 'supplierBarcode' | 'description'> {
  supplierBarcode: string | null
  description: string | null
}

interface CategoryPayload extends Omit<ProductCategory, 'description'> {
  description: string | null
}

function toProduct(payload: ProductPayload): Product {
  return { ...payload, supplierBarcode: payload.supplierBarcode ?? undefined, description: payload.description ?? undefined }
}

function toCategory(payload: CategoryPayload): ProductCategory {
  return { ...payload, description: payload.description ?? undefined }
}

/** GET /api/warehouse/product-categories. */
export async function listCategories(): Promise<ProductCategory[]> {
  if (MOCK_MODE) return CATEGORIES
  const response = await apiRequest<{ items: CategoryPayload[] }>('/api/warehouse/product-categories')
  return response.items.map(toCategory)
}

/**
 * POST /api/warehouse/product-categories (Admin only). The server upper-cases the code.
 * Rejects with an `ApiError`: `product_category_code_taken` (409), `validation_failed` (400).
 */
export async function createCategory(body: CreateCategoryBody): Promise<ProductCategory> {
  if (MOCK_MODE) return { id: `mock-category-${Date.now()}`, ...body, code: body.code.toUpperCase() }
  return toCategory(
    await apiRequest<CategoryPayload>('/api/warehouse/product-categories', { method: 'POST', body: JSON.stringify(body) }),
  )
}

/** GET /api/warehouse/products, ordered by SKU. The catalog is small, so one page of up to 500 is enough. */
export async function listProducts(): Promise<Product[]> {
  if (MOCK_MODE) return PRODUCTS
  const response = await apiRequest<{ items: ProductPayload[] }>('/api/warehouse/products?take=500')
  return response.items.map(toProduct)
}

/**
 * POST /api/warehouse/products (Admin only). The product starts active and the server upper-cases the SKU.
 * Rejects with `product_sku_taken`, `product_supplier_barcode_taken` (409) or `product_category_not_found` (404).
 */
export async function createProduct(body: CreateProductBody): Promise<Product> {
  if (MOCK_MODE) {
    const now = new Date().toISOString()
    return { id: `mock-product-${Date.now()}`, ...body, sku: body.sku.toUpperCase(), isActive: true, createdAt: now, updatedAt: now }
  }
  return toProduct(await apiRequest<ProductPayload>('/api/warehouse/products', { method: 'POST', body: JSON.stringify(body) }))
}

/** POST /api/warehouse/products/{id}/status (Admin only). An inactive product cannot get new Containers. */
export async function setProductStatus(product: Product, isActive: boolean): Promise<Product> {
  if (MOCK_MODE) return { ...product, isActive, updatedAt: new Date().toISOString() }
  return toProduct(
    await apiRequest<ProductPayload>(`/api/warehouse/products/${product.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ isActive }),
    }),
  )
}

/** What the Containers table shows. The API has no creation time, so it is not part of this shape. */
export type ManagedContainer = Pick<
  ContainerView,
  'id' | 'barcode' | 'sku' | 'productName' | 'status' | 'locationCode' | 'currentLevelNo' | 'supplierPackageBarcode' | 'updatedAt'
>

export interface ContainerListing {
  /** Null when no active Warehouse exists yet. */
  warehouseName: string | null
  items: ManagedContainer[]
  /** Containers that exist in this Warehouse, which can be more than `items`. */
  total: number
}

// The monitor screens remember the chosen Warehouse under this key; the first active one is used otherwise.
const WAREHOUSE_KEY = 'warotrans.monitor.warehouseId'

function preferredWarehouseId(): string {
  try {
    return window.localStorage.getItem(WAREHOUSE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** The Warehouse the Management tables work on: the one the monitor screens remember, else the first active one. */
async function pickWarehouse() {
  const warehouses = (await listWarehouses({ isActive: true, take: 50 })).items
  return warehouses.find((item) => item.id === preferredWarehouseId()) ?? warehouses[0]
}

/**
 * GET /api/warehouse/containers for the working Warehouse, every status (the default would hide reserved, in-transit
 * and held ones). Containers are scoped to a Warehouse through their storage location; those not yet on a shelf are
 * listed for every Warehouse.
 */
export async function listManagedContainers(): Promise<ContainerListing> {
  if (MOCK_MODE) return { warehouseName: 'Warehouse A', items: CONTAINERS, total: CONTAINERS.length }

  const warehouse = await pickWarehouse()
  if (!warehouse) return { warehouseName: null, items: [], total: 0 }

  const response = await listContainers({ warehouseId: warehouse.id, eligibleOnly: false, take: 500 })
  return {
    warehouseName: warehouse.name,
    total: response.total,
    items: response.items.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      sku: item.productSku,
      productName: item.productName,
      status: item.status as ContainerView['status'],
      locationCode: item.currentStorageLocationCode,
      currentLevelNo: item.currentLevelNo,
      supplierPackageBarcode: item.supplierPackageBarcode ?? undefined,
      updatedAt: item.updatedAt,
    })),
  }
}

export interface InventoryListing {
  /** Null when no active Warehouse exists yet. */
  warehouseName: string | null
  items: InventoryStockView[]
  /** Stock rows that exist in this Warehouse, which can be more than `items`. */
  total: number
}

/**
 * GET /api/warehouse/inventory for the working Warehouse. Each row is the number of Containers of one product at
 * one storage location and shelf level; the numbers change only through the Container lifecycle, so the table is
 * read-only. It stays empty until Containers are put away on shelves.
 */
export async function listManagedInventory(): Promise<InventoryListing> {
  if (MOCK_MODE) return { warehouseName: 'Warehouse A', items: INVENTORY, total: INVENTORY.length }

  const warehouse = await pickWarehouse()
  if (!warehouse) return { warehouseName: null, items: [], total: 0 }

  const response = await listInventory({ warehouseId: warehouse.id, take: 500 })
  return {
    warehouseName: warehouse.name,
    total: response.total,
    items: response.items.map((row) => ({
      id: row.id,
      productId: row.productId,
      sku: row.productSku,
      productName: row.productName,
      storageLocationId: row.storageLocationId,
      locationCode: row.storageLocationCode,
      levelNo: row.levelNo,
      containerCount: row.containerCount,
      updatedAt: row.updatedAt,
    })),
  }
}

/* ----------------------------------------------------------------------------------------- storage locations */

export interface LocationListing {
  /** The Warehouse the locations belong to; null when no active Warehouse exists yet. */
  warehouse: { id: string; name: string } | null
  items: StorageLocationView[]
}

/** An Endpoint of the published map that can still be given to a new location. */
export interface FreeEndpoint {
  id: string
  code: string
  name: string
}

function toLocationView(item: StorageLocationListItem): StorageLocationView {
  return {
    id: item.id,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName,
    endpointId: item.endpointId,
    endpointCode: item.endpointCode ?? '—',
    endpointName: item.endpointName ?? 'Unknown endpoint',
    code: item.code,
    name: item.name,
    isActive: item.isActive,
    createdAt: item.createdAt,
  }
}

/** GET /api/warehouse/storage-locations for the working Warehouse, inactive ones included. */
export async function listManagedLocations(): Promise<LocationListing> {
  if (MOCK_MODE) return { warehouse: { id: WAREHOUSES[0].id, name: WAREHOUSES[0].name }, items: STORAGE_LOCATIONS }

  const warehouse = await pickWarehouse()
  if (!warehouse) return { warehouse: null, items: [] }

  const response = await listStorageLocations({ warehouseId: warehouse.id, activeOnly: false })
  return { warehouse: { id: warehouse.id, name: warehouse.name }, items: response.items.map(toLocationView) }
}

// A Container is stored at a shelf or an inspection area; the other Endpoint types (docks, chargers, parking...) are not.
const STORABLE_ENDPOINT_TYPES = ['WAYPOINT', 'PARK']

/**
 * The enabled storage and inspection Endpoints of the warehouse's published map that no location uses yet.
 * Empty when no map is published.
 */
export async function listFreeEndpoints(warehouseId: string, takenEndpointIds: ReadonlySet<string>): Promise<FreeEndpoint[]> {
  if (MOCK_MODE) return ENDPOINT_OPTIONS.filter((endpoint) => !takenEndpointIds.has(endpoint.id))

  const map = await getActiveMapVersion(warehouseId)
  if (!map) return []
  const endpoints = await listEndpoints(map.id)
  return endpoints
    .filter((endpoint) => endpoint.isEnabled && STORABLE_ENDPOINT_TYPES.includes(endpoint.endpointType) && !takenEndpointIds.has(endpoint.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((endpoint) => ({ id: endpoint.id, code: endpoint.code, name: endpoint.name }))
}

/**
 * POST /api/warehouse/storage-locations (Admin only). The server upper-cases the code and starts the location active.
 * Rejects with `storage_location_code_taken`, `endpoint_already_used` (409), `endpoint_not_on_published_map`,
 * `endpoint_disabled` or `warehouse_inactive` (400).
 */
export async function createLocation(
  warehouse: { id: string; name: string },
  endpoint: FreeEndpoint,
  values: { code: string; name: string },
): Promise<StorageLocationView> {
  if (MOCK_MODE) {
    return {
      id: `mock-location-${Date.now()}`,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      endpointId: endpoint.id,
      endpointCode: endpoint.code,
      endpointName: endpoint.name,
      code: values.code.toUpperCase(),
      name: values.name,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
  }
  return toLocationView(await createStorageLocation({ warehouseId: warehouse.id, endpointId: endpoint.id, ...values }))
}

/** POST .../storage-locations/{id}/status. Rejects with `storage_location_in_use` while the location holds Containers. */
export async function setLocationStatus(location: StorageLocationView, isActive: boolean): Promise<StorageLocationView> {
  if (MOCK_MODE) return { ...location, isActive }
  return toLocationView(await setStorageLocationStatus(location.id, isActive))
}
