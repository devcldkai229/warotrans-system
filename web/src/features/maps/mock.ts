import type { MapVersion, Zone } from '@/shared/api/contracts'

const WAREHOUSE_ID = 'c0000000-0000-4000-8000-000000000001'

export const MAP_VERSIONS: MapVersion[] = [
  {
    id: 'a1000000-0000-4000-8000-000000000008',
    warehouseId: WAREHOUSE_ID,
    versionNo: 8,
    name: 'MAP-WH01-V008',
    status: 'DRAFT',
    createdAt: '2026-08-18T16:40:00+07:00',
    publishedAt: null,
    modifiedAt: '2026-08-19T09:12:00+07:00',
    author: 'thangho',
    notes: 'Split Zone C into two directional sub-zones',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000007',
    warehouseId: WAREHOUSE_ID,
    versionNo: 7,
    name: 'MAP-WH01-V007',
    status: 'PUBLISHED',
    createdAt: '2026-08-14T10:22:00+07:00',
    publishedAt: '2026-08-14T16:40:00+07:00',
    modifiedAt: '2026-08-14T16:40:00+07:00',
    author: 'thangho',
    notes: 'Added charger bay approach path, renamed endpoints',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000006',
    warehouseId: WAREHOUSE_ID,
    versionNo: 6,
    name: 'MAP-WH01-V006',
    status: 'ARCHIVED',
    createdAt: '2026-08-12T08:14:00+07:00',
    publishedAt: '2026-08-12T11:05:00+07:00',
    modifiedAt: '2026-08-12T11:05:00+07:00',
    author: 'khainq',
    notes: 'One-way lane on the main corridor',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    warehouseId: WAREHOUSE_ID,
    versionNo: 5,
    name: 'MAP-WH01-V005',
    status: 'ARCHIVED',
    createdAt: '2026-08-09T15:30:00+07:00',
    publishedAt: '2026-08-09T15:48:00+07:00',
    modifiedAt: '2026-08-09T15:48:00+07:00',
    author: 'khainq',
    notes: 'First full SLAM map of Warehouse A',
  },
]

// TODO(backend): warehouse name comes from the Warehouse module.
export const WAREHOUSE_NAME = 'Warehouse A'

export const EDITOR_DEFAULTS = {
  autosavedAt: '14:25',
  siteLabel: 'Target Site: Distribution Center #4 - East Hub',
}

const DRAFT_MAP_ID = MAP_VERSIONS[0].id

/** Zones already on the draft map; geometry is in board coordinates (px) for the mock board. */
export const SEED_ZONES: Zone[] = [
  {
    id: 'zone-a',
    mapVersionId: DRAFT_MAP_ID,
    code: 'ZN-01',
    name: 'Zone A',
    zoneType: 'OPERATIONAL_AREA',
    capacity: 4,
    maxSpeed: null,
    isActive: true,
    geometry: {
      points: [
        { x: 48, y: 80 },
        { x: 239, y: 80 },
        { x: 239, y: 222 },
        { x: 48, y: 222 },
      ],
    },
  },
  {
    id: 'zone-b',
    mapVersionId: DRAFT_MAP_ID,
    code: 'ZN-02',
    name: 'Zone B (charge)',
    zoneType: 'OPERATIONAL_AREA',
    capacity: 2,
    maxSpeed: 0.5,
    isActive: true,
    geometry: {
      points: [
        { x: 348, y: 80 },
        { x: 570, y: 80 },
        { x: 570, y: 222 },
        { x: 348, y: 222 },
      ],
    },
  },
  {
    id: 'zone-x',
    mapVersionId: DRAFT_MAP_ID,
    code: 'ZN-03',
    name: 'Exclusion zone',
    zoneType: 'RESTRICTED_AREA',
    capacity: 0,
    maxSpeed: null,
    isActive: true,
    geometry: {
      points: [
        { x: 48, y: 349 },
        { x: 608, y: 349 },
        { x: 608, y: 476 },
        { x: 48, y: 476 },
      ],
    },
  },
]
