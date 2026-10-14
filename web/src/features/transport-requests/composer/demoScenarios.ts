/**
 * Manual QA presets for composer scenarios A–E (UI-only).
 */
import { findEndpointByName } from '@/shared/map/scene'
import {
  COMPOSER_CONTAINERS,
  COMPOSER_MAPS,
  COMPOSER_STORAGE_LOCATIONS,
  COMPOSER_WAREHOUSES,
  COMPOSER_WORKFLOWS,
} from './fixtures'
import type { MovementDraft, TransportRequestDraft } from './types'

function loc(code: string) {
  return COMPOSER_STORAGE_LOCATIONS.find((item) => item.code === code)!
}

function ep(name: string) {
  return findEndpointByName(name)!
}

function container(barcode: string) {
  return COMPOSER_CONTAINERS.find((item) => item.barcode === barcode)!
}

function movement(
  sequenceNo: number,
  barcode: string,
  source: { locationCode?: string; endpointName: string; level?: number },
  dest: { locationCode?: string; endpointName: string; level?: number },
): MovementDraft {
  const ctn = container(barcode)
  const sourceLoc = source.locationCode ? loc(source.locationCode) : null
  const destLoc = dest.locationCode ? loc(dest.locationCode) : null
  return {
    localId: `demo-${sequenceNo}`,
    sequenceNo,
    containerId: ctn.id,
    sourceStorageLocationId: sourceLoc?.id ?? null,
    sourceEndpointId: sourceLoc?.endpointId ?? ep(source.endpointName).id,
    sourceLevelNo: source.level ?? null,
    destinationStorageLocationId: destLoc?.id ?? null,
    destinationEndpointId: destLoc?.endpointId ?? ep(dest.endpointName).id,
    destinationLevelNo: dest.level ?? null,
    sourceAutoFilled: Boolean(ctn.currentEndpointId),
  }
}

function base(workflowCode: string): TransportRequestDraft {
  const warehouse = COMPOSER_WAREHOUSES[0]
  const map = COMPOSER_MAPS.find((item) => item.status === 'PUBLISHED')!
  const workflow = COMPOSER_WORKFLOWS.find((item) => item.code === workflowCode)!
  const workflowInputs: Record<string, string> = {}
  for (const variable of workflow.variablesSchema) {
    if (variable.defaultValue != null) workflowInputs[variable.key] = variable.defaultValue
  }
  return {
    warehouseId: warehouse.id,
    mapVersionId: map.id,
    workflowId: workflow.id,
    workflowInputs,
    note: null,
    movements: [],
  }
}

/** A — Inbound distribution: one source → many destinations */
export function scenarioAInboundDistribution(): TransportRequestDraft {
  const draft = base('INBOUND_PUTAWAY')
  draft.note = 'Demo A: inbound distribution'
  draft.movements = [
    movement(1, 'CNT-001', { endpointName: 'Inbound 1' }, { locationCode: 'SHELF-D', endpointName: 'Rack A-09', level: 1 }),
    movement(2, 'CNT-002', { endpointName: 'Inbound 1' }, { locationCode: 'SHELF-E', endpointName: 'Rack A-12', level: 1 }),
    movement(3, 'CNT-003', { endpointName: 'Inbound 1' }, { locationCode: 'SHELF-F', endpointName: 'Rack B-08', level: 1 }),
  ]
  return draft
}

/** B — Outbound collection: many sources → one destination */
export function scenarioBOutboundCollection(): TransportRequestDraft {
  const draft = base('OUTBOUND_RETRIEVAL')
  draft.note = 'Demo B: outbound collection'
  draft.movements = [
    movement(1, 'CNT-010', { locationCode: 'SHELF-A1', endpointName: 'Rack A-01', level: 1 }, { endpointName: 'Outbound 1' }),
    movement(2, 'CNT-011', { locationCode: 'SHELF-A2', endpointName: 'Rack A-02', level: 1 }, { endpointName: 'Outbound 1' }),
    movement(3, 'CNT-012', { locationCode: 'SHELF-B1', endpointName: 'Rack B-03', level: 1 }, { endpointName: 'Outbound 1' }),
  ]
  return draft
}

/** C — Multi relocation: many → many */
export function scenarioCMultiRelocation(): TransportRequestDraft {
  const draft = base('INTERNAL_RELOCATION')
  draft.note = 'Demo C: multi relocation'
  draft.movements = [
    movement(1, 'CNT-010', { locationCode: 'SHELF-A1', endpointName: 'Rack A-01', level: 1 }, { locationCode: 'SHELF-D', endpointName: 'Rack A-09', level: 2 }),
    movement(2, 'CNT-011', { locationCode: 'SHELF-A2', endpointName: 'Rack A-02', level: 1 }, { locationCode: 'SHELF-E', endpointName: 'Rack A-12', level: 1 }),
    movement(3, 'CNT-012', { locationCode: 'SHELF-B1', endpointName: 'Rack B-03', level: 1 }, { locationCode: 'SHELF-F', endpointName: 'Rack B-08', level: 1 }),
  ]
  return draft
}

/** D — Bulk same lane: same source + same destination */
export function scenarioDBulkSameLane(): TransportRequestDraft {
  const draft = base('INTERNAL_RELOCATION')
  draft.note = 'Demo D: same source and destination'
  draft.movements = [
    movement(1, 'CNT-010', { locationCode: 'SHELF-A1', endpointName: 'Rack A-01', level: 1 }, { locationCode: 'SHELF-D', endpointName: 'Rack A-09', level: 1 }),
    movement(2, 'CNT-020', { locationCode: 'SHELF-A1', endpointName: 'Rack A-01', level: 1 }, { locationCode: 'SHELF-D', endpointName: 'Rack A-09', level: 1 }),
    movement(3, 'CNT-004', { locationCode: 'SHELF-A1', endpointName: 'Rack A-01', level: 2 }, { locationCode: 'SHELF-D', endpointName: 'Rack A-09', level: 1 }),
  ]
  return draft
}

/** E — Single point-to-point */
export function scenarioESingleMovement(): TransportRequestDraft {
  const draft = base('POINT_TO_POINT_TRANSPORT')
  draft.note = 'Demo E: single movement'
  draft.movements = [
    movement(1, 'CNT-030', { locationCode: 'SHELF-A2', endpointName: 'Rack A-02', level: 3 }, { endpointName: 'Quality-01', level: 1 }),
  ]
  return draft
}

export const DEMO_SCENARIOS = [
  { id: 'A', label: 'Inbound distribution', load: scenarioAInboundDistribution },
  { id: 'B', label: 'Outbound collection', load: scenarioBOutboundCollection },
  { id: 'C', label: 'Multi relocation', load: scenarioCMultiRelocation },
  { id: 'D', label: 'Bulk same lane', load: scenarioDBulkSameLane },
  { id: 'E', label: 'Single movement', load: scenarioESingleMovement },
] as const
