import { apiFetch } from './client';
import type { ContainerStatus, ShelfSlotOccupancy } from '../types/contracts';

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
  currentEndpointCode?: string | null;
  currentLevelNo: number | null;
  qty?: number;
  category?: string;
  zoneLabel?: string;
}

export interface ListContainersResponse {
  items: ContainerListItem[];
  total: number;
}

export type WarehouseZoneCode = 'ZONE_A' | 'ZONE_B' | 'ZONE_D' | 'DOCK' | 'STATION';

export interface StorageLocationListItem {
  id: string;
  warehouseId: string;
  endpointId: string;
  endpointCode: string;
  code: string;
  name: string;
  zone: WarehouseZoneCode;
  zoneLabel: string;
  isActive: boolean;
  shelfSlots: ShelfSlotOccupancy[];
}

export interface ListStorageLocationsResponse {
  items: StorageLocationListItem[];
  total: number;
}

export interface AllocatedStorageSlot {
  storageLocationId: string;
  storageLocationCode: string;
  storageLocationName: string;
  endpointId: string;
  endpointCode: string;
  levelNo: number;
  zone: WarehouseZoneCode;
  zoneLabel: string;
  displayLabel: string;
}

const DEFAULT_WAREHOUSE_ID = '11111111-1111-1111-1111-111111111111';

let SEED_STORAGE_LOCATIONS: StorageLocationListItem[] = [
  {
    id: 'a0000000-0000-0000-0005-000000000001',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000011',
    endpointCode: 'RACK-A-01',
    code: 'RACK-A-01',
    name: 'Rack A-01 (High-Velocity Pick)',
    zone: 'ZONE_A',
    zoneLabel: 'Storage Zone A',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-205',
        occupiedBySku: 'SS-8800',
        occupiedByProductName: 'Safety Sensors (SS-8800)',
      },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'a0000000-0000-0000-0005-000000000002',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000012',
    endpointCode: 'RACK-A-02',
    code: 'RACK-A-02',
    name: 'Rack A-02 (Standard Pallet Rack)',
    zone: 'ZONE_A',
    zoneLabel: 'Storage Zone A',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-201',
        occupiedBySku: 'BK-5520',
        occupiedByProductName: 'Bearing Kits (BK-5520)',
      },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'a0000000-0000-0000-0005-000000000003',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000013',
    endpointCode: 'RACK-A-03',
    code: 'RACK-A-03',
    name: 'Rack A-03 (Standard Pallet Rack)',
    zone: 'ZONE_A',
    zoneLabel: 'Storage Zone A',
    isActive: true,
    shelfSlots: [
      {
        levelNo: 1,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-202',
        occupiedBySku: 'DM-9910',
        occupiedByProductName: 'Drive Motors (DM-9910)',
      },
      { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'a0000000-0000-0000-0005-000000000004',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000014',
    endpointCode: 'RACK-A-04',
    code: 'RACK-A-04',
    name: 'Rack A-04 (Standard Pallet Rack)',
    zone: 'ZONE_A',
    zoneLabel: 'Storage Zone A',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
      {
        levelNo: 3,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-203',
        occupiedBySku: 'CB-4100',
        occupiedByProductName: 'Control Boards (CB-4100)',
      },
    ],
  },
  {
    id: 'a0000000-0000-0000-0005-000000000008',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000018',
    endpointCode: 'RACK-A-08',
    code: 'RACK-A-08',
    name: 'Rack A-08 (Consolidation Source)',
    zone: 'ZONE_A',
    zoneLabel: 'Storage Zone A',
    isActive: true,
    shelfSlots: [
      {
        levelNo: 1,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-301',
        occupiedBySku: 'EB-101',
        occupiedByProductName: 'Excess Buffer Stock (EB-101)',
      },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-302',
        occupiedBySku: 'SS-302',
        occupiedByProductName: 'Seasonal Spares (SS-302)',
      },
      {
        levelNo: 3,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-303',
        occupiedBySku: 'BF-900',
        occupiedByProductName: 'Bulk Fasteners (BF-900)',
      },
    ],
  },
  {
    id: 'b0000000-0000-0000-0005-000000000001',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000021',
    endpointCode: 'RACK-B-01',
    code: 'RACK-B-01',
    name: 'Rack B-01 (Heavy Reserve Bay)',
    zone: 'ZONE_B',
    zoneLabel: 'Storage Zone B',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-310',
        occupiedBySku: 'HS-200',
        occupiedByProductName: 'Heat Sink Modules',
      },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'b0000000-0000-0000-0005-000000000002',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000022',
    endpointCode: 'RACK-B-02',
    code: 'RACK-B-02',
    name: 'Rack B-02 (Heavy Reserve Bay)',
    zone: 'ZONE_B',
    zoneLabel: 'Storage Zone B',
    isActive: true,
    shelfSlots: [
      {
        levelNo: 1,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-210',
        occupiedBySku: 'MK-1120',
        occupiedByProductName: 'Drive Assembly Kit',
      },
      { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'b0000000-0000-0000-0005-000000000004',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000024',
    endpointCode: 'RACK-B-04',
    code: 'RACK-B-04',
    name: 'Rack B-04 (Heavy Reserve Bay)',
    zone: 'ZONE_B',
    zoneLabel: 'Storage Zone B',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-204',
        occupiedBySku: 'HV-7710',
        occupiedByProductName: 'Hydraulic Valves',
      },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
  {
    id: 'd0000000-0000-0000-0005-000000000001',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000041',
    endpointCode: 'RACK-D-01',
    code: 'RACK-D-01',
    name: 'Rack D-01 (Bulk Yard Buffer)',
    zone: 'ZONE_D',
    zoneLabel: 'Bulk Yard Zone D',
    isActive: true,
    shelfSlots: [
      {
        levelNo: 1,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-401',
        occupiedBySku: 'SA-8820',
        occupiedByProductName: 'Sensor Array (SA-8820)',
      },
      {
        levelNo: 2,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-402',
        occupiedBySku: 'CM-3100',
        occupiedByProductName: 'Control Module (CM-3100)',
      },
      {
        levelNo: 3,
        status: 'OCCUPIED',
        occupiedByBarcode: 'BOX-403',
        occupiedBySku: 'FA-2011',
        occupiedByProductName: 'Fastener Restock (FA-2011)',
      },
    ],
  },
  {
    id: 'd0000000-0000-0000-0005-000000000002',
    warehouseId: DEFAULT_WAREHOUSE_ID,
    endpointId: '00000000-0000-0000-0004-000000000042',
    endpointCode: 'RACK-D-02',
    code: 'RACK-D-02',
    name: 'Rack D-02 (Bulk Yard Buffer)',
    zone: 'ZONE_D',
    zoneLabel: 'Bulk Yard Zone D',
    isActive: true,
    shelfSlots: [
      { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
      { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
      { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
    ],
  },
];

let SEED_CONTAINERS: ContainerListItem[] = [
  // Backend demo containers (c1, c2, c3 from JobProvisionDemo / Seeder)
  {
    id: 'c1000000-0000-4000-8000-000000000001',
    barcode: 'CTN-DEMO-000001',
    status: 'STORED',
    productId: 'PROD-01',
    productSku: 'EC-9042',
    productName: 'Electronic Components (Batch 01)',
    currentStorageLocationId: 'b1000000-0000-4000-8000-000000000001',
    currentStorageLocationCode: 'RACK-B-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000021',
    currentEndpointCode: 'RACK-B-01',
    currentLevelNo: 1,
    qty: 50,
    category: 'Electronics',
    zoneLabel: 'Storage Zone B',
  },
  {
    id: 'c2000000-0000-4000-8000-000000000002',
    barcode: 'CTN-DEMO-000002',
    status: 'STORED',
    productId: 'PROD-02',
    productSku: 'SM-1040',
    productName: 'Sensor Modules (Batch 02)',
    currentStorageLocationId: 'b2000000-0000-4000-8000-000000000002',
    currentStorageLocationCode: 'RACK-B-02',
    currentEndpointId: '00000000-0000-0000-0004-000000000022',
    currentEndpointCode: 'RACK-B-02',
    currentLevelNo: 2,
    qty: 35,
    category: 'Electronics',
    zoneLabel: 'Storage Zone B',
  },
  {
    id: 'c3000000-0000-4000-8000-000000000003',
    barcode: 'CTN-DEMO-000003',
    status: 'STORED',
    productId: 'PROD-03',
    productSku: 'CM-3100',
    productName: 'Control Modules (Batch 03)',
    currentStorageLocationId: 'b3000000-0000-4000-8000-000000000003',
    currentStorageLocationCode: 'RACK-B-03',
    currentEndpointId: '00000000-0000-0000-0004-000000000023',
    currentEndpointCode: 'RACK-B-03',
    currentLevelNo: 3,
    qty: 20,
    category: 'Electronics',
    zoneLabel: 'Storage Zone B',
  },
  // Staged at Inbound Dock 01 (Unassigned destination until Staff configures putaway)
  {
    id: '632907a7-a0a6-4201-adea-c8ce8e468e75',
    barcode: 'BOX-101',
    status: 'STAGED',
    productId: 'PROD-01',
    productSku: 'EC-9042',
    productName: 'Electronic Components',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 45,
    category: 'Electronics',
    zoneLabel: 'Inbound Dock 01',
  },
  {
    id: 'a454b0a6-d731-4dc0-aed3-7c53e40c63a8',
    barcode: 'BOX-102',
    status: 'STAGED',
    productId: 'PROD-03',
    productSku: 'CM-3100',
    productName: 'Control Modules (CM-3100)',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 25,
    category: 'Electronics',
    zoneLabel: 'Inbound Dock 01',
  },
  {
    id: 'b565c0b7-e842-5ed1-bfe4-8d64f51d74b9',
    barcode: 'BOX-103',
    status: 'STAGED',
    productId: 'PROD-06',
    productSku: 'PS-4402',
    productName: 'Power Supply Modules',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 18,
    category: 'Electronics',
    zoneLabel: 'Inbound Dock 01',
  },
  {
    id: 'c676d1c8-f953-6fe2-c0f5-9e75a62e85ca',
    barcode: 'BOX-104',
    status: 'STAGED',
    productId: 'PROD-07',
    productSku: 'HV-7710',
    productName: 'Hydraulic Valves',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 12,
    category: 'Mechanical',
    zoneLabel: 'Inbound Dock 01',
  },
  {
    id: 'd787e2d9-0a64-70f3-d106-af86b73f96db',
    barcode: 'BOX-105',
    status: 'STAGED',
    productId: 'PROD-02',
    productSku: 'SA-8820',
    productName: 'Sensor Arrays (SA-8820)',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 60,
    category: 'Sensors',
    zoneLabel: 'Inbound Dock 01',
  },
  {
    id: 'e898f3ea-1b75-8104-e217-b097c84007ec',
    barcode: 'BOX-106',
    status: 'STAGED',
    productId: 'PROD-08',
    productSku: 'IR-1105',
    productName: 'Industrial Relays (IR-1105)',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000001',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: 35,
    category: 'Electronics',
    zoneLabel: 'Inbound Dock 01',
  },
  // Stored in Zone A (Available for Outbound Retrieval or Reallocation)
  {
    id: 'c-201',
    barcode: 'BOX-201',
    status: 'STORED',
    productId: 'PROD-09',
    productSku: 'BK-5520',
    productName: 'Bearing Kits (BK-5520)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000002',
    currentStorageLocationCode: 'RACK-A-02',
    currentEndpointId: '00000000-0000-0000-0004-000000000012',
    currentEndpointCode: 'RACK-A-02',
    currentLevelNo: 2,
    qty: 20,
    category: 'Mechanical',
    zoneLabel: 'Storage Zone A',
  },
  {
    id: 'c-202',
    barcode: 'BOX-202',
    status: 'STORED',
    productId: 'PROD-10',
    productSku: 'DM-9910',
    productName: 'Drive Motors (DM-9910)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000003',
    currentStorageLocationCode: 'RACK-A-03',
    currentEndpointId: '00000000-0000-0000-0004-000000000013',
    currentEndpointCode: 'RACK-A-03',
    currentLevelNo: 1,
    qty: 14,
    category: 'Mechanical',
    zoneLabel: 'Storage Zone A',
  },
  {
    id: 'c-203',
    barcode: 'BOX-203',
    status: 'STORED',
    productId: 'PROD-11',
    productSku: 'CB-4100',
    productName: 'Control Boards (CB-4100)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000004',
    currentStorageLocationCode: 'RACK-A-04',
    currentEndpointId: '00000000-0000-0000-0004-000000000014',
    currentEndpointCode: 'RACK-A-04',
    currentLevelNo: 3,
    qty: 32,
    category: 'Electronics',
    zoneLabel: 'Storage Zone A',
  },
  {
    id: 'c-205',
    barcode: 'BOX-205',
    status: 'STORED',
    productId: 'PROD-12',
    productSku: 'SS-8800',
    productName: 'Safety Sensors (SS-8800)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000001',
    currentStorageLocationCode: 'RACK-A-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000011',
    currentEndpointCode: 'RACK-A-01',
    currentLevelNo: 2,
    qty: 18,
    category: 'Sensors',
    zoneLabel: 'Storage Zone A',
  },
  // Stored in Rack A-08 (Reallocation candidates)
  {
    id: 'c-301',
    barcode: 'BOX-301',
    status: 'STORED',
    productId: 'PROD-13',
    productSku: 'EB-101',
    productName: 'Excess Buffer Stock (EB-101)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000008',
    currentStorageLocationCode: 'RACK-A-08',
    currentEndpointId: '00000000-0000-0000-0004-000000000018',
    currentEndpointCode: 'RACK-A-08',
    currentLevelNo: 1,
    qty: 40,
    category: 'Packaging',
    zoneLabel: 'Storage Zone A',
  },
  {
    id: 'c-302',
    barcode: 'BOX-302',
    status: 'STORED',
    productId: 'PROD-14',
    productSku: 'SS-302',
    productName: 'Seasonal Spares (SS-302)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000008',
    currentStorageLocationCode: 'RACK-A-08',
    currentEndpointId: '00000000-0000-0000-0004-000000000018',
    currentEndpointCode: 'RACK-A-08',
    currentLevelNo: 2,
    qty: 25,
    category: 'Mechanical',
    zoneLabel: 'Storage Zone A',
  },
  {
    id: 'c-303',
    barcode: 'BOX-303',
    status: 'STORED',
    productId: 'PROD-15',
    productSku: 'BF-900',
    productName: 'Bulk Fasteners (BF-900)',
    currentStorageLocationId: 'a0000000-0000-0000-0005-000000000008',
    currentStorageLocationCode: 'RACK-A-08',
    currentEndpointId: '00000000-0000-0000-0004-000000000018',
    currentEndpointCode: 'RACK-A-08',
    currentLevelNo: 3,
    qty: 100,
    category: 'Mechanical',
    zoneLabel: 'Storage Zone A',
  },
  // Stored in Zone B
  {
    id: 'c-204',
    barcode: 'BOX-204',
    status: 'STORED',
    productId: 'PROD-07',
    productSku: 'HV-7710',
    productName: 'Hydraulic Valves',
    currentStorageLocationId: 'b0000000-0000-0000-0005-000000000004',
    currentStorageLocationCode: 'RACK-B-04',
    currentEndpointId: '00000000-0000-0000-0004-000000000024',
    currentEndpointCode: 'RACK-B-04',
    currentLevelNo: 2,
    qty: 16,
    category: 'Mechanical',
    zoneLabel: 'Storage Zone B',
  },
  // Stored in Bulk Yard D (Replenishment Reserve)
  {
    id: 'c-r01',
    barcode: 'BOX-401',
    status: 'STORED',
    productId: 'PROD-02',
    productSku: 'SA-8820',
    productName: 'Sensor Array (SA-8820)',
    currentStorageLocationId: 'd0000000-0000-0000-0005-000000000001',
    currentStorageLocationCode: 'RACK-D-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000041',
    currentEndpointCode: 'RACK-D-01',
    currentLevelNo: 1,
    qty: 50,
    category: 'Sensors',
    zoneLabel: 'Bulk Yard Zone D',
  },
  {
    id: 'c-r02',
    barcode: 'BOX-402',
    status: 'STORED',
    productId: 'PROD-03',
    productSku: 'CM-3100',
    productName: 'Control Module (CM-3100)',
    currentStorageLocationId: 'd0000000-0000-0000-0005-000000000001',
    currentStorageLocationCode: 'RACK-D-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000041',
    currentEndpointCode: 'RACK-D-01',
    currentLevelNo: 2,
    qty: 30,
    category: 'Electronics',
    zoneLabel: 'Bulk Yard Zone D',
  },
  {
    id: 'c-r03',
    barcode: 'BOX-403',
    status: 'STORED',
    productId: 'PROD-16',
    productSku: 'FA-2011',
    productName: 'Fastener Restock (FA-2011)',
    currentStorageLocationId: 'd0000000-0000-0000-0005-000000000001',
    currentStorageLocationCode: 'RACK-D-01',
    currentEndpointId: '00000000-0000-0000-0004-000000000041',
    currentEndpointCode: 'RACK-D-01',
    currentLevelNo: 3,
    qty: 200,
    category: 'Mechanical',
    zoneLabel: 'Bulk Yard Zone D',
  },
  // Totes at QA Station 02 (Point-to-Point)
  {
    id: 'c-p01',
    barcode: 'TOTE-QA-01',
    status: 'STAGED',
    productId: 'PROD-04',
    productSku: 'MK-1120',
    productName: 'Drive Assembly Kit',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000031',
    currentEndpointCode: 'QA-02',
    currentLevelNo: null,
    qty: 15,
    category: 'Mechanical',
    zoneLabel: 'QA Station 02',
  },
  {
    id: 'c-p02',
    barcode: 'TOTE-QA-02',
    status: 'STAGED',
    productId: 'PROD-17',
    productSku: 'PS-882',
    productName: 'Passed Sub-modules',
    currentStorageLocationId: null,
    currentStorageLocationCode: null,
    currentEndpointId: '00000000-0000-0000-0004-000000000031',
    currentEndpointCode: 'QA-02',
    currentLevelNo: null,
    qty: 22,
    category: 'Electronics',
    zoneLabel: 'QA Station 02',
  },
];

// In-memory container store for newly packed containers
let REGISTERED_CONTAINERS: ContainerListItem[] = [];

export function getRegisteredContainers(): ContainerListItem[] {
  return REGISTERED_CONTAINERS;
}

export function getStorageLocationsSnapshot(): StorageLocationListItem[] {
  return SEED_STORAGE_LOCATIONS;
}

export function getSeedContainersSnapshot(): ContainerListItem[] {
  return [...REGISTERED_CONTAINERS, ...SEED_CONTAINERS];
}

/**
 * Automatically finds the first `count` available (Rack + Level) slots in the requested zone.
 */
export function autoAllocateStorageSlots(
  zone: WarehouseZoneCode,
  count: number,
  excludeSlotKeys: string[] = []
): AllocatedStorageSlot[] {
  const excluded = new Set(excludeSlotKeys);
  const candidates = SEED_STORAGE_LOCATIONS.filter((loc) => loc.isActive && loc.zone === zone);
  const results: AllocatedStorageSlot[] = [];

  for (const rack of candidates) {
    for (const slot of rack.shelfSlots) {
      const slotKey = `${rack.id}:${slot.levelNo}`;
      if (slot.status === 'AVAILABLE' && !excluded.has(slotKey)) {
        results.push({
          storageLocationId: rack.id,
          storageLocationCode: rack.code,
          storageLocationName: rack.name,
          endpointId: rack.endpointId,
          endpointCode: rack.endpointCode,
          levelNo: slot.levelNo,
          zone: rack.zone,
          zoneLabel: rack.zoneLabel,
          displayLabel: `${rack.code} · Level ${slot.levelNo}`,
        });
        if (results.length >= count) {
          return results;
        }
      }
    }
  }
  return results;
}

/**
 * Marks allocated rack shelf levels as RESERVED in the in-memory store when a Transport Request is dispatched.
 */
export function reserveStorageSlots(
  allocations: Array<{
    storageLocationId: string | null;
    levelNo: number | null;
    barcode: string;
    sku?: string;
    productName?: string;
  }>
) {
  SEED_STORAGE_LOCATIONS = SEED_STORAGE_LOCATIONS.map((rack) => {
    const matching = allocations.filter(
      (a) => a.storageLocationId === rack.id && a.levelNo !== null
    );
    if (matching.length === 0) return rack;

    return {
      ...rack,
      shelfSlots: rack.shelfSlots.map((slot) => {
        const hit = matching.find((m) => m.levelNo === slot.levelNo);
        if (!hit) return slot;
        return {
          ...slot,
          status: 'RESERVED',
          occupiedByBarcode: hit.barcode,
          occupiedBySku: hit.sku || slot.occupiedBySku,
          occupiedByProductName: hit.productName || slot.occupiedByProductName,
        };
      }),
    };
  });
}

export function normalizeProductName(name?: string | null): string {
  if (!name) return 'Electronic Components Tote';
  if (/thùng linh kiện|linh kiện demo/i.test(name)) {
    return 'Electronic Components Tote';
  }
  return name;
}

export function normalizeWarehouseName(name?: string | null): string {
  if (!name) return 'WaroTrans Central Facility';
  if (/kho demo|kho mô phỏng/i.test(name)) {
    return 'WaroTrans Central Facility';
  }
  return name;
}

export function normalizeStorageLocationName(name?: string | null, code?: string | null): string {
  if (!name) return code ? `Storage Bay ${code}` : 'Storage Bay';
  if (/vị trí lưu trữ/i.test(name)) {
    return code ? `Storage Bay (${code})` : name.replace(/vị trí lưu trữ/i, 'Storage Bay').trim();
  }
  return name;
}

export function normalizeWorkflowDisplayName(code?: string | null, name?: string | null): string {
  const combined = `${code || ''} ${name || ''}`;
  if (/INTERNAL_RELOCATION|vận chuyển nội bộ|reallocation/i.test(combined)) {
    return 'Internal Relocation';
  }
  if (/INBOUND_PUTAWAY|nhập kho/i.test(combined)) {
    return 'Inbound Putaway';
  }
  if (/OUTBOUND_RETRIEVAL|xuất kho/i.test(combined)) {
    return 'Outbound Retrieval';
  }
  if (/REPLENISHMENT|bổ sung/i.test(combined)) {
    return 'Replenishment';
  }
  if (/POINT_TO_POINT/i.test(combined)) {
    return 'Point-to-Point';
  }
  return name || (code ? code.replace(/_/g, ' ') : 'Internal Relocation');
}

function normalizeContainerItem(c: ContainerListItem): ContainerListItem {
  return {
    ...c,
    productName: normalizeProductName(c.productName),
  };
}

export async function listWarehouses(params?: { isActive?: boolean; skip?: number; take?: number }) {
  try {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    if (params?.skip !== undefined) query.set('skip', String(params.skip));
    if (params?.take !== undefined) query.set('take', String(params.take));
    const qs = query.toString();
    const res = await apiFetch<ListWarehousesResponse>(`/api/warehouse/warehouses${qs ? `?${qs}` : ''}`);
    if (res?.items) {
      return {
        ...res,
        items: res.items.map((w) => ({ ...w, name: normalizeWarehouseName(w.name) })),
      };
    }
    return res;
  } catch {
    return {
      items: [
        {
          id: DEFAULT_WAREHOUSE_ID,
          code: 'WH-CENTRAL-01',
          name: 'WaroTrans Central Distribution Facility',
          isActive: true,
          createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
      ],
      total: 1,
    };
  }
}

export async function listContainers(params: {
  warehouseId: string;
  search?: string;
  eligibleOnly?: boolean;
  take?: number;
}): Promise<ListContainersResponse> {
  try {
    const query = new URLSearchParams();
    query.set('warehouseId', params.warehouseId);
    if (params.search) query.set('search', params.search);
    if (params.eligibleOnly !== undefined) query.set('eligibleOnly', String(params.eligibleOnly));
    if (params.take !== undefined) query.set('take', String(params.take));
    const qs = query.toString();
    const res = await apiFetch<ListContainersResponse>(`/api/warehouse/containers${qs ? `?${qs}` : ''}`);
    if (res?.items && res.items.length > 0) {
      const merged = [...REGISTERED_CONTAINERS, ...res.items].map(normalizeContainerItem);
      return { items: merged, total: merged.length };
    }
  } catch {
    // Fallback to reactive in-memory container store
  }

  let all = [...REGISTERED_CONTAINERS, ...SEED_CONTAINERS].map(normalizeContainerItem);
  if (params.search) {
    const q = params.search.toLowerCase().trim();
    all = all.filter(
      (c) =>
        c.barcode.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.productSku.toLowerCase().includes(q) ||
        (c.currentStorageLocationCode || '').toLowerCase().includes(q) ||
        (c.currentEndpointCode || '').toLowerCase().includes(q)
    );
  }
  return {
    items: params.take ? all.slice(0, params.take) : all,
    total: all.length,
  };
}

export async function getContainer(id: string) {
  const res = await apiFetch<ContainerListItem>(`/api/warehouse/containers/${id}`);
  return res ? normalizeContainerItem(res) : res;
}

export async function getContainerByBarcode(barcode: string) {
  const res = await apiFetch<ContainerListItem>(`/api/warehouse/containers/by-barcode/${encodeURIComponent(barcode)}`);
  return res ? normalizeContainerItem(res) : res;
}

export async function listStorageLocations(params: {
  warehouseId: string;
  activeOnly?: boolean;
}): Promise<ListStorageLocationsResponse> {
  try {
    const query = new URLSearchParams();
    query.set('warehouseId', params.warehouseId);
    if (params.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));
    const qs = query.toString();
    const res = await apiFetch<{ items: any[]; total: number }>(
      `/api/warehouse/storage-locations${qs ? `?${qs}` : ''}`
    );
    if (res?.items && res.items.length > 0) {
      const enriched: StorageLocationListItem[] = res.items.map((loc) => {
        const cleanName = normalizeStorageLocationName(loc.name, loc.code);
        const seedMatch = SEED_STORAGE_LOCATIONS.find((s) => s.code === loc.code || s.id === loc.id);
        if (seedMatch) {
          return {
            ...seedMatch,
            id: loc.id,
            warehouseId: loc.warehouseId,
            endpointId: loc.endpointId,
            code: loc.code,
            name: cleanName,
            isActive: loc.isActive,
          };
        }
        const zone: WarehouseZoneCode = loc.code?.includes('-B-')
          ? 'ZONE_B'
          : loc.code?.includes('-D-')
          ? 'ZONE_D'
          : 'ZONE_A';
        return {
          id: loc.id,
          warehouseId: loc.warehouseId,
          endpointId: loc.endpointId,
          endpointCode: loc.code,
          code: loc.code,
          name: cleanName,
          zone,
          zoneLabel:
            zone === 'ZONE_B'
              ? 'Storage Zone B'
              : zone === 'ZONE_D'
              ? 'Bulk Yard Zone D'
              : 'Storage Zone A',
          isActive: loc.isActive,
          shelfSlots: [
            { levelNo: 1, status: 'AVAILABLE', occupiedByBarcode: null },
            { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
            { levelNo: 3, status: 'AVAILABLE', occupiedByBarcode: null },
          ],
        };
      });
      return { items: enriched, total: enriched.length };
    }
  } catch {
    // Fallback to rich in-memory storage locations
  }

  const items = params.activeOnly
    ? SEED_STORAGE_LOCATIONS.filter((l) => l.isActive)
    : [...SEED_STORAGE_LOCATIONS];
  return { items, total: items.length };
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
  category?: string;
}

export interface CreateContainerResponse {
  registrationMode?: 'LIVE_API' | 'LOCAL_SESSION_SIM';
  id: string;
  barcode: string;
  status: string;
  productId: string;
  productName?: string;
  productSku?: string;
  currentEndpointId?: string;
  createdAt: string;
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
        currentStorageLocationCode: null,
        currentEndpointId: 'ee000000-0000-4000-8000-000000000101',
        currentEndpointCode: 'DOCK-IN-01',
        currentLevelNo: null,
        qty: body.qty || 24,
        category: body.category || 'Electronics',
        zoneLabel: 'Inbound Dock 01',
      });
      return { ...res, registrationMode: 'LIVE_API' };
    }
  } catch (err) {
    console.warn('Backend createContainer API call failed, using graceful offline registration:', err);
  }

  // Local session sim aid until WarehouseModule maps POST /api/warehouse/containers.
  const generatedBarcode = `BOX-${Math.floor(100 + Math.random() * 900)}`;
  const containerRecord: CreateContainerResponse = {
    id: `cont-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    barcode: generatedBarcode,
    status: 'CREATED',
    productId: body.productId,
    productName: body.productName || 'Warehouse Item',
    productSku: body.productSku || 'SKU-GEN',
    currentEndpointId: 'ee000000-0000-4000-8000-000000000101',
    registrationMode: 'LOCAL_SESSION_SIM',
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
    currentStorageLocationCode: null,
    currentEndpointId: 'ee000000-0000-4000-8000-000000000101',
    currentEndpointCode: 'DOCK-IN-01',
    currentLevelNo: null,
    qty: body.qty || 24,
    category: body.category || 'Electronics',
    zoneLabel: 'Inbound Dock 01',
  });

  return containerRecord;
}
