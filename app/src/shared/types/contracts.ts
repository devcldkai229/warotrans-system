/**
 * Backend contract mirror.
 *
 * Every union and DTO in this file is a 1:1 translation of the C# contracts in
 * `warotrans-system/backend/src/Modules/**`. The backend serialises with
 * `System.Text.Json` using camelCase property names and string enum values, so
 * the TypeScript shapes below use camelCase fields and string literal unions
 * (never numeric enums).
 *
 * Source of truth per section:
 *  - Identity           -> Identity/Features/Shared/{AccountResponse,SessionResponse}.cs
 *  - Fleet              -> Fleet/Features/Shared/RobotResponse.cs, Fleet/Enums/*
 *  - Navigation         -> Navigation/Features/Shared/*, Navigation/Enums/*
 *  - Warehouse          -> Warehouse/Features/ListWarehouses/Response.cs, Warehouse/Enums/*
 *  - WorkflowExecution  -> WorkflowExecution/Features/Shared/WorkflowDtos.cs, WorkflowExecution/Enums/*
 *  - Transportation     -> Transportation/Features/{CreateTransportRequest,QueueTransportRequest}
 *
 * The view models at the bottom of the file (`UserSession`, `RobotSummary`,
 * `JobSummary`, ...) are the Phase 0 prototype projections still consumed by the
 * existing screens. They are kept until each screen is migrated onto the DTOs
 * below, so removing them is a follow-up change, never an inline one.
 */

/** ISO-8601 timestamp exactly as the backend emits it (`DateTimeOffset`). */
export type UtcDateTime = string;

/** Free-form JSON as persisted in the backend's `jsonb` columns. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/** `Identity/Enums/AccountRole.cs` — ADMIN, STAFF, TECHNICIAN. */
export type AccountRole = 'ADMIN' | 'STAFF' | 'TECHNICIAN';

/** `Identity/Enums/AccountStatus.cs`. */
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

/** `Identity/Features/Shared/AccountResponse.cs`. */
export interface AccountResponse {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: AccountRole;
  status: AccountStatus;
  lastLoginAt: UtcDateTime | null;
}

/**
 * `Identity/Features/Shared/SessionResponse.cs`.
 *
 * `refreshToken` is null when the backend moved it into the HttpOnly cookie,
 * which is the default for the web host.
 */
export interface SessionResponse {
  accessToken: string;
  accessTokenExpiresAt: UtcDateTime;
  refreshToken: string | null;
  account: AccountResponse;
}

/* -------------------------------------------------------------------------- */
/* Warehouse                                                                   */
/* -------------------------------------------------------------------------- */

/** `Warehouse/Enums/ContainerStatus.cs`. */
export type ContainerStatus =
  | 'CREATED'
  | 'PACKED'
  | 'RESERVED'
  | 'IN_TRANSIT'
  | 'STORED'
  | 'HOLD'
  | 'EMPTY'
  | 'OUT_OF_SERVICE'
  /** Delivered to an Outbound gate for a confirmed outbound stock voucher: left the warehouse, no storage location. */
  | 'ISSUED';

/** `Warehouse/Enums/StockVoucherType.cs`: INBOUND = phiếu nhập (PN-), OUTBOUND = phiếu xuất (PX-). */
export type StockVoucherType = 'INBOUND' | 'OUTBOUND';

/**
 * `Warehouse/Enums/StockVoucherStatus.cs`. DRAFT → CONFIRMED by people; CONFIRMED → COMPLETED by itself when the last
 * Container is done (on a shelf for inbound, issued at an Outbound gate for outbound) or by people closing it short.
 */
export type StockVoucherStatus = 'DRAFT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

/** `Warehouse/Features/ListWarehouses/Response.cs`. */
export interface WarehouseListItemResponse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: UtcDateTime;
}

/** `Warehouse/Features/ListWarehouses/Response.cs` (paged envelope). */
export interface ListWarehousesResponse {
  items: WarehouseListItemResponse[];
  total: number;
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

/** `Navigation/Enums/MapStatus.cs`. */
export type MapStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** `Navigation/Enums/EndpointType.cs`. */
export type EndpointType = 'WAYPOINT' | 'CHARGER' | 'PARK' | 'QUEUE';

/** `Navigation/Enums/ZoneType.cs`. */
export type ZoneType = 'KEEP_OUT' | 'SPEED' | 'NO_STOP' | 'SINGLE_OCCUPANCY' | 'JUNCTION';

/** `Navigation/Features/GetEndpoint/Response.cs` (also the `EndpointListItemDto` shape). */
export interface EndpointResponse {
  id: string;
  mapVersionId: string;
  code: string;
  name: string;
  endpointType: EndpointType;
  x: number;
  y: number;
  yaw: number;
  positionTolerance: number;
  yawTolerance: number;
  isEnabled: boolean;
}

/** `Navigation/Features/Shared/ZoneDtos.cs` (also the `ZoneListItemDto` shape). */
export interface ZoneResponse {
  id: string;
  mapVersionId: string;
  code: string;
  name: string;
  zoneType: ZoneType;
  geometry: JsonValue;
  maxSpeed: number | null;
  isActive: boolean;
  policy: JsonValue | null;
  policySchemaVersion: number;
}

/** `Navigation/Features/Shared/MapVersionDtos.cs`. */
export interface MapVersionResponse {
  id: string;
  warehouseId: string;
  code: string;
  versionNo: number;
  name: string;
  status: MapStatus;
  mapUri: string;
  mapYamlUri: string | null;
  previewImageUri: string | null;
  frameId: string;
  imageWidthPixels: number;
  imageHeightPixels: number;
  resolution: number;
  originX: number;
  originY: number;
  originYaw: number;
  negate: boolean;
  occupiedThreshold: number;
  freeThreshold: number;
  contentHash: string | null;
  createdAt: UtcDateTime;
  publishedAt: UtcDateTime | null;
}

/* -------------------------------------------------------------------------- */
/* Fleet                                                                       */
/* -------------------------------------------------------------------------- */

/** `Fleet/Enums/RobotStatus.cs`. */
export type RobotStatus =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'EXECUTING'
  | 'PAUSED'
  | 'CHARGING'
  | 'MAINTENANCE'
  | 'ERROR';

/** `Fleet/Enums/NavigationStatus.cs`. */
export type NavigationStatus =
  | 'IDLE'
  | 'NAVIGATING'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED';

/** `Fleet/Enums/LocalizationStatus.cs`. */
export type LocalizationStatus = 'LOCALIZED' | 'LOST' | 'UNKNOWN';

/** `Fleet/Features/Shared/RobotResponse.cs`. */
export interface RobotResponse {
  id: string;
  warehouseId: string;
  currentMapVersionId: string;
  code: string;
  name: string;
  status: RobotStatus;
  isOnline: boolean;
  /** HW-04: null = never reported (Unknown), never 0 %. */
  batteryPercent: number | null;
  poseX: number;
  poseY: number;
  poseYaw: number;
  lastHeartbeatAt: UtcDateTime | null;
  lastTelemetryAt: UtcDateTime | null;
  navigationStatus: NavigationStatus | null;
  localizationStatus: LocalizationStatus | null;
  linearVelocity: number | null;
  angularVelocity: number | null;
  errorCode: string | null;
  mapVersionCode: string | null;
  currentCommandId: string | null;
  isEnabled: boolean;
  motionHeld?: boolean;
  manualLeaseHolderName?: string | null;
  manualLeaseHolderId?: string | null;
  manualLeaseUntil?: UtcDateTime | null;
  maintenanceReason?: string | null;
  maintenanceSince?: UtcDateTime | null;
  createdAt: UtcDateTime;
  updatedAt: UtcDateTime;
}

export interface ManualLeaseResponse {
  robotId: string;
  active: boolean;
  holderId: string | null;
  holderName: string | null;
  until: UtcDateTime | null;
  heldByMe: boolean;
  leaseId?: string | null;
  sequenced?: boolean;
  serverTime?: UtcDateTime | null;
}

export interface TeleopRobotResponse {
  robotId: string;
  robotCode: string;
  linear: number;
  angular: number;
}

/** `Fleet/Features/ListRobots/Response.cs` (paged envelope). */
export interface ListRobotsResponse {
  items: RobotResponse[];
  total: number;
}

/* -------------------------------------------------------------------------- */
/* WorkflowExecution                                                           */
/* -------------------------------------------------------------------------- */

/** `WorkflowExecution/Enums/WorkflowStatus.cs`. */
export type WorkflowStatus = 'DRAFT' | 'PUBLISHED';

/** `WorkflowExecution/Enums/JobStatus.cs`. */
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
  | 'CANCELLED';

/** `WorkflowExecution/Enums/JobTaskStatus.cs`. */
export type JobTaskStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED';

/** `WorkflowExecution/Enums/JobStepStatus.cs`. */
export type JobStepStatus =
  | 'PENDING'
  | 'READY'
  | 'EXECUTING'
  | 'WAITING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED';

/** `WorkflowExecution/Enums/JobContainerStatus.cs`. */
export type JobContainerStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'ONBOARD'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

/** `WorkflowExecution/Enums/StepType.cs`. */
export type StepType = 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT';

/** `WorkflowExecution/Enums/HandoverType.cs`. */
export type HandoverType =
  | 'PICKUP'
  | 'DROPOFF'
  | 'PAYLOAD_TRANSFER'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'CHARGE_CONNECT'
  | 'CHARGE_DISCONNECT';

/** `WorkflowExecution/Enums/StepFailurePolicy.cs`. */
export type StepFailurePolicy =
  | 'FAIL_JOB'
  | 'PAUSE_FOR_OPERATOR'
  | 'REQUEST_REASSIGN';

/** `WorkflowExecution/Enums/WorkflowDataType.cs`. */
export type WorkflowDataType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'UUID'
  | 'DATETIME';

/** `BuildingBlocks/Enums/SharedEnums.cs` -> `WorkflowVariableSource`. */
export type WorkflowVariableSource = 'ADMIN_INPUT' | 'STAFF_INPUT' | 'SYSTEM_VALUE';

/** `BuildingBlocks/Enums/SharedEnums.cs` -> `BindingSourceType`. */
export type BindingSourceType =
  | 'WORKFLOW_VAR'
  | 'CURRENT_MOVEMENT'
  | 'STEP_OUTPUT'
  | 'CONSTANT';

/** `WorkflowExecution/ValueObjects/WorkflowVariableDefinition.cs`. */
export interface WorkflowVariableDefinition {
  key: string;
  name: string;
  dataType: WorkflowDataType;
  source: WorkflowVariableSource;
  isRequired: boolean;
  defaultValue: JsonValue | null;
  configuredValue: JsonValue | null;
  description: string | null;
  sequenceNo: number;
}

/** `WorkflowExecution/ValueObjects/StepInputBinding.cs`. */
export interface StepInputBinding {
  sourceType: BindingSourceType;
  /** Variable key, `CURRENT_MOVEMENT` path, or the source `StepKey` for `STEP_OUTPUT`. */
  sourceReference: string | null;
  /** Only meaningful when `sourceType` is `STEP_OUTPUT`. */
  outputKey: string | null;
  /** Only meaningful when `sourceType` is `CONSTANT`. */
  constantValue: JsonValue | null;
}

/** `WorkflowExecution/Features/Shared/WorkflowDtos.cs` -> `WorkflowStepDto`. */
export interface WorkflowStepDto {
  id: string;
  stepKey: string;
  name: string;
  stepType: StepType;
  sequenceNo: number;
  operationCode: string;
  instructionText: string | null;
  /** Keyed by step input name. */
  inputBindings: Record<string, StepInputBinding>;
  timeoutSeconds: number;
  maxAttempts: number;
  retryBackoffSeconds: number;
  onFailure: StepFailurePolicy;
}

/** `WorkflowExecution/Features/Shared/WorkflowDtos.cs` -> `WorkflowTaskDto`. */
export interface WorkflowTaskDto {
  id: string;
  taskKey: string;
  name: string;
  sequenceNo: number;
  steps: WorkflowStepDto[];
}

/** `WorkflowExecution/Features/Shared/WorkflowDtos.cs` -> `WorkflowListItemDto`. */
export interface WorkflowListItemDto {
  id: string;
  code: string;
  versionNo: number;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdAt: UtcDateTime;
  publishedAt: UtcDateTime | null;
}

/** `WorkflowExecution/Features/Shared/WorkflowDtos.cs` -> `WorkflowDetailDto`. */
export interface WorkflowDetailDto {
  id: string;
  code: string;
  versionNo: number;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: UtcDateTime;
  publishedAt: UtcDateTime | null;
  variables: WorkflowVariableDefinition[];
  tasks: WorkflowTaskDto[];
}

/**
 * `WorkflowExecution/Features/GetWorkflowRequestInputSchema` -> `RequestInputFieldDto`.
 *
 * `dataType` is a plain string on the wire (the schema builder also emits
 * synthetic movement fields), so it is typed as `WorkflowDataType | string`.
 */
export interface RequestInputFieldDto {
  key: string;
  dataType: WorkflowDataType | string;
  required: boolean;
  label: string;
  description: string | null;
}

/** `WorkflowExecution/Features/GetWorkflowRequestInputSchema` -> `WorkflowRequestInputSchemaDto`. */
export interface WorkflowRequestInputSchemaDto {
  workflowId: string;
  /** Variables declared with `source = STAFF_INPUT`, in `sequenceNo` order. */
  workflowInputs: RequestInputFieldDto[];
  /** Synthetic per-movement fields derived from the workflow definition. */
  movementInputs: RequestInputFieldDto[];
}

/* -------------------------------------------------------------------------- */
/* Job Runtime Graph Contracts (PostgreSQL schema `workflow_execution`)        */
/* Matching: Job, JobContainer, JobTask, JobStep, HandoverConfirmation        */
/* -------------------------------------------------------------------------- */

export interface JobContainerResponse {
  id: string;
  jobId?: string;
  transportRequestId: string;
  containerId: string;
  sequenceNo: number;
  status: JobContainerStatus;
  loadedAt?: UtcDateTime | null;
  deliveredAt?: UtcDateTime | null;
  createdAt?: UtcDateTime;
  updatedAt?: UtcDateTime;
}

export type ConfirmationSource = 'STAFF_APP' | 'ROBOT_BUTTON';

/** Confirmation metadata is returned in JobStep.outputValues by the current API. */
export interface HumanConfirmationOutputs {
  confirmed: boolean;
  confirmationSource: ConfirmationSource;
  confirmedBy: string | null;
  confirmedByRobotId: string | null;
  confirmedAt: UtcDateTime;
  note?: string;
}

export interface HandoverConfirmationResponse {
  id: string;
  jobStepId: string;
  containerId: string;
  confirmedBy: string | null;
  confirmationSource: ConfirmationSource;
  confirmedByRobotId?: string | null;
  handoverType: HandoverType;
  confirmedAt: UtcDateTime;
  note?: string | null;
  evidence?: Record<string, unknown> | null;
}

export interface HandoverConfirmationBody {
  containerId: string | null;
  note?: string | null;
}

export interface JobStepResponse {
  name?: string;
  id: string;
  jobTaskId: string;
  workflowStepId: string;
  workflowStepKey: string;
  operationCode: string;
  stepType: StepType;
  sequenceNo: number;
  status: JobStepStatus;
  resolvedInputs?: Record<string, unknown>;
  outputValues?: Record<string, unknown>;
  targetEndpointId?: string | null;
  /** Endpoint label resolved by the mobile API adapter. */
  targetEndpointCode?: string;
  startedAt?: UtcDateTime | null;
  completedAt?: UtcDateTime | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  handoverConfirmation?: HandoverConfirmationResponse | null;
  /** WH-03 claim: who handles this waiting human step, and until when. */
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimExpiresAt?: UtcDateTime | null;
  deadlineAt?: UtcDateTime | null;
}

export interface JobTaskContextValues {
  executionScope?: 'ONCE_PER_JOB' | 'ONCE_PER_STOP' | 'PER_CONTAINER_AT_STOP';
  stopAction?: 'PICKUP' | 'DROPOFF';
  stopEndpointId?: string;
  stopSequenceNo?: number;
  containerIds?: string[];
  containerId?: string;
  jobContainerId?: string;
  transportRequestDetailId?: string;
  [key: string]: unknown;
}

export interface JobTaskResponse {
  taskKey?: string;
  id: string;
  jobId: string;
  workflowTaskId: string;
  sequenceNo: number;
  status: JobTaskStatus;
  contextValues?: JobTaskContextValues;
  startedAt?: UtcDateTime | null;
  completedAt?: UtcDateTime | null;
  failureCode?: string | null;
  steps: JobStepResponse[];
}

export interface JobOperatorPause {
  pausedBy: string | null;
  pausedAt: UtcDateTime | null;
  reason: string | null;
}

export interface JobDetailResponse {
  id: string;
  jobNo: string;
  workflowId: string;
  mapVersionId: string;
  provisioningKey: string;
  status: JobStatus;
  contextValues?: Record<string, unknown>;
  createdAt: UtcDateTime;
  queuedAt?: UtcDateTime | null;
  startedAt?: UtcDateTime | null;
  completedAt?: UtcDateTime | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  containers: JobContainerResponse[];
  tasks: JobTaskResponse[];
  availableActions?: ActionAvailability[];
  operatorPause?: JobOperatorPause | null;
  activeHandoverStopId?: string | null;
}

export type JobRecoveryStatus = 'OPEN' | 'TARGET_ASSIGNED' | 'TRANSFERRED' | 'RESUMED_SAME_ROBOT';

export type JobRecoveryAction =
  | 'CLAIM'
  | 'RELEASE'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'CONFIRM'
  | 'ARM_BUTTON'
  | 'RESUME_SAME_ROBOT';

export interface RecoveryContainerResponse {
  containerId: string;
  barcode: string | null;
}

export interface JobRecoveryResponse {
  id: string;
  jobId: string;
  status: JobRecoveryStatus | string;
  reason: string;
  fromRobotId: string | null;
  toRobotId: string | null;
  recoveryEndpointId: string | null;
  containerIds: string[];
  robotArrived: boolean;
  confirmedBy: string | null;
  confirmedAt: UtcDateTime | null;
  note: string | null;
  createdAt: UtcDateTime;
  resolvedAt: UtcDateTime | null;
  claimedBy: string | null;
  version: number;
  containers: RecoveryContainerResponse[];
  availableActions: ActionAvailability[];
  buttonArmed?: boolean;
  confirmedByRobotId?: string | null;
}

export interface RecoveryRobotCandidateResponse {
  robotId: string;
  robotCode: string;
  maxContainers: number;
  eligible: boolean;
  reasons: string[];
}

export type HandoverStopAction = 'CLAIM' | 'BEGIN' | 'RELEASE' | 'EXTEND' | 'CONFIRM';

export interface StaffWorkZoneResponse {
  warehouseId: string;
  code: string;
}

export interface HandoverStopScan {
  containerId: string;
  barcode: string;
}

export interface HandoverStopContainerResponse {
  containerId: string;
  barcode: string | null;
}

export interface HandoverStopResponse {
  id: string;
  jobId: string;
  jobNo: string;
  mapVersionId: string;
  endpointId: string;
  moveId: string;
  action: string;
  containers: HandoverStopContainerResponse[];
  offerOpensAt: UtcDateTime;
  robotReadyAt: UtcDateTime | null;
  claimedBy: string | null;
  claimedByName: string | null;
  beginDeadline: UtcDateTime | null;
  beganAt: UtcDateTime | null;
  version: number;
  availableActions: ActionAvailability[];
  warehouseOpensAt?: UtcDateTime;
  workDeadline?: UtcDateTime | null;
  heartbeatIntervalSeconds?: number;
}

export type HandoverProblemCode =
  | 'WRONG_CONTAINER'
  | 'MISSING_CONTAINER'
  | 'BARCODE_UNREADABLE'
  | 'CONTAINER_DAMAGED'
  | 'QUANTITY_MISMATCH';

export type HazardType =
  | 'LIQUID_SPILL'
  | 'FALLEN_CARGO'
  | 'FACILITY_WORK'
  | 'FORKLIFT_TRAFFIC'
  | 'OTHER';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface HazardLocationResponse {
  warehouseId: string;
  mapVersionId: string;
  edgeId: string | null;
  zoneId: string | null;
  endpointId: string | null;
  locationCode: string;
  hazardType: HazardType | string;
}

export type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface IssueEvidenceDto {
  kind: string;
  uri: string | null;
  mimeType: string | null;
  note: string | null;
  addedBy: string | null;
  addedAt: UtcDateTime | null;
}

export interface IssueReportResponse {
  id: string;
  code: string;
  issueType: string;
  severity: string;
  status: IssueStatus | string;
  description: string;
  reportedBy: string;
  assigneeId: string | null;
  containerId: string | null;
  transportRequestId: string | null;
  jobId: string | null;
  jobStepId: string | null;
  storageLocationId: string | null;
  robotId: string | null;
  evidence: IssueEvidenceDto[];
  version: number;
  reportedAt: UtcDateTime;
  updatedAt: UtcDateTime;
  resolvedAt: UtcDateTime | null;
  resolvedBy: string | null;
  resolution: string | null;
  allowedTransitions: string[];
  problemCode: HandoverProblemCode | string | null;
  hazard?: HazardLocationResponse | null;
}

export interface ListIssuesResponse {
  total: number;
  items: IssueReportResponse[];
}

export interface ReportTaskProblemBody {
  reason: string;
  note?: string;
  evidence?: Record<string, unknown>;
}

export interface ReportTaskProblemResponse {
  reportId: string;
  jobTaskId: string;
  status: string;
  reportedAt: UtcDateTime;
}

/* -------------------------------------------------------------------------- */
/* Transportation                                                              */
/* -------------------------------------------------------------------------- */

/** `Transportation/Enums/TransportRequestStatus.cs`. */
export type TransportRequestStatus =
  | 'SUBMITTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED'
  /** Cancel accepted, cargo still on a robot (WH-04). */
  | 'CANCELLING';

/** `Transportation/Enums/TransportRequestDetailStatus.cs`. */
export type TransportRequestDetailStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'CANCEL_PENDING_RECOVERY';

/** BOTH-04: `BuildingBlocks/Abstractions/ActionAvailability.cs` — what the server lets this user do now, and why not. */
export interface ActionAvailability {
  action: string;
  allowed: boolean;
  reason: string | null;
}

/** `Transportation/Features/CreateTransportRequest/Request.cs` (per movement line). */
export interface CreateTransportRequestDetailRequest {
  sequenceNo: number;
  containerId: string;
  sourceStorageLocationId: string | null;
  sourceEndpointId: string;
  /** Storage level (rack level) as a 16-bit integer on the backend. */
  sourceLevelNo: number | null;
  destinationStorageLocationId: string | null;
  destinationEndpointId: string;
  destinationLevelNo: number | null;
}

/**
 * `Transportation/Features/CreateTransportRequest/Request.cs`.
 *
 * Id, `requestCode`, `status` and `planSchemaVersion` are generated server-side,
 * so they are absent here. `workflowInputs` carries only the STAFF_INPUT
 * variables; movement data lives in `details`.
 */
export interface CreateTransportRequestRequest {
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
  workflowInputs: Record<string, JsonValue> | null;
  note: string | null;
  details: CreateTransportRequestDetailRequest[] | null;
}

/** `Transportation/Features/CreateTransportRequest/Response.cs` -> `TransportRequestDetailResponse`. */
export interface TransportRequestDetailResponse {
  id: string;
  sequenceNo: number;
  containerId: string;
  sourceStorageLocationId: string | null;
  sourceEndpointId: string;
  sourceLevelNo: number | null;
  destinationStorageLocationId: string | null;
  destinationEndpointId: string;
  destinationLevelNo: number | null;
  status: TransportRequestDetailStatus;
}

/** `Transportation/Features/CreateTransportRequest/Response.cs`. */
export interface CreateTransportRequestResponse {
  id: string;
  requestCode: string;
  status: TransportRequestStatus;
  warehouseId: string;
  mapVersionId: string;
  workflowId: string;
  planSchemaVersion: number;
  requestedBy: string;
  requestedByName?: string | null;
  note: string | null;
  workflowInputs: Record<string, JsonValue>;
  submittedAt: UtcDateTime;
  details: TransportRequestDetailResponse[];
}

/** `Transportation/Features/QueueTransportRequest/Response.cs` -> `QueuedJobResponse`. */
export interface QueuedJobResponse {
  jobId: string;
  jobNo: string;
  batchKey: string;
  jobContainerCount: number;
  jobTaskCount: number;
  jobStepCount: number;
}

/**
 * `Transportation/Features/QueueTransportRequest/Response.cs`.
 *
 * Batch plans and job stops stay server-side; only job summaries are returned.
 */
export interface QueueTransportRequestResponse {
  transportRequestId: string;
  requestCode: string;
  status: TransportRequestStatus;
  queuedAt: UtcDateTime | null;
  jobs: QueuedJobResponse[];
}

/* -------------------------------------------------------------------------- */
/* View models — Phase 0 prototype projections                                   */
/*                                                                             */
/* Still consumed by the existing screens (jobs, transport, auth). Kept so the  */
/* migration onto the DTOs above can land screen by screen instead of in one   */
/* breaking sweep. See README.md (Source cần đọc theo task).                   */
/* -------------------------------------------------------------------------- */

/** Prototype workflow catalogue. Distinct from `WorkflowListItemDto`, which is server-owned. */
export type WorkflowCode =
  | 'INBOUND_PUTAWAY'
  | 'OUTBOUND_RETRIEVAL'
  | 'INTERNAL_RELOCATION'
  | 'POINT_TO_POINT_TRANSPORT'
  | 'REPLENISHMENT'
  | 'PAYLOAD_RECOVERY'
  | 'MAINTENANCE_ALL_ROBOTS';

export interface UserSession {
  id: string;
  username: string;
  fullName: string;
  role: AccountRole;
  zone: string;
  avatarInitials: string;
  /** Server-enforced permissions (GET /api/identity/me/capabilities); screens render from these, not from `role`. */
  permissions?: string[];
  /** True while the account still holds a temporary password: only the change-password screen opens. */
  mustChangePassword?: boolean;
}

export interface RobotSummary {
  id: string;
  code: string;
  status: RobotStatus;
  batteryPercent: number;
  currentEndpointCode: string;
  isEnabled: boolean;
  isVirtual: boolean;
  assignedJobNo?: string;
}

export interface ShelfSlotOccupancy {
  levelNo: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  occupiedByBarcode?: string | null;
  occupiedBySku?: string | null;
  occupiedByProductName?: string | null;
}

/**
 * 2-Bay AMR Chassis Deck Model (`Bay 1 (Front)`, `Bay 2 (Rear)`).
 */
export interface ContainerSlot {
  slotNo: 1 | 2;
  slotLabel: 'Bay 1 (Front)' | 'Bay 2 (Rear)' | 'Slot 1 (Front)' | 'Slot 2 (Rear)' | 'Slot 2 (Mid)';
  containerBarcode?: string;
  productName?: string;
  quantity?: number;
  action: 'UNLOAD' | 'KEEP_ONBOARD' | 'PICKUP' | 'EMPTY';
}

export interface JobStepSummary {
  sequenceNo: number;
  type: StepType;
  title: string;
  description: string;
  status: JobStepStatus;
  targetEndpointCode?: string;
  timeRemainingSeconds?: number;
}

export interface JobSummary {
  id: string;
  jobNo: string;
  workflowCode: WorkflowCode;
  workflowName: string;
  status: JobStatus;
  assignedRobotCode?: string;
  etaSeconds?: number;
  sourceEndpointCode: string;
  destinationEndpointCode: string;
  activeStepTitle?: string;
  containerCount: number;
  slots: ContainerSlot[];
  steps: JobStepSummary[];
  createdAtUtc: string;
}

export interface WorkflowTemplate {
  code: WorkflowCode;
  title: string;
  tagline: string;
  iconName: string;
  category: 'routine' | 'safety' | 'maintenance';
  estimatedDuration: string;
  requiresContainer: boolean;
}
