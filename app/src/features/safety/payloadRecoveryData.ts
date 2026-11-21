import type {
  HandoverStopScan,
  JobRecoveryResponse,
} from '../../shared/types/contracts';

export interface RecoveryEndpointOption {
  id: string;
  mapVersionId: string;
  code: string;
  name: string;
  isEnabled: boolean;
}

export type RecoveryWorkflowPhase =
  | 'resolved'
  | 'claimed_other'
  | 'claim'
  | 'assign'
  | 'en_route'
  | 'confirm';

export interface RecoveryScanOutcome {
  ok: boolean;
  containerId?: string;
  barcode?: string;
  alreadyScanned?: boolean;
  message?: string;
  nextScanned: Record<string, string>;
}

export interface RecoveryScanProgress {
  total: number;
  done: number;
  complete: boolean;
  missingIds: string[];
  scans: HandoverStopScan[];
}

export function recoveryPhaseFromCase(
  recovery: Pick<JobRecoveryResponse, 'status' | 'claimedBy' | 'robotArrived' | 'resolvedAt'> | null | undefined,
  accountId: string | null | undefined,
): RecoveryWorkflowPhase {
  if (!recovery) return 'claim';
  if (
    recovery.resolvedAt
    || recovery.status === 'TRANSFERRED'
    || recovery.status === 'RESUMED_SAME_ROBOT'
  ) {
    return 'resolved';
  }
  if (recovery.claimedBy && recovery.claimedBy !== accountId) {
    return 'claimed_other';
  }
  if (!recovery.claimedBy) {
    return 'claim';
  }
  if (recovery.status === 'TARGET_ASSIGNED') {
    return recovery.robotArrived ? 'confirm' : 'en_route';
  }
  return 'assign';
}

export function recordRecoveryScan(
  recovery: Pick<JobRecoveryResponse, 'containers'> | null | undefined,
  scanned: Record<string, string>,
  rawBarcode: string,
): RecoveryScanOutcome {
  const trimmed = rawBarcode.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: 'Enter or scan a container barcode.',
      nextScanned: scanned,
    };
  }
  const normalized = trimmed.toUpperCase();
  const match = recovery?.containers.find((item) => {
    const code = item.barcode?.trim();
    return Boolean(code && code.toUpperCase() === normalized) || item.containerId === trimmed;
  });
  if (!match) {
    return {
      ok: false,
      message: 'This barcode is not part of the recovery manifest.',
      nextScanned: scanned,
    };
  }
  const barcode = match.barcode?.trim() || trimmed;
  const alreadyScanned = Boolean(scanned[match.containerId]);
  const nextScanned = alreadyScanned
    ? scanned
    : { ...scanned, [match.containerId]: barcode };
  return {
    ok: true,
    containerId: match.containerId,
    barcode,
    alreadyScanned,
    nextScanned,
  };
}

export function recoveryScanProgress(
  recovery: Pick<JobRecoveryResponse, 'containers'> | null | undefined,
  scanned: Record<string, string>,
): RecoveryScanProgress {
  const containers = recovery?.containers ?? [];
  const missingIds: string[] = [];
  const scans: HandoverStopScan[] = [];
  for (const item of containers) {
    const barcode = scanned[item.containerId]?.trim();
    if (barcode) {
      scans.push({ containerId: item.containerId, barcode });
    } else {
      missingIds.push(item.containerId);
    }
  }
  return {
    total: containers.length,
    done: scans.length,
    complete: containers.length > 0 && scans.length === containers.length,
    missingIds,
    scans,
  };
}

export function eligibleRecoveryEndpoints<T extends RecoveryEndpointOption>(
  map: { id: string; endpoints: T[] } | null | undefined,
): T[] {
  if (!map || !Array.isArray(map.endpoints)) return [];
  return map.endpoints
    .filter(endpoint => endpoint.isEnabled && endpoint.mapVersionId === map.id)
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
}

const CANDIDATE_REASON_LABELS: Record<string, string> = {
  container_limit_exceeded: 'Insufficient container bay capacity',
  payload_weight_exceeded: 'Payload exceeds robot weight limit',
  robot_telemetry_stale: 'Robot telemetry is stale',
  robot_offline: 'Robot is offline',
  robot_disabled: 'Robot is disabled',
  robot_in_maintenance: 'Robot is in maintenance',
  robot_in_manual_mode: 'Robot is in manual drive mode',
  robot_motion_held: 'Robot motion is held after STOP',
  robot_map_mismatch: 'Robot is on a different map version',
  robot_assigned_to_other_job: 'Robot is assigned to another active Job',
  robot_busy: 'Robot is busy with another command',
  robot_not_localized: 'Robot pose is not localized',
  robot_unlocalized: 'Robot pose is not localized',
};

export function candidateReasonLabel(reason: string): string {
  return CANDIDATE_REASON_LABELS[reason] || reason;
}

const RECOVERY_ACTION_REASONS: Record<string, string> = {
  job_not_in_recovery: 'Job is no longer in recovery mode.',
  recovery_claimed: 'Another operator holds this recovery case.',
  recovery_claim_required: 'Claim this recovery case before taking action.',
  recovery_target_assigned: 'Call back the assigned rescue robot first.',
  recovery_no_target: 'Assign a rescue robot and transfer point first.',
  recovery_robot_not_arrived: 'Wait until the rescue robot arrives at the transfer point.',
  recovery_request_inactive: 'The Transport Request is cancelled or cancelling; review cargo before continuing.',
  permission_denied: 'You do not have job.operate permission.',
};

export function recoveryActionReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return RECOVERY_ACTION_REASONS[reason] || reason;
}
