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

export type JobContainerStatus = 'PENDING' | 'ASSIGNED' | 'ONBOARD' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

export type TransportRequestStatus =
  | 'SUBMITTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED'

export type TransportRequestDetailStatus = 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type HandoverType =
  | 'PICKUP'
  | 'DROPOFF'
  | 'PAYLOAD_TRANSFER'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'CHARGE_CONNECT'
  | 'CHARGE_DISCONNECT'

export type JobAssignmentStatus = 'PENDING_ACK' | 'ACKNOWLEDGED' | 'ACTIVE' | 'ENDED'

export type AssignmentEndReason =
  | 'COMPLETED'
  | 'REASSIGNED'
  | 'ROBOT_REJECTED'
  | 'ACK_TIMEOUT'
  | 'ROBOT_OFFLINE'
  | 'CANCELLED'
  | 'FAILED'

export type RobotStateEventSource = 'SYSTEM' | 'HEARTBEAT' | 'DISPATCHER' | 'OPERATOR' | 'ROBOT'

export type DispatchDecisionType = 'SELECTED' | 'NONE'

export type StepType = 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT'

export type StepFailurePolicy = 'FAIL_JOB' | 'PAUSE_FOR_OPERATOR' | 'REQUEST_REASSIGN'

export type WorkflowVariableSource = 'ADMIN_INPUT' | 'STAFF_INPUT' | 'SYSTEM_VALUE'

export type BindingSourceType = 'WORKFLOW_VAR' | 'CURRENT_MOVEMENT' | 'STEP_OUTPUT' | 'CONSTANT'

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED'

export type MapStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type ZoneType = 'KEEP_OUT' | 'SPEED' | 'NO_STOP' | 'SINGLE_OCCUPANCY'

export type EndpointType = 'WAYPOINT' | 'CHARGER' | 'PARK'

export type EdgeDirection = 'ONE_WAY' | 'BIDIRECTIONAL'

/** CURRENT_MOVEMENT binding paths supported by the backend (rules/03). */
export type CurrentMovementPath =
  | 'containerId'
  | 'transportRequestDetailId'
  | 'jobContainerId'
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

/** Response of POST /api/identity/login and /refresh. The web client asks for the refresh token as an HttpOnly cookie, so `refreshToken` is null here. */
export interface Session {
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string | null
  account: Account
}

/** Response of GET /api/identity/accounts (Admin only). */
export interface ListAccountsResponse {
  items: Account[]
}

/** Body of POST /api/identity/accounts. The username is lower case and cannot be changed later. */
export interface CreateAccountBody {
  username: string
  email: string
  fullName: string
  role: AccountRole
}

/** Response of POST /api/identity/accounts. The temporary password is returned this once and cannot be read again. */
export interface CreateAccountResponse {
  account: Account
  temporaryPassword: string
}

/** Body of PUT /api/identity/accounts/{id}. */
export type UpdateAccountBody = Pick<Account, 'email' | 'fullName' | 'role'>

/* --------------------------------------------------------------------- Fleet */

export type NavigationStatus = 'IDLE' | 'NAVIGATING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
export type LocalizationStatus = 'LOCALIZED' | 'LOST' | 'UNKNOWN'

/** Mirrors Fleet `RobotResponse` from GET /api/fleet/robots. */
export interface Robot {
  id: string
  warehouseId: string
  currentMapVersionId: string
  code: string
  name: string
  status: RobotStatus
  isOnline: boolean
  batteryPercent: number
  /** Map coordinates in metres (same frame as Endpoint.x / Endpoint.y). */
  poseX: number
  poseY: number
  poseYaw: number
  lastHeartbeatAt: string | null
  lastTelemetryAt?: string | null
  navigationStatus?: NavigationStatus | null
  localizationStatus?: LocalizationStatus | null
  linearVelocity?: number | null
  angularVelocity?: number | null
  errorCode?: string | null
  mapVersionCode?: string | null
  currentCommandId?: string | null
  isEnabled: boolean
  createdAt?: string
  updatedAt?: string
}

/** The Job a Robot is working on, joined from JobAssignment. TODO(backend): needs a fleet read endpoint. */
export interface RobotActivity {
  jobNo: string
  jobStatus: JobStatus
  requestCode: string
  progressPercent: number
  routeLabel?: string
  /** JobContainer joined with Container: what the Job moves (Container-level, never product units). TODO(backend). */
  containers?: { barcode: string; status: JobContainerStatus }[]
}

/** Live telemetry shown on Robot Detail. TODO(backend): none of this is persisted in the Robot entity. */
export interface RobotTelemetry {
  model?: string
  firmware?: string
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

/** fleet.robot_state_events. TODO(backend): no read endpoint yet. */
export interface RobotStateEvent {
  id: string
  robotId: string
  jobId: string | null
  fromStatus: RobotStatus | null
  toStatus: RobotStatus
  reason: string | null
  source: RobotStateEventSource
  occurredAt: string
}

/** A Robot's JobAssignment joined with its Job. TODO(backend): no read endpoint yet. */
export interface RobotJobHistoryItem {
  id: string
  robotId: string
  jobNo: string
  requestCode: string
  jobStatus: JobStatus
  assignmentStatus: JobAssignmentStatus
  assignedAt: string
  endedAt: string | null
  endReason: AssignmentEndReason | null
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
  /** execution.handover_confirmations (one per HUMAN_INTERACTION step). TODO(backend): confirmedByName is joined from Identity. */
  handover?: { handoverType: HandoverType; confirmedByName: string; confirmedAt: string; note: string | null }
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
export type JobAction = 'PAUSE' | 'CANCEL' | 'REMOTE_CONFIRM'

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

/** GeoJSON LineString in world meters (MapVersion.FrameId). Pixel coords are never persisted. */
export interface GeoJsonLineString {
  type: 'LineString'
  coordinates: [number, number][]
}

/** GeoJSON Polygon in world meters (MapVersion.FrameId). Outer ring must be closed. */
export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
}

/** navigation.edges: an ordered polyline Robots may travel along (rules/05). Not tied to any Endpoint. */
export interface Edge {
  id: string
  mapVersionId: string
  code: string
  geometry: GeoJsonLineString
  /** Corridor width in meters (API: widthMeters). */
  widthMeters?: number
  direction: EdgeDirection
  capacity: number
  maxSpeed: number | null
  isActive: boolean
}

export interface Zone {
  id: string
  mapVersionId: string
  code: string
  name: string
  zoneType: ZoneType
  geometry: GeoJsonPolygon
  capacity: number
  maxSpeed: number | null
  isActive: boolean
  policy?: Record<string, unknown> | null
  policySchemaVersion?: number
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

/** GET /api/workflow-execution/statistics/jobs. Finished-job numbers cover the window; `active` is right now. */
export interface JobStatistics {
  from: string
  to: string
  created: number
  completed: number
  failed: number
  previousCompleted: number
  avgDurationSeconds: number | null
  avgQueueWaitSeconds: number | null
  active: { status: JobStatus; count: number }[]
  byWorkflow: {
    workflowId: string
    workflowCode: string
    workflowName: string
    completed: number
    failed: number
    avgDurationSeconds: number | null
  }[]
  daily: { date: string; completed: number; failed: number }[]
  topFailureCodes: { code: string; count: number }[]
}

/** GET /api/fleet/statistics/robots. Robot counts are right now; assignment outcomes cover the window. */
export interface RobotStatistics {
  from: string
  to: string
  total: number
  enabled: number
  online: number
  lowBattery: number
  averageBatteryPercent: number | null
  byStatus: { status: RobotStatus; count: number }[]
  assignments: {
    completed: number
    reassigned: number
    ackTimeouts: number
    robotOffline: number
    robotRejected: number
    cancelled: number
    failed: number
  }
  robots: {
    id: string
    code: string
    name: string
    status: RobotStatus
    isEnabled: boolean
    isOnline: boolean
    batteryPercent: number
    jobsCompleted: number
    interrupted: number
  }[]
}

/** GET /api/transportation/statistics/requests. Submitted / byStatus / daily cover the window; `open` is right now. */
export interface RequestStatistics {
  from: string
  to: string
  submitted: number
  previousSubmitted: number
  open: number
  avgLeadTimeSeconds: number | null
  byStatus: { status: TransportRequestStatus; count: number }[]
  daily: { date: string; submitted: number; completed: number }[]
}

/* ------------------------------------------------------------ Notifications */

/** One item of the admin notification bell (GET /api/operations/notifications). */
export interface AdminNotification {
  id: string
  type: 'INFO' | 'WARNING' | 'ALERT' | 'ASSIGNMENT' | 'SYSTEM'
  /** Machine name of the situation: JOB_FAILED, JOB_PAUSED, ROBOT_OFFLINE, ROBOT_BATTERY_LOW … */
  kind: string
  title: string
  content: string
  /** What it is about (JOB, ROBOT) and its id, for the link the bell offers. */
  entityType: string | null
  entityId: string | null
  createdAt: string
  isRead: boolean
  readAt: string | null
  /** Set when the situation is over (the robot came back, the job moved on). */
  resolvedAt: string | null
}

export interface NotificationInbox {
  unreadCount: number
  items: AdminNotification[]
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

/** Body of POST /api/warehouse/products. The server upper-cases the SKU and starts the product active. */
export interface CreateProductBody {
  categoryId: string
  sku: string
  name: string
  supplierBarcode?: string
  description?: string
}

/** Body of POST /api/warehouse/product-categories. The server upper-cases the code. */
export interface CreateCategoryBody {
  code: string
  name: string
  description?: string
}

export type ContainerStatus = 'CREATED' | 'PACKED' | 'RESERVED' | 'IN_TRANSIT' | 'STORED' | 'HOLD' | 'EMPTY' | 'OUT_OF_SERVICE'

/** warehouse.containers: the physical transport unit; one Container holds one Product type (rules/00). */
export interface Container {
  id: string
  productId: string
  barcode: string
  supplierPackageBarcode?: string
  status: ContainerStatus
  currentStorageLocationId: string | null
  currentLevelNo: number | null
  createdAt: string
  updatedAt: string
}

/** Container joined with Product and StorageLocation. TODO(backend): needs a read endpoint with these joins. */
export interface ContainerView extends Container {
  sku: string
  productName: string
  locationCode: string | null
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
  endpointName: string
}

/* ------------------------------------------------------------ Transportation */

/** transportation.transport_request_details: the only persisted movement plan, one Container move per line. */
export interface TransportRequestDetail {
  id: string
  transportRequestId: string
  sequenceNo: number
  containerId: string
  sourceStorageLocationId: string | null
  sourceEndpointId: string
  sourceLevelNo: number
  destinationStorageLocationId: string | null
  destinationEndpointId: string
  destinationLevelNo: number
  status: TransportRequestDetailStatus
}

/** transportation.transport_requests. Status is aggregated from the Detail lines (rules/02). */
export interface TransportRequest {
  id: string
  requestCode: string
  warehouseId: string
  workflowId: string
  requestedBy: string
  status: TransportRequestStatus
  note: string | null
  submittedAt: string
  queuedAt: string | null
  completedAt: string | null
  failureCode: string | null
  failureMessage: string | null
}

export type TransportRequestAction = 'CANCEL'

/**
 * A Request as the console lists it. TODO(backend): needs a read endpoint that joins the names, the Container
 * barcode and Endpoint labels, and the Jobs reached through JobContainer (Job itself has no TransportRequestId).
 */
export interface TransportRequestView extends TransportRequest {
  workflowName: string
  requestedByName: string
  details: (TransportRequestDetail & {
    containerBarcode: string
    sourceLabel: string
    destinationLabel: string
  })[]
  jobs: { jobNo: string; status: JobStatus; robotCode: string | null }[]
  availableActions: TransportRequestAction[]
}
