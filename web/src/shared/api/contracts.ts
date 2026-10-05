// API contract types.
//
// Field names and enum values mirror the backend entities (rules/02, 03, 05). Timestamps are ISO-8601 strings
// (DateTimeOffset on the backend) and are formatted in the UI, never stored as display text.
//
// Anything marked `TODO(backend)` is shown by the Figma design but has NO source in the backend yet. Those
// fields are optional so the UI keeps working when the real API does not return them.

export type AccountRole = 'ADMIN' | 'STAFF'

export type RobotStatus =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'EXECUTING'
  | 'PAUSED'
  | 'CHARGING'
  | 'MAINTENANCE'
  | 'ERROR'

export type JobStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'PAUSED'
  | 'REASSIGNING'
  | 'RECOVERY_REQUIRED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type JobTaskStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED'

export type JobStepStatus =
  | 'PENDING'
  | 'READY'
  | 'EXECUTING'
  | 'WAITING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type JobAssignmentStatus = 'PENDING_ACK' | 'ACKNOWLEDGED' | 'ACTIVE' | 'ENDED'

export type DispatchDecisionType = 'SELECTED' | 'NONE'

export type StepType = 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT'

export type StepFailurePolicy = 'FAIL_JOB' | 'PAUSE_FOR_OPERATOR' | 'REQUEST_REASSIGN'

export type WorkflowVariableSource = 'ADMIN_INPUT' | 'STAFF_INPUT' | 'SYSTEM_VALUE'

export type BindingSourceType = 'WORKFLOW_VAR' | 'CURRENT_MOVEMENT' | 'STEP_OUTPUT' | 'CONSTANT'

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED'

export type MapStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type ZoneType = 'INTERSECTION' | 'NARROW_AREA' | 'OPERATIONAL_AREA' | 'RESTRICTED_AREA'

export type EndpointType =
  | 'INBOUND'
  | 'STORAGE'
  | 'OUTBOUND'
  | 'PARKING'
  | 'CHARGING'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'RECOVERY'
  | 'TRANSIT'

export type EdgeDirection = 'ONE_WAY' | 'BIDIRECTIONAL'

/** CURRENT_MOVEMENT binding paths supported by the backend (rules/03). */
export type CurrentMovementPath =
  | 'containerId'
  | 'source.endpointId'
  | 'source.storageLocationId'
  | 'source.levelNo'
  | 'destination.endpointId'
  | 'destination.storageLocationId'
  | 'destination.levelNo'

export interface Point {
  x: number
  y: number
}

/* ------------------------------------------------------------------ Identity */

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED'

export interface Account {
  id: string
  username: string
  email: string
  fullName: string
  role: AccountRole
  status: AccountStatus
  lastLoginAt: string | null
}

/** Warehouse a user signs in to. TODO(backend): login/cluster selection endpoint is not implemented yet. */
export interface Facility {
  code: string
  name: string
  city: string
}

/* --------------------------------------------------------------------- Fleet */

export interface Robot {
  id: string
  warehouseId: string
  currentMapVersionId: string
  code: string
  name: string
  status: RobotStatus
  batteryPercent: number
  /** Map coordinates in metres (same frame as Endpoint.x / Endpoint.y). */
  poseX: number
  poseY: number
  poseYaw: number
  lastHeartbeatAt: string | null
  isEnabled: boolean
}

/** The Job a Robot is working on, joined from JobAssignment. TODO(backend): needs a fleet read endpoint. */
export interface RobotActivity {
  jobNo: string
  jobStatus: JobStatus
  requestCode: string
  progressPercent: number
  routeLabel?: string
}

/** Live telemetry shown on Robot Detail. TODO(backend): none of this is persisted in the Robot entity. */
export interface RobotTelemetry {
  model?: string
  firmware?: string
  payloadLabel?: string | null
  connectionLabel?: string
  eStopReleased?: boolean
  zone?: { name: string; heldSeconds: number; heldByRobotCode?: string; queueAfter?: number }
  navigationState?: string
  error?: { title: string; message: string }
}

export interface RobotView extends Robot {
  activity: RobotActivity | null
  telemetry?: RobotTelemetry
}

export interface DispatchCandidate {
  robotCode: string
  batteryPercent: number
  status: RobotStatus
  selected: boolean
}

/** DispatchDecision.candidateEvaluations. TODO(backend): JSON shape is not finalized; this is the minimum the UI needs. */
export interface DispatchDecision {
  id: string
  jobId: string
  robotId: string | null
  type: DispatchDecisionType
  createdAt: string
  candidates: DispatchCandidate[]
}

/* ------------------------------------------------------- Workflow definitions */

export interface WorkflowVariable {
  key: string
  label: string
  dataType: string
  source: WorkflowVariableSource
  required: boolean
  defaultValue?: string
  value?: string
  description?: string
}

/** One entry of WorkflowStep.inputBindings (keyed by the Step input name). */
export interface InputBinding {
  sourceType: BindingSourceType
  /** WORKFLOW_VAR: variable key. CURRENT_MOVEMENT: a CurrentMovementPath. STEP_OUTPUT: `<stepKey>.<outputName>`. CONSTANT: literal. */
  path: string
}

export interface WorkflowStep {
  id: string
  stepKey: string
  name: string
  stepType: StepType
  sequenceNo: number
  inputBindings: Record<string, InputBinding>
  timeoutSeconds: number
  maxAttempts: number
  retryBackoffSeconds: number
  onFailure: StepFailurePolicy
  /** Output names the step executor produces. TODO(backend): not part of the WorkflowStep entity. */
  outputs?: string[]
}

export interface WorkflowTask {
  id: string
  taskKey: string
  name: string
  sequenceNo: number
  steps: WorkflowStep[]
}

export interface Workflow {
  id: string
  code: string
  versionNo: number
  name: string
  description?: string
  status: WorkflowStatus
  variablesSchema: WorkflowVariable[]
  tasks: WorkflowTask[]
}

/* ------------------------------------------------------------ Job (runtime) */

export interface JobStep {
  id: string
  jobTaskId: string
  workflowStepId: string
  sequenceNo: number
  stepType: StepType
  status: JobStepStatus
  resolvedInputs: Record<string, unknown>
  outputValues: Record<string, unknown>
  targetEndpointId: string | null
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  /** Joined from the WorkflowStep definition. */
  stepKey: string
  name: string
  inputBindings?: Record<string, InputBinding>
  /** Set while status is WAITING. TODO(backend): max wait comes from the step timeout. */
  waitingSince?: string
  maxWaitSeconds?: number
}

export interface JobTask {
  id: string
  jobId: string
  workflowTaskId: string
  sequenceNo: number
  status: JobTaskStatus
  startedAt: string | null
  completedAt: string | null
  failureCode: string | null
  /** Joined from the WorkflowTask definition. */
  taskKey: string
  name: string
  steps: JobStep[]
}

export interface Job {
  id: string
  jobNo: string
  transportRequestId: string
  workflowId: string
  mapVersionId: string
  status: JobStatus
  createdAt: string
  queuedAt: string | null
  startedAt: string | null
  completedAt: string | null
  failureCode: string | null
  failureMessage: string | null
  tasks: JobTask[]
}

/**
 * Commands the current user may issue on a Job right now. The backend owns state transitions and permissions
 * (rules/09), so the UI renders buttons from this list instead of guessing from `status`.
 * TODO(backend): proposed field, not implemented.
 */
export type JobAction = 'PAUSE' | 'CANCEL' | 'REMOTE_CONFIRM' | 'SKIP_ENDPOINT'

/** Job plus data the list/detail screens need from other modules (Fleet, Warehouse, Transportation). */
export interface JobView extends Job {
  /** Active JobAssignment's Robot. */
  assignedRobot: { code: string; batteryPercent: number; status: RobotStatus } | null
  /** Container of the current movement. Job has no ContainerId; this is a snapshot from TransportData. */
  container: { barcode: string; productLabel: string } | null
  routeLabel?: string
  originLabel?: string
  destinationLabel?: string
  availableActions: JobAction[]
}

/* --------------------------------------------------------------- Navigation */

export interface MapVersion {
  id: string
  warehouseId: string
  versionNo: number
  name: string
  status: MapStatus
  createdAt: string
  publishedAt: string | null
  /** TODO(backend): the Facility catalog in the design shows these, but MapVersion has no such columns. */
  modifiedAt?: string
  author?: string
  notes?: string
}

export interface ZoneGeometry {
  points: Point[]
}

export interface Zone {
  id: string
  mapVersionId: string
  code: string
  name: string
  zoneType: ZoneType
  geometry: ZoneGeometry
  capacity: number
  maxSpeed: number | null
  isActive: boolean
}

export interface Endpoint {
  id: string
  mapVersionId: string
  code: string
  name: string
  endpointType: EndpointType
  x: number
  y: number
  yaw: number
  positionTolerance: number
  yawTolerance: number
  isEnabled: boolean
}

/* ---------------------------------------------------------------- Dashboard */

/** TODO(backend): no reporting endpoint exists yet; shape is a proposal for the Task summary screen. */
export interface TaskSummaryRow {
  taskType: string
  completed: number
  cancelled: number
  failed: number
  timeouts: number
}

export interface TaskSummary {
  completed: number
  completedDeltaPercent: number
  cancelled: number
  failed: number
  reassigned: number
  belowTargetTime: number
  aboveTargetTime: number
  timeouts: number
  rows: TaskSummaryRow[]
}

/* ---------------------------------------------------------------- Warehouse */

export interface ProductCategory {
  id: string
  code: string
  name: string
  description?: string
}

export interface Product {
  id: string
  categoryId: string
  sku: string
  supplierBarcode?: string
  name: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** ContainerCount is the number of Containers (V1), not product units. */
export interface InventoryStock {
  id: string
  productId: string
  storageLocationId: string
  levelNo: number
  containerCount: number
  updatedAt: string
}

/** InventoryStock joined with Product and StorageLocation. TODO(backend): needs a read endpoint with these joins. */
export interface InventoryStockView extends InventoryStock {
  sku: string
  productName: string
  locationCode: string
}

/** A simple logical location such as "Shelf A" (rules/00); it points at one Navigation Endpoint. */
export interface StorageLocation {
  id: string
  warehouseId: string
  endpointId: string
  code: string
  name: string
  isActive: boolean
  createdAt: string
}

/** StorageLocation joined with Warehouse and Endpoint codes. TODO(backend): join in the read endpoint. */
export interface StorageLocationView extends StorageLocation {
  warehouseName: string
  endpointCode: string
}
