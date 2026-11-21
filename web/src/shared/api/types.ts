export type WorkflowStatus = 'DRAFT' | 'PUBLISHED'

export type BindingSourceType = 'WORKFLOW_VAR' | 'CURRENT_MOVEMENT' | 'STEP_OUTPUT' | 'CONSTANT'

export type WorkflowVariableSource = 'ADMIN_INPUT' | 'STAFF_INPUT' | 'SYSTEM_VALUE'

export type WorkflowDataType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'UUID'
  | 'DATETIME'

export type StepType = 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT'

export type StepFailurePolicy = 'FAIL_JOB' | 'PAUSE_FOR_OPERATOR' | 'REQUEST_REASSIGN'

export interface FieldMetadata {
  key: string
  dataType: string
  required: boolean
  description: string
  allowedValues?: string[] | null
}

export interface OperationMetadata {
  code: string
  description: string
  executionScope?: string | null
  stopActionFilter?: string | null
  inputs: FieldMetadata[]
  outputs: FieldMetadata[]
}

export interface StepTypeMetadata {
  stepType: string
  description: string
  operationFieldName: string
  operations: OperationMetadata[]
}

/**
 * Catalog field from metadata (systemVariables / currentMovementFields).
 * Scope availability for CURRENT_MOVEMENT is not returned as API fields —
 * the editor filters using operation.executionScope + stopActionFilter
 * (mirroring CurrentMovementFieldDefinition.IsAvailableAt).
 */
export interface CatalogField {
  key: string
  dataType: string
  label?: string
  description: string
  requiredCapable?: boolean
}

export interface WorkflowRequestInputField {
  key: string
  dataType: string
  required: boolean
  label: string
  description?: string | null
}

export interface WorkflowRequestInputSchema {
  workflowId: string
  workflowInputs: WorkflowRequestInputField[]
  movementInputs: WorkflowRequestInputField[]
  /** The workflow always picks up here (e.g. INBOUND at its Inbound gate): every movement must start here. */
  fixedPickupEndpointId?: string | null
  /** The workflow always delivers here (e.g. OUTBOUND_RETRIEVAL at its Outbound gate): every movement must end here. */
  fixedDropoffEndpointId?: string | null
}

export interface WorkflowMetadata {
  stepTypes: StepTypeMetadata[]
  bindingSources: string[]
  variableSources: string[]
  dataTypes: string[]
  failurePolicies: string[]
  systemVariables: CatalogField[]
  currentMovementFields: CatalogField[]
}

export interface StepInputBinding {
  sourceType: BindingSourceType
  sourceReference?: string | null
  outputKey?: string | null
  constantValue?: unknown
}

export interface WorkflowVariable {
  key: string
  name: string
  dataType: WorkflowDataType
  source: WorkflowVariableSource
  isRequired: boolean
  defaultValue?: unknown
  configuredValue?: unknown
  description?: string | null
  sequenceNo: number
  /**
   * 'WAYPOINT': a UUID picked from the Endpoints of the published map; 'WAYPOINT_GROUP': a UUID of an EndpointGroup (a
   * MOVE to it goes to a free member). The value stays a UUID either way.
   */
  format?: 'WAYPOINT' | 'WAYPOINT_GROUP' | null
}

export interface WorkflowStepDraft {
  stepKey: string
  name: string
  stepType: StepType
  sequenceNo: number
  operationCode: string
  instructionText?: string | null
  inputBindings: Record<string, StepInputBinding>
  timeoutSeconds: number
  maxAttempts: number
  retryBackoffSeconds: number
  onFailure: StepFailurePolicy
}

export interface TaskRunCondition {
  variableKey: string
  equals: boolean
}

export interface WorkflowTaskDraft {
  taskKey: string
  name: string
  sequenceNo: number
  runCondition?: TaskRunCondition | null
  steps: WorkflowStepDraft[]
}

export interface WorkflowUpsert {
  code: string
  name: string
  description?: string | null
  variables: WorkflowVariable[]
  tasks: WorkflowTaskDraft[]
}

export interface WorkflowListItem {
  id: string
  code: string
  versionNo: number
  name: string
  description?: string | null
  status: WorkflowStatus
  createdAt: string
  publishedAt?: string | null
}

export interface WorkflowDetail extends WorkflowListItem {
  createdBy: string
  variables: WorkflowVariable[]
  tasks: Array<{
    id: string
    taskKey: string
    name: string
    sequenceNo: number
    steps: Array<{
      id: string
      stepKey: string
      name: string
      stepType: StepType
      sequenceNo: number
      operationCode: string
      instructionText?: string | null
      inputBindings: Record<string, StepInputBinding>
      timeoutSeconds: number
      maxAttempts: number
      retryBackoffSeconds: number
      onFailure: StepFailurePolicy
    }>
  }>
}

export interface ProblemError {
  path?: string
  message?: string
}
