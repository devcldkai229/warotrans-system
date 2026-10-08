import type {
  ContainerStatus,
  ContainerView,
  InventoryStockView,
  Product,
  ProductCategory,
  StorageLocationView,
} from '@/shared/api/contracts'
import { SCENE_ENDPOINTS, findEndpointByName } from '@/shared/map/scene'

// Master data of the Warehouse module (warehouse.* tables). Every list follows the DB columns and the rules:
// a Container holds one Product type, InventoryStock counts Containers per Product/Location/Level (not units),
// and a StorageLocation points at exactly one Navigation Endpoint.

// TODO(backend): Warehouse comes from the Warehouse module (warehouse.warehouses: code, name, address, timezone).
export const WAREHOUSES = [{ id: 'c0000000-0000-4000-8000-000000000001', code: 'WH-A', name: 'Warehouse A' }]

export const CATEGORIES: ProductCategory[] = [
  { id: 'cat-pkg', code: 'PKG', name: 'Packaging', description: 'Boxes, wraps and cushioning material' },
  { id: 'cat-elec', code: 'ELEC', name: 'Electronics', description: 'Sensors, boards and optical components' },
  { id: 'cat-hw', code: 'HW', name: 'Hardware', description: 'Brackets, fasteners and structural parts' },
]

const created = '2026-08-01T09:00:00+07:00'

function product(
  sku: string,
  name: string,
  categoryId: string,
  description: string,
  supplierBarcode: string,
  isActive = true,
): Product {
  return { id: `prd-${sku.slice(4)}`, categoryId, sku, name, description, supplierBarcode, isActive, createdAt: created, updatedAt: created }
}

export const PRODUCTS: Product[] = [
  product('SKU-8821', 'Carton Box - Standard', 'cat-pkg', 'Standard 3-ply shipping carton', '8935001788210'),
  product('SKU-4410', 'Optical Sensor Unit', 'cat-elec', 'Inspection-grade optical sensor', '8935001744100'),
  product('SKU-2290', 'Pallet Wrap Roll', 'cat-pkg', 'Stretch wrap roll, 500mm width', '8935001722900'),
  product('SKU-7765', 'Circuit Board Tray', 'cat-elec', 'ESD-safe tray for PCB transport', '8935001777650', false),
  product('SKU-3301', 'Steel Bracket Set', 'cat-hw', 'Mounting bracket set, galvanized', '8935001733010'),
  product('SKU-9012', 'Foam Insert Pack', 'cat-pkg', 'Protective foam insert pack', '8935001790120'),
]

/** Each location points at one Endpoint of the shared map (an Endpoint can serve only one location). */
function location(code: string, name: string, endpointName: string, isActive = true): StorageLocationView {
  const endpoint = findEndpointByName(endpointName)
  if (!endpoint) throw new Error(`Unknown endpoint ${endpointName}`)
  return {
    id: `loc-${code.toLowerCase()}`,
    warehouseId: WAREHOUSES[0].id,
    warehouseName: WAREHOUSES[0].name,
    endpointId: endpoint.id,
    endpointCode: endpoint.code,
    endpointName: endpoint.name,
    code,
    name,
    isActive,
    createdAt: created,
  }
}

export const STORAGE_LOCATIONS: StorageLocationView[] = [
  location('SHELF-A1', 'Shelf A1', 'Rack A-01'),
  location('SHELF-A2', 'Shelf A2', 'Rack A-02'),
  location('SHELF-B1', 'Shelf B1', 'Rack B-03'),
  location('SHELF-B2', 'Shelf B2', 'Rack B-04', false),
  location('SHELF-C1', 'Shelf C1', 'Rack C-01'),
  location('SHELF-QA', 'QA Shelf', 'Quality-01'),
]

/** Endpoints that can still be given to a new location. */
export const ENDPOINT_OPTIONS = SCENE_ENDPOINTS.filter(
  (endpoint) => endpoint.endpointType === 'STORAGE' || endpoint.endpointType === 'INSPECTION',
)

/* ---------------------------------------------------------------------------------------- containers */

let sequence = 200
const sku = (value: string) => PRODUCTS.find((item) => item.sku === value)!

function container(
  barcode: string,
  skuValue: string,
  status: ContainerStatus,
  locationCode: string | null = null,
  levelNo: number | null = null,
  daysAgo = 3,
): ContainerView {
  const item = sku(skuValue)
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  return {
    id: `ctn-${barcode.slice(-6)}`,
    productId: item.id,
    barcode,
    supplierPackageBarcode: item.supplierBarcode,
    status,
    currentStorageLocationId: locationCode ? `loc-${locationCode.toLowerCase()}` : null,
    currentLevelNo: levelNo,
    createdAt: at,
    updatedAt: at,
    sku: item.sku,
    productName: item.name,
    locationCode,
  }
}

/** `count` Containers of one Product put away on a shelf level. */
function stored(skuValue: string, locationCode: string, levelNo: number, count: number): ContainerView[] {
  return Array.from({ length: count }, (_, index) =>
    container(`CTN-20260901-${String(sequence++).padStart(6, '0')}`, skuValue, 'STORED', locationCode, levelNo, 1 + index),
  )
}

// Barcodes below match the Containers the Transport Request mock moves.
export const CONTAINERS: ContainerView[] = [
  container('CTN-20260903-000118', 'SKU-8821', 'IN_TRANSIT', null, null, 0),
  container('CTN-20260903-000121', 'SKU-4410', 'IN_TRANSIT', null, null, 0),
  container('CTN-20260903-000112', 'SKU-4410', 'IN_TRANSIT', null, null, 0),
  container('CTN-20260903-000113', 'SKU-4410', 'RESERVED', null, null, 0),
  container('CTN-20260903-000125', 'SKU-9012', 'IN_TRANSIT', null, null, 0),
  container('CTN-20260903-000139', 'SKU-8821', 'IN_TRANSIT', null, null, 0),
  container('CTN-20260903-000130', 'SKU-8821', 'RESERVED', null, null, 0),
  container('CTN-20260903-000131', 'SKU-8821', 'RESERVED', null, null, 0),
  container('CTN-20260903-000132', 'SKU-8821', 'RESERVED', null, null, 0),
  container('CTN-20260903-000133', 'SKU-4410', 'RESERVED', null, null, 0),
  container('CTN-20260903-000140', 'SKU-3301', 'PACKED', null, null, 0),
  container('CTN-20260903-000085', 'SKU-7765', 'HOLD', 'SHELF-B1', 1, 6),
  container('CTN-20260903-000102', 'SKU-2290', 'HOLD', 'SHELF-A2', 3, 2),
  container('CTN-20260903-000150', 'SKU-9012', 'EMPTY', null, null, 5),
  container('CTN-20260903-000151', 'SKU-3301', 'CREATED', null, null, 0),
  container('CTN-20260903-000152', 'SKU-8821', 'OUT_OF_SERVICE', null, null, 12),
  container('CTN-20260903-000110', 'SKU-9012', 'STORED', 'SHELF-C1', 1, 2),
  container('CTN-20260903-000100', 'SKU-2290', 'STORED', 'SHELF-A2', 3, 2),
  container('CTN-20260903-000101', 'SKU-2290', 'STORED', 'SHELF-A2', 3, 2),
  ...stored('SKU-8821', 'SHELF-A1', 2, 6),
  ...stored('SKU-4410', 'SHELF-QA', 1, 2),
  ...stored('SKU-2290', 'SHELF-A2', 3, 2),
  ...stored('SKU-7765', 'SHELF-B1', 1, 1),
  ...stored('SKU-3301', 'SHELF-B2', 2, 3),
  ...stored('SKU-9012', 'SHELF-C1', 1, 3),
]

/**
 * InventoryStock is the count of STORED Containers per Product, StorageLocation and level (rules/02), so it is
 * derived here and can never disagree with the Containers list. TODO(backend): read it from warehouse.inventory_stocks.
 */
export const INVENTORY: InventoryStockView[] = (() => {
  const groups = new Map<string, InventoryStockView>()
  for (const item of CONTAINERS) {
    if (item.status !== 'STORED' || !item.locationCode || item.currentLevelNo == null) continue
    const key = `${item.productId}|${item.locationCode}|${item.currentLevelNo}`
    const row = groups.get(key)
    if (row) {
      row.containerCount += 1
      if (item.updatedAt > row.updatedAt) row.updatedAt = item.updatedAt
    } else {
      groups.set(key, {
        id: `inv-${groups.size + 1}`,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        storageLocationId: item.currentStorageLocationId ?? '',
        locationCode: item.locationCode,
        levelNo: item.currentLevelNo,
        containerCount: 1,
        updatedAt: item.updatedAt,
      })
    }
  }
  return [...groups.values()]
})()
