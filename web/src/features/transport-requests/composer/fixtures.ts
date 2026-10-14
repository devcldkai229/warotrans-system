/**
 * Fixture catalog for the Transport Request Composer (UI-only).
 * TODO(backend): replace via useTransportRequestComposerData adapter with API reads.
 */
import type { Endpoint, MapVersion, WorkflowVariable } from '@/shared/api/contracts'
import { MAP_VERSIONS } from '@/features/maps/mock'
import { CONTAINERS, STORAGE_LOCATIONS, WAREHOUSES } from '@/features/management/mock'
import { SCENE_ENDPOINTS, findEndpointByName } from '@/shared/map/scene'
import type {
  ComposerContainer,
  ComposerStorageLocation,
  ComposerWarehouse,
  ComposerWorkflow,
} from './types'

const WH = WAREHOUSES[0]

export const COMPOSER_WAREHOUSES: ComposerWarehouse[] = [
  { id: WH.id, code: 'WH-001', name: 'Main Warehouse' },
]

export const COMPOSER_MAPS: MapVersion[] = MAP_VERSIONS.map((map) =>
  map.status === 'PUBLISHED'
    ? { ...map, name: 'MAP-WH001-V003', versionNo: 3 }
    : map,
)

export const COMPOSER_ENDPOINTS: Endpoint[] = SCENE_ENDPOINTS

function adminVar(
  key: string,
  label: string,
  dataType: string,
  required: boolean,
  defaultValue?: string,
  description?: string,
): WorkflowVariable {
  return { key, label, dataType, source: 'ADMIN_INPUT', required, defaultValue, value: defaultValue, description }
}

function workflow(
  id: string,
  code: string,
  name: string,
  description: string,
  cardSummary: string,
  variablesSchema: WorkflowVariable[],
): ComposerWorkflow {
  return {
    id,
    code,
    versionNo: 1,
    name,
    description,
    cardSummary,
    status: 'PUBLISHED',
    variablesSchema,
    tasks: [],
  }
}

export const COMPOSER_WORKFLOWS: ComposerWorkflow[] = [
  workflow(
    'wf-inbound-putaway',
    'INBOUND_PUTAWAY',
    'Inbound putaway',
    'Receive containers at inbound area and distribute to storage',
    'Receive a batch and distribute it to storage locations.',
    [
      adminVar('handlingInstruction', 'Handling instruction', 'STRING', false, '', 'Optional handling notes for Staff'),
      adminVar('qualityInspectionRequired', 'Quality inspection required', 'BOOL', true, 'No'),
    ],
  ),
  workflow(
    'wf-internal-relocation',
    'INTERNAL_RELOCATION',
    'Internal relocation',
    'Move containers between storage locations',
    'Move one or more containers between locations.',
    [adminVar('operationMode', 'Operation mode', 'STRING', true, 'NORMAL')],
  ),
  workflow(
    'wf-outbound-retrieval',
    'OUTBOUND_RETRIEVAL',
    'Outbound retrieval',
    'Collect storage containers and bring them to outbound',
    'Collect containers from storage and move them to outbound.',
    [adminVar('priorityLane', 'Priority lane', 'STRING', false, '')],
  ),
  workflow(
    'wf-point-to-point',
    'POINT_TO_POINT_TRANSPORT',
    'Point-to-point',
    'Move payload from one location to another',
    'Move containers between arbitrary points.',
    [],
  ),
  workflow(
    'wf-replenishment',
    'REPLENISHMENT',
    'Replenishment',
    'Move stock from reserve storage to forward pick faces',
    'Replenish forward locations from reserve stock.',
    [adminVar('waveCode', 'Wave code', 'STRING', false, '')],
  ),
]

const EXTRA_LOCATIONS: ComposerStorageLocation[] = [
  {
    id: 'loc-shelf-d',
    warehouseId: WH.id,
    code: 'SHELF-D',
    name: 'Shelf D',
    endpointId: findEndpointByName('Rack A-09')!.id,
    endpointCode: findEndpointByName('Rack A-09')!.code,
    endpointName: 'Rack A-09',
    isActive: true,
    levelOptions: [1, 2],
  },
  {
    id: 'loc-shelf-e',
    warehouseId: WH.id,
    code: 'SHELF-E',
    name: 'Shelf E',
    endpointId: findEndpointByName('Rack A-12')!.id,
    endpointCode: findEndpointByName('Rack A-12')!.code,
    endpointName: 'Rack A-12',
    isActive: true,
    levelOptions: [1, 2],
  },
  {
    id: 'loc-shelf-f',
    warehouseId: WH.id,
    code: 'SHELF-F',
    name: 'Shelf F',
    endpointId: findEndpointByName('Rack B-08')!.id,
    endpointCode: findEndpointByName('Rack B-08')!.code,
    endpointName: 'Rack B-08',
    isActive: true,
    levelOptions: [1, 2],
  },
]

export const COMPOSER_STORAGE_LOCATIONS: ComposerStorageLocation[] = [
  ...STORAGE_LOCATIONS.filter((loc) => loc.isActive).map((loc) => ({
    id: loc.id,
    warehouseId: loc.warehouseId,
    code: loc.code,
    name: loc.name,
    endpointId: loc.endpointId,
    endpointCode: loc.endpointCode,
    endpointName: loc.endpointName,
    isActive: loc.isActive,
    levelOptions: [1, 2, 3],
  })),
  ...EXTRA_LOCATIONS,
]

function enrichContainer(
  barcode: string,
  productName: string,
  sku: string,
  status: ComposerContainer['status'],
  locationCode: string | null,
  levelNo: number | null,
  directEndpointName: string | null = null,
): ComposerContainer {
  const location = locationCode
    ? COMPOSER_STORAGE_LOCATIONS.find((loc) => loc.code === locationCode) ?? null
    : null
  const endpoint = location
    ? COMPOSER_ENDPOINTS.find((ep) => ep.id === location.endpointId) ?? null
    : directEndpointName
      ? findEndpointByName(directEndpointName) ?? null
      : null
  return {
    id: `composer-${barcode}`,
    barcode,
    productName,
    sku,
    status,
    currentStorageLocationId: location?.id ?? null,
    currentLocationCode: location?.code ?? null,
    currentLocationName: location?.name ?? null,
    currentLevelNo: levelNo,
    currentEndpointId: endpoint?.id ?? null,
    currentEndpointCode: endpoint?.code ?? null,
    currentEndpointName: endpoint?.name ?? null,
  }
}

/** Demo + selectable inventory for the composer (codes, not UUIDs, shown in UI). */
export const COMPOSER_CONTAINERS: ComposerContainer[] = [
  enrichContainer('CNT-001', 'Product A', 'SKU-8821', 'PACKED', null, null, 'Inbound 1'),
  enrichContainer('CNT-002', 'Product B', 'SKU-4410', 'PACKED', null, null, 'Inbound 1'),
  enrichContainer('CNT-003', 'Product C', 'SKU-2290', 'PACKED', null, null, 'Inbound 1'),
  enrichContainer('CNT-004', 'Blue Ink 5L', 'SKU-9012', 'STORED', 'SHELF-A1', 2),
  enrichContainer('CNT-010', 'Carton Box - Standard', 'SKU-8821', 'STORED', 'SHELF-A1', 1),
  enrichContainer('CNT-011', 'Optical Sensor Unit', 'SKU-4410', 'STORED', 'SHELF-A2', 1),
  enrichContainer('CNT-012', 'Pallet Wrap Roll', 'SKU-2290', 'STORED', 'SHELF-B1', 1),
  enrichContainer('CNT-013', 'Steel Bracket Set', 'SKU-3301', 'STORED', 'SHELF-B2', 2),
  enrichContainer('CNT-014', 'Foam Insert Pack', 'SKU-9012', 'STORED', 'SHELF-C1', 1),
  enrichContainer('CNT-020', 'Carton Box - Standard', 'SKU-8821', 'STORED', 'SHELF-A1', 1),
  enrichContainer('CNT-021', 'Optical Sensor Unit', 'SKU-4410', 'STORED', 'SHELF-QA', 1),
  enrichContainer('CNT-030', 'Circuit Board Tray', 'SKU-7765', 'STORED', 'SHELF-A2', 3),
  // Existing management barcodes (STORED) for realistic search.
  ...CONTAINERS.filter((c) => c.status === 'STORED' && c.locationCode)
    .slice(0, 8)
    .map((c) =>
      enrichContainer(c.barcode, c.productName, c.sku, c.status, c.locationCode, c.currentLevelNo),
    ),
]

export const COMPOSER_REQUESTED_BY = 'WaroTrans Admin'

/** Direct-pick endpoint types (no StorageLocation required). */
export const DIRECT_ENDPOINT_TYPES = new Set([
  'INBOUND',
  'OUTBOUND',
  'PARKING',
  'TRANSIT',
  'INSPECTION',
])
