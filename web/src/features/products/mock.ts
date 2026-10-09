import type { Product, ProductCategory } from '@/shared/api/contracts'

export const CATEGORIES: ProductCategory[] = [
  { id: 'cat-pkg', code: 'PKG', name: 'Packaging', description: 'Boxes, wraps and cushioning material' },
  { id: 'cat-elec', code: 'ELEC', name: 'Electronics', description: 'Sensors, boards and optical components' },
  { id: 'cat-hw', code: 'HW', name: 'Hardware', description: 'Brackets, fasteners and structural parts' },
]

const created = '2026-08-01T09:00:00+07:00'

export const PRODUCTS: Product[] = [
  {
    id: 'prd-8821',
    categoryId: 'cat-pkg',
    sku: 'SKU-8821',
    supplierBarcode: '8935001788210',
    name: 'Carton Box - Standard',
    description: 'Standard 3-ply shipping carton',
    isActive: true,
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'prd-4410',
    categoryId: 'cat-elec',
    sku: 'SKU-4410',
    supplierBarcode: '8935001744100',
    name: 'Optical Sensor Unit',
    description: 'Inspection-grade optical sensor',
    isActive: true,
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'prd-2290',
    categoryId: 'cat-pkg',
    sku: 'SKU-2290',
    supplierBarcode: '8935001722900',
    name: 'Pallet Wrap Roll',
    description: 'Stretch wrap roll, 500mm width',
    isActive: true,
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'prd-7765',
    categoryId: 'cat-elec',
    sku: 'SKU-7765',
    supplierBarcode: '8935001777650',
    name: 'Circuit Board Tray',
    description: 'ESD-safe tray for PCB transport',
    isActive: false,
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'prd-3301',
    categoryId: 'cat-hw',
    sku: 'SKU-3301',
    supplierBarcode: '8935001733010',
    name: 'Steel Bracket Set',
    description: 'Mounting bracket set, galvanized',
    isActive: true,
    createdAt: created,
    updatedAt: created,
  },
  {
    id: 'prd-9012',
    categoryId: 'cat-pkg',
    sku: 'SKU-9012',
    supplierBarcode: '8935001790120',
    name: 'Foam Insert Pack',
    description: 'Protective foam insert pack',
    isActive: true,
    createdAt: created,
    updatedAt: created,
  },
]
