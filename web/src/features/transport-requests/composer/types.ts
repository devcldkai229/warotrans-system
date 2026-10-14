import type { ContainerStatus, Endpoint, MapVersion } from '@/shared/api/contracts'
import type { WorkflowRequestInputField } from '@/shared/api/types'

/** UI draft for a new TransportRequest — movement intent only (no Job/Planner fields). */
export interface TransportRequestDraft {
  warehouseId: string
  mapVersionId: string
  workflowId: string
  workflowInputs: Record<string, string>
  note: string | null
  movements: MovementDraft[]
}

/** One Container move: Container + Source → Destination (generic for all workflows). */
export interface MovementDraft {
  localId: string
  sequenceNo: number
  containerId: string
  sourceStorageLocationId: string | null
  sourceEndpointId: string
  sourceLevelNo: number | null
  destinationStorageLocationId: string | null
  destinationEndpointId: string
  destinationLevelNo: number | null
  /** True when source was prefilled from container inventory context. */
  sourceAutoFilled?: boolean
}

export interface ComposerWarehouse {
  id: string
  code: string
  name: string
}

export interface ComposerStorageLocation {
  id: string
  warehouseId: string
  code: string
  name: string
  endpointId: string
  endpointCode: string
  endpointName: string
  isActive: boolean
  levelOptions: number[]
}

/** Container row enriched for the selector (no UUID shown in UI). */
export interface ComposerContainer {
  id: string
  barcode: string
  productName: string
  sku: string
  status: ContainerStatus
  currentStorageLocationId: string | null
  currentLocationCode: string | null
  currentLocationName: string | null
  currentLevelNo: number | null
  currentEndpointId: string | null
  currentEndpointCode: string | null
  currentEndpointName: string | null
}

export interface ComposerWorkflow {
  id: string
  code: string
  name: string
  versionNo: number
  cardSummary: string
  status: 'PUBLISHED' | string
}

export type Panel2Mode = 'build' | 'selectContainers' | 'review'
export type MovementViewMode = 'list' | 'grouped'
export type MapPickTarget = 'source' | 'destination' | null

export interface DraftValidation {
  ok: boolean
  errors: string[]
  movementErrors: Record<string, string[]>
}

export interface ComposerData {
  warehouses: ComposerWarehouse[]
  maps: MapVersion[]
  workflows: ComposerWorkflow[]
  staffInputFields: WorkflowRequestInputField[]
  containers: ComposerContainer[]
  storageLocations: ComposerStorageLocation[]
  endpoints: Endpoint[]
  requestedByName: string
  isLoading: boolean
  error: string | null
  containerSearch: string
  setContainerSearch: (value: string) => void
}

/** Keys that belong to Movement Details — never rendered as Workflow Parameters. */
export const MOVEMENT_PARAM_KEYS = new Set([
  'containerId',
  'sourceEndpointId',
  'destinationEndpointId',
  'sourceLocation',
  'destinationLocation',
  'sourceStorageLocationId',
  'destinationStorageLocationId',
  'sourceLevelNo',
  'destinationLevelNo',
])

export function emptyDraft(): TransportRequestDraft {
  return {
    warehouseId: '',
    mapVersionId: '',
    workflowId: '',
    workflowInputs: {},
    note: null,
    movements: [],
  }
}

export function draftIsDirty(draft: TransportRequestDraft): boolean {
  return Boolean(
    draft.warehouseId ||
      draft.mapVersionId ||
      draft.workflowId ||
      draft.note ||
      draft.movements.length > 0 ||
      Object.keys(draft.workflowInputs).length > 0,
  )
}
