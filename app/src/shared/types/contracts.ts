export type AccountRole = 'ADMIN' | 'STAFF' | 'MAINTAINER';

export interface UserSession {
  id: string;
  username: string;
  fullName: string;
  role: AccountRole;
  zone: string;
  avatarInitials: string;
}

export type RobotStatus =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'EXECUTING'
  | 'PAUSED'
  | 'CHARGING'
  | 'MAINTENANCE'
  | 'ERROR';

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

export type JobTaskStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED';

export type JobStepStatus =
  | 'PENDING'
  | 'READY'
  | 'EXECUTING'
  | 'WAITING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type StepType = 'CHECK' | 'MOVE' | 'HUMAN_INTERACTION' | 'WAIT';

export type ContainerStatus =
  | 'CREATED'
  | 'PACKED'
  | 'RESERVED'
  | 'IN_TRANSIT'
  | 'STORED'
  | 'HOLD'
  | 'EMPTY'
  | 'OUT_OF_SERVICE';

export type TransportRequestStatus =
  | 'SUBMITTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED';

export type WorkflowCode =
  | 'INBOUND_PUTAWAY'
  | 'OUTBOUND_RETRIEVAL'
  | 'INTERNAL_RELOCATION'
  | 'POINT_TO_POINT_TRANSPORT'
  | 'REPLENISHMENT'
  | 'PAYLOAD_RECOVERY'
  | 'MAINTENANCE_ALL_ROBOTS';

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

export interface ContainerSlot {
  slotNo: 1 | 2 | 3;
  slotLabel: 'Slot 1 (Front)' | 'Slot 2 (Mid)' | 'Slot 3 (Rear)';
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
