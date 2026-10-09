import type {
  BindingSourceType,
  CurrentMovementPath,
  InputBinding,
  StepType,
  WorkflowVariableSource,
} from '@/shared/api/contracts'

/** Only the Step Types the backend can execute (rules/03). Admin cannot add executable types in the UI. */
export const SUPPORTED_STEP_TYPES: StepType[] = ['CHECK', 'MOVE', 'HUMAN_INTERACTION', 'WAIT']

export const VARIABLE_SOURCES: WorkflowVariableSource[] = ['ADMIN_INPUT', 'STAFF_INPUT', 'SYSTEM_VALUE']

export const BINDING_SOURCES: BindingSourceType[] = ['WORKFLOW_VAR', 'CURRENT_MOVEMENT', 'STEP_OUTPUT', 'CONSTANT']

/** Variable data types offered in the builder. TODO(backend): dataType is a free string today; confirm the set. */
export const VARIABLE_DATA_TYPES = [
  'STRING',
  'INT',
  'DECIMAL',
  'BOOL',
  'STORAGE_LOCATION',
  'ENDPOINT',
  'ENDPOINT_GROUP',
  'CONTAINER',
]

/** What a Step input or output carries. Bindings are only offered between compatible types. */
export type ValueType =
  | 'ENDPOINT'
  | 'ENDPOINT_GROUP'
  | 'CONTAINER'
  | 'STORAGE_LOCATION'
  | 'INT'
  | 'DECIMAL'
  | 'BOOL'
  | 'STRING'
  | 'ANY'

/** An input of type `expected` can take a value of type `actual`. */
export function accepts(expected: ValueType, actual: string): boolean {
  if (expected === 'ANY') return true
  if (expected === actual) return true
  return expected === 'DECIMAL' && actual === 'INT'
}

/** Literal values only make sense for plain data; Endpoints, Containers and locations always come from a source. */
export function allowsConstant(type: ValueType): boolean {
  return type === 'STRING' || type === 'INT' || type === 'DECIMAL' || type === 'BOOL' || type === 'ANY'
}

/** Paths the backend resolves from the active JobContainer / Detail line (rules/03), with what each one yields. */
export const CURRENT_MOVEMENT_PATHS: CurrentMovementPath[] = [
  'containerId',
  'source.endpointId',
  'source.storageLocationId',
  'source.levelNo',
  'destination.endpointId',
  'destination.storageLocationId',
  'destination.levelNo',
]

export const CURRENT_MOVEMENT_TYPES: Record<CurrentMovementPath, ValueType> = {
  containerId: 'CONTAINER',
  'source.endpointId': 'ENDPOINT',
  'source.storageLocationId': 'STORAGE_LOCATION',
  'source.levelNo': 'INT',
  'destination.endpointId': 'ENDPOINT',
  'destination.storageLocationId': 'STORAGE_LOCATION',
  'destination.levelNo': 'INT',
}

export interface InputSpec {
  name: string
  type: ValueType
  /** Created together with the Step and cannot be removed. */
  required?: boolean
  /** Fixed choices: the only valid binding is a CONSTANT picked from this list. */
  options?: string[]
  /** Binding given to the input when it is created. */
  defaultBinding?: InputBinding
  /** Only offered while another input is a CONSTANT with this value (WAIT.durationSeconds needs mode = DURATION). */
  onlyWhen?: { input: string; value: string }
}

export interface OutputSpec {
  name: string
  type: ValueType
}

const CHECK_TYPES = [
  'ROBOT_READY',
  'BATTERY_MIN',
  'ENDPOINT_AVAILABLE',
  'LOAD_STATE',
  'REQUEST_ACTIVE',
  'INVENTORY_AVAILABLE',
]

const INTERACTION_TYPES = [
  'PICKUP_CONFIRM',
  'DROPOFF_CONFIRM',
  'REPORT_ISSUE',
  'PAYLOAD_TRANSFER_CONFIRM',
  'MAINTENANCE_CONFIRM',
  'INSPECTION_CONFIRM',
  'CHARGE_CONNECT_CONFIRM',
  'CHARGE_DISCONNECT_CONFIRM',
]

const constant = (path: string): InputBinding => ({ sourceType: 'CONSTANT', path })
const movement = (path: CurrentMovementPath): InputBinding => ({ sourceType: 'CURRENT_MOVEMENT', path })

/**
 * Inputs an Admin may bind per Step Type, from the "Typical inputs" lists in rules/03.
 * TODO(backend): the executor input schema should be served by the API so this list cannot drift from the executors.
 */
export const INPUT_SPECS: Record<StepType, InputSpec[]> = {
  CHECK: [
    { name: 'checkType', type: 'STRING', required: true, options: CHECK_TYPES, defaultBinding: constant('ROBOT_READY') },
    { name: 'expectedValue', type: 'ANY' },
  ],
  MOVE: [
    { name: 'targetEndpointId', type: 'ENDPOINT', required: true, defaultBinding: movement('destination.endpointId') },
    { name: 'targetEndpointGroupId', type: 'ENDPOINT_GROUP' },
    { name: 'purpose', type: 'STRING', required: true, options: ['PICKUP', 'DROPOFF'], defaultBinding: constant('PICKUP') },
    { name: 'speedProfile', type: 'STRING' },
    { name: 'positionToleranceMeters', type: 'DECIMAL' },
    { name: 'yawToleranceDegrees', type: 'DECIMAL' },
    { name: 'allowReplan', type: 'BOOL' },
    { name: 'timeout', type: 'INT' },
  ],
  HUMAN_INTERACTION: [
    {
      name: 'interactionType',
      type: 'STRING',
      required: true,
      options: INTERACTION_TYPES,
      defaultBinding: constant('PICKUP_CONFIRM'),
    },
    { name: 'containerId', type: 'CONTAINER', defaultBinding: movement('containerId') },
    { name: 'endpointId', type: 'ENDPOINT', defaultBinding: movement('source.endpointId') },
  ],
  WAIT: [
    { name: 'mode', type: 'STRING', required: true, options: ['DURATION', 'EVENT', 'ROBOT_STATE'], defaultBinding: constant('DURATION') },
    { name: 'durationSeconds', type: 'INT', onlyWhen: { input: 'mode', value: 'DURATION' } },
  ],
}

/** "Typical outputs" per Step Type (rules/03): what later Steps can bind through STEP_OUTPUT. */
export const OUTPUT_SPECS: Record<StepType, OutputSpec[]> = {
  CHECK: [
    { name: 'passed', type: 'BOOL' },
    { name: 'observedValue', type: 'ANY' },
  ],
  MOVE: [
    { name: 'reachedEndpointId', type: 'ENDPOINT' },
    { name: 'arrivedAt', type: 'STRING' },
  ],
  HUMAN_INTERACTION: [
    { name: 'confirmationId', type: 'STRING' },
    { name: 'confirmedContainerId', type: 'CONTAINER' },
    { name: 'confirmedBy', type: 'STRING' },
    { name: 'confirmedAt', type: 'STRING' },
    { name: 'result', type: 'STRING' },
    { name: 'details', type: 'STRING' },
  ],
  WAIT: [],
}
