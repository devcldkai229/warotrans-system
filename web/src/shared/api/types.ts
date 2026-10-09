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
  inputs: FieldMetadata[]
  outputs: FieldMetadata[]
}

export interface StepTypeMetadata {
  stepType: string
  description: string
  operationFieldName: string
  operations: OperationMetadata[]
}

export interface CatalogField {
  key: string
  dataType: string
  description: string
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

export interface WorkflowTaskDraft {
  taskKey: string
  name: string
  sequenceNo: number
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
