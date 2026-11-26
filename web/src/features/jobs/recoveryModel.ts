import type { JobRecovery, RecoveryAction, RecoveryChecklistItem, RecoveryContainer, RecoveryPhase, RecoveryScan } from '@/shared/api/jobs'
import { msg, t } from '@/shared/i18n'
import type { Tone } from '@/shared/ui/statusTones'

export const PHASE_LABEL: Record<RecoveryPhase, string> = {
  ASSESSMENT_REQUIRED: msg('Waiting for a technician'),
  ASSESSED: msg('Assessed'),
  SOURCE_REPOSITIONING: msg('Failed robot moving to a recovery point'),
  SOURCE_SECURED: msg('Failed robot secured'),
  TARGET_EN_ROUTE: msg('Second robot on its way'),
  AWAITING_TRANSFER: msg('Ready for the transfer'),
  INTERVENTION_REQUIRED: msg('A person has to decide'),
}

export const PHASE_TONE: Record<RecoveryPhase, Tone> = {
  ASSESSMENT_REQUIRED: 'red',
  ASSESSED: 'amber',
  SOURCE_REPOSITIONING: 'blue',
  SOURCE_SECURED: 'teal',
  TARGET_EN_ROUTE: 'blue',
  AWAITING_TRANSFER: 'green',
  INTERVENTION_REQUIRED: 'red',
}

export const RESULT_LABEL: Record<string, string> = {
  SELF_EVACUATION_APPROVED: msg('Safe to drive itself to a recovery point'),
  MANUAL_RECOVERY_REQUIRED: msg('Must not move by itself (manual recovery)'),
  SAME_ROBOT_RECOVERABLE: msg('Repaired: the same robot goes on'),
}

export const HOLDER_LABEL: Record<string, string> = {
  ROBOT: msg('On a robot'),
  STAFF: msg('Held by a person'),
  RECOVERY_STATION: msg('At a recovery point'),
  WAREHOUSE_HOLD: msg('Taken off the Job (held)'),
}

/** Why an action or a place cannot be used, in words; a code this list does not know is shown readable. */
const REASONS: Record<string, string> = {
  recovery_claim_required: msg('Claim the case first'),
  recovery_claimed: msg('Someone else claimed this case'),
  recovery_source_not_secured: msg('A technician has to secure the failed robot first'),
  recovery_assessment_required: msg('A technician has to assess the robot first'),
  recovery_target_assigned: msg('A second robot is already on its way'),
  recovery_no_target: msg('Send a second robot first'),
  recovery_robot_not_arrived: msg('The second robot has not arrived yet'),
  recovery_motion_not_approved: msg('Self-evacuation was not approved'),
  recovery_source_busy: msg('The failed robot is moving or already secured'),
  recovery_source_not_arrived: msg('The failed robot has not reached its recovery point'),
  recovery_source_secured: msg('Already secured'),
  recovery_not_open: msg('The case is not open'),
  recovery_nothing_on_robot: msg('Nothing left on the failed robot'),
  job_not_in_recovery: msg('The Job is not in recovery'),
  recovery_request_inactive: msg('The transport request is no longer active'),
  forbidden: msg('You do not have the right for this'),
  failed_robot_there: msg('the failed robot stands there'),
  taken: msg('taken by another robot'),
  robot_standing_there: msg('a robot stands there'),
  no_path: msg('no way there on the map'),
}

export function reasonText(code: string | null | undefined): string {
  if (!code) return ''
  return REASONS[code] ? t(REASONS[code]) : code.replaceAll('_', ' ')
}

/** Whether the server allows an action now, and why not. */
export function actionState(recovery: JobRecovery | null | undefined, action: RecoveryAction): { allowed: boolean; reason: string | null } {
  const entry = recovery?.availableActions?.find((a) => a.action === action)
  if (!entry) return { allowed: false, reason: null }
  return { allowed: entry.allowed, reason: entry.allowed ? null : (entry.reason ?? null) }
}

/** The steps a recovery goes through, and how far this one is: done, current or to come. */
export function recoverySteps(recovery: JobRecovery): { label: string; state: 'done' | 'current' | 'todo' }[] {
  const order: RecoveryPhase[] = ['ASSESSMENT_REQUIRED', 'ASSESSED', 'SOURCE_SECURED', 'TARGET_EN_ROUTE', 'AWAITING_TRANSFER']
  const labels = [t('Assess'), t('Evacuate / locate'), t('Secure'), t('Second robot'), t('Transfer')]
  const resolved = recovery.resolvedAt !== null
  const phase: RecoveryPhase = recovery.phase === 'SOURCE_REPOSITIONING' ? 'ASSESSED'
    : recovery.phase === 'INTERVENTION_REQUIRED' ? (recovery.sourceSecuredAt ? 'TARGET_EN_ROUTE' : 'ASSESSED')
    : (recovery.phase ?? 'SOURCE_SECURED')
  const at = order.indexOf(phase)
  return labels.map((label, i) => ({ label, state: resolved || i < at ? 'done' : i === at ? 'current' : 'todo' }))
}

/** The checklist a technician starts from; every item must pass before the robot may move again. */
export function defaultRecoveryChecklist(): RecoveryChecklistItem[] {
  return [
    t('Motor and driver stop safely'),
    t('Encoders / odometry trusted'),
    t('Lidar and safety sensors work'),
    t('Pose is right on the map'),
    t('Connection is stable'),
    t('Cargo sits firmly'),
    t('STOP, collision monitor and watchdog active'),
    t('Battery enough for the way'),
  ].map((item) => ({ item, ok: false }))
}

/** A typed or scanned label → the container it belongs to (case-insensitive), or null. */
export function matchScan(containers: RecoveryContainer[], text: string): RecoveryContainer | null {
  const wanted = text.trim().toLowerCase()
  if (!wanted) return null
  return containers.find((c) => (c.barcode ?? '').toLowerCase() === wanted || c.containerId.toLowerCase() === wanted) ?? null
}

/** Scans of the given containers, in the shape the server wants; containers without a label cannot be scanned. */
export function scansOf(containers: RecoveryContainer[], scanned: ReadonlySet<string>): RecoveryScan[] {
  return containers
    .filter((c) => scanned.has(c.containerId) && c.barcode)
    .map((c) => ({ containerId: c.containerId, barcode: c.barcode as string }))
}
