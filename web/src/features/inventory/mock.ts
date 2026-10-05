import type { InventoryStockView, StorageLocationView } from '@/shared/api/contracts'

const created = '2026-08-01T09:00:00+07:00'

// TODO(backend): Warehouse and Navigation Endpoint lookups come from other modules' public Contracts.
export const WAREHOUSES = [
  { id: 'wh-1', name: 'Warehouse 1' },
  { id: 'wh-2', name: 'Warehouse 2' },
]

export const ENDPOINT_OPTIONS = [
  { id: 'ep-storage-a1', code: 'EP-STORAGE-A1' },
  { id: 'ep-storage-a2', code: 'EP-STORAGE-A2' },
  { id: 'ep-storage-b1', code: 'EP-STORAGE-B1' },
  { id: 'ep-storage-b2', code: 'EP-STORAGE-B2' },
  { id: 'ep-storage-c1', code: 'EP-STORAGE-C1' },
  { id: 'ep-inspection-1', code: 'EP-INSPECTION-01' },
  { id: 'ep-storage-d1', code: 'EP-STORAGE-D1' },
]

export const STORAGE_LOCATIONS: StorageLocationView[] = [
  { id: 'loc-a1', warehouseId: 'wh-1', warehouseName: 'Warehouse 1', endpointId: 'ep-storage-a1', endpointCode: 'EP-STORAGE-A1', code: 'SHELF-A1', name: 'Shelf A1', isActive: true, createdAt: created },
  { id: 'loc-a2', warehouseId: 'wh-1', warehouseName: 'Warehouse 1', endpointId: 'ep-storage-a2', endpointCode: 'EP-STORAGE-A2', code: 'SHELF-A2', name: 'Shelf A2', isActive: true, createdAt: created },
  { id: 'loc-b1', warehouseId: 'wh-1', warehouseName: 'Warehouse 1', endpointId: 'ep-storage-b1', endpointCode: 'EP-STORAGE-B1', code: 'SHELF-B1', name: 'Shelf B1', isActive: true, createdAt: created },
  { id: 'loc-b2', warehouseId: 'wh-1', warehouseName: 'Warehouse 1', endpointId: 'ep-storage-b2', endpointCode: 'EP-STORAGE-B2', code: 'SHELF-B2', name: 'Shelf B2', isActive: false, createdAt: created },
  { id: 'loc-qa', warehouseId: 'wh-2', warehouseName: 'Warehouse 2', endpointId: 'ep-inspection-1', endpointCode: 'EP-INSPECTION-01', code: 'SHELF-QA', name: 'QA Shelf', isActive: true, createdAt: created },
  { id: 'loc-c1', warehouseId: 'wh-2', warehouseName: 'Warehouse 2', endpointId: 'ep-storage-c1', endpointCode: 'EP-STORAGE-C1', code: 'SHELF-C1', name: 'Shelf C1', isActive: true, createdAt: created },
]

// ContainerCount is the number of Containers (V1), not product units.
export const INVENTORY: InventoryStockView[] = [
  { id: 'inv-1', productId: 'prd-8821', sku: 'SKU-8821', productName: 'Carton Box - Standard', storageLocationId: 'loc-a1', locationCode: 'SHELF-A1', levelNo: 2, containerCount: 18, updatedAt: '2026-09-19T14:02:00+07:00' },
  { id: 'inv-2', productId: 'prd-4410', sku: 'SKU-4410', productName: 'Optical Sensor Unit', storageLocationId: 'loc-qa', locationCode: 'SHELF-QA', levelNo: 1, containerCount: 2, updatedAt: '2026-09-19T09:15:00+07:00' },
  { id: 'inv-3', productId: 'prd-2290', sku: 'SKU-2290', productName: 'Pallet Wrap Roll', storageLocationId: 'loc-a2', locationCode: 'SHELF-A2', levelNo: 3, containerCount: 4, updatedAt: '2026-09-18T17:40:00+07:00' },
  { id: 'inv-4', productId: 'prd-7765', sku: 'SKU-7765', productName: 'Circuit Board Tray', storageLocationId: 'loc-b1', locationCode: 'SHELF-B1', levelNo: 1, containerCount: 1, updatedAt: '2026-09-20T08:05:00+07:00' },
  { id: 'inv-5', productId: 'prd-3301', sku: 'SKU-3301', productName: 'Steel Bracket Set', storageLocationId: 'loc-b2', locationCode: 'SHELF-B2', levelNo: 2, containerCount: 3, updatedAt: '2026-09-17T11:22:00+07:00' },
  { id: 'inv-6', productId: 'prd-9012', sku: 'SKU-9012', productName: 'Foam Insert Pack', storageLocationId: 'loc-c1', locationCode: 'SHELF-C1', levelNo: 1, containerCount: 9, updatedAt: '2026-09-19T20:51:00+07:00' },
]
