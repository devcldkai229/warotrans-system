import type {
  BindingSourceType,
  CurrentMovementPath,
  StepFailurePolicy,
  StepType,
  WorkflowVariableSource,
} from '@/shared/api/contracts'

/** Only the Step Types the backend can execute (rules/03). Admin cannot add executable types in the UI. */
export const SUPPORTED_STEP_TYPES: StepType[] = ['CHECK', 'MOVE', 'HUMAN_INTERACTION', 'WAIT']

export const VARIABLE_SOURCES: WorkflowVariableSource[] = ['ADMIN_INPUT', 'STAFF_INPUT', 'SYSTEM_VALUE']

export const BINDING_SOURCES: BindingSourceType[] = ['WORKFLOW_VAR', 'CURRENT_MOVEMENT', 'STEP_OUTPUT', 'CONSTANT']

export const FAILURE_POLICIES: StepFailurePolicy[] = ['FAIL_JOB', 'PAUSE_FOR_OPERATOR', 'REQUEST_REASSIGN']

/** Paths the backend resolves from the current TransportData movement (rules/03). */
export const CURRENT_MOVEMENT_PATHS: CurrentMovementPath[] = [
  'containerId',
  'source.endpointId',
  'source.storageLocationId',
  'source.levelNo',
  'destination.endpointId',
  'destination.storageLocationId',
  'destination.levelNo',
]

/**
 * Input names an Admin may bind per Step Type. TODO(backend): the executor input schema should be served by the
 * API so this list cannot drift from the real executors.
 */
export const STEP_INPUT_NAMES: Record<StepType, string[]> = {
  CHECK: ['checkType', 'expectedValue'],
  MOVE: [
    'targetEndpointId',
    'targetEndpointGroupId',
    'purpose',
    'speedProfile',
    'positionToleranceMeters',
    'yawToleranceDegrees',
    'allowReplan',
    'timeout',
  ],
  HUMAN_INTERACTION: ['containerId', 'endpointId'],
  WAIT: ['mode', 'durationSeconds'],
}

/** Variable data types offered in the builder. TODO(backend): dataType is a free string today; confirm the set. */
export const VARIABLE_DATA_TYPES = ['STRING', 'INT', 'BOOL', 'STORAGE_LOCATION', 'ENDPOINT', 'CONTAINER']
