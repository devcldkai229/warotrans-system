import type {
  Cancellation, CancellationAction, CancellationItem, CancellationStage, CancellationStatus,
} from '../../shared/api/transportApi';

/** What each stage of a cancelled Job means for the person looking at it (TRN-03). */
export const CANCELLATION_STAGE_TEXT: Record<CancellationStage, string> = {
  PENDING: 'Being Cancelled',
  STOP_REQUESTED: 'Stop Sent, Waiting For The Robot To Hold Still',
  WAITING_ROBOT: 'Robot Offline Or Not Confirming Its Stop',
  CARGO_ON_ROBOT: 'Stopped With Cargo',
  DELIVERING: 'Delivering The Cargo On Board',
  TO_RECOVERY: 'Driving To The Recovery Point',
  AT_RECOVERY: 'At The Recovery Point',
  AT_DROPOFF: 'At The Drop-Off',
  HANDOVER_REQUESTED: 'Handover Requested',
  SAFE_STOP: 'Safe Stop: Technician Needed',
  MANUAL: 'Needs A Person',
  DONE: 'Done',
};

export const CANCELLATION_STATUS_TEXT: Record<CancellationStatus, string> = {
  REQUESTED: 'Cancel Requested',
  STOPPING: 'Stopping Robots',
  WAITING_ROBOT: 'Waiting For A Robot',
  RECOVERING: 'Cargo Being Delivered Or Unloaded',
  MANUAL_INTERVENTION: 'Needs A Person',
  PARKING_ROBOTS: 'Sending Robots To Parking',
  FINALIZED: 'Cancellation Finished',
};

/** Why a next step is closed, as the server says it. */
export const BLOCKED_ACTION_TEXT: Record<string, string> = {
  reason_forbids_delivery: 'The cancel reason does not allow delivering this cargo.',
  robot_offline: 'The robot is offline.',
  robot_not_localized: 'The robot is not localized: it must not drive.',
  robot_telemetry_stale: 'No fresh position from the robot.',
  needs_technician: 'A technician has to look at the robot first.',
  already_at_recovery_point: 'Already at a recovery point.',
  at_dropoff_reconcile_first: 'At its drop-off: confirm the delivery or unload it there first.',
  recovery_needs_move: 'The robot stands where a person has to act first.',
  robot_driving_to_recovery: 'The robot is driving to the recovery point.',
  robot_not_stopped: 'The robot does not hold still yet.',
};

export interface RobotNextStep {
  /** Where the robot is now. */
  where: string;
  /** Where the destination policy sends it, or what has to happen first. */
  next: string | null;
  params?: Record<string, string>;
  warn?: boolean;
}

/**
 * The destination policy in words: nothing picked up → parking; on the way to a pickup → a wait point or parking;
 * carrying cargo → a recovery point; at its drop-off → reconcile first; cannot drive safely → safe stop and a
 * technician; nothing left on the robot → parking.
 */
export function robotNextStep(item: CancellationItem): RobotNextStep {
  const code = item.recoveryPointCode ?? '';
  if (item.stage === 'SAFE_STOP') return { where: 'Holds Still But Cannot Drive Safely', next: 'A Technician Checks The Robot', warn: true };
  if (item.stage === 'WAITING_ROBOT') return { where: 'Offline Or Not Confirming Its Stop', next: 'Check The Robot On The Floor', warn: true };
  if (item.stage === 'MANUAL') return { where: 'Cannot Finish By Itself', next: 'A Person Sorts Out The Robot And Its Cargo', warn: true };
  if (item.stage === 'DONE') {
    const to = item.destinationEndpointCode ?? '';
    switch (item.destinationStatus) {
      case 'SENT': return { where: 'Nothing Left On The Robot', next: 'Sent To {code}', params: { code: to } };
      case 'PENDING': return { where: 'Nothing Left On The Robot', next: 'Sending To Parking' };
      case 'NOT_NEEDED': return { where: 'Nothing Left On The Robot', next: to ? 'Already At {code}' : 'Stays Where It Is', params: { code: to } };
      case 'SKIPPED': return { where: 'Nothing Left On The Robot', next: 'Not Moved: {why}', params: { why: item.destinationNote ?? '' } };
      default: return { where: 'Nothing Left On The Robot', next: null };
    }
  }
  switch (item.phase) {
    case 'TO_RECOVERY': return { where: 'Driving Its Cargo To {code}', next: 'Unload By Scan There', params: { code } };
    case 'AT_RECOVERY': return { where: 'Holds Still At {code}', next: 'Unload By Scan, Or Continue The Delivery', params: { code } };
    case 'AT_DROPOFF': return { where: 'At Its Drop-Off, Unload Not Confirmed', next: 'Reconcile The Containers First' };
    case 'IN_TRANSIT':
    case 'AT_PICKUP': return { where: 'Carrying Containers Between Stops', next: 'Recovery Point, Where The Cargo Is Handled' };
    case 'TO_PICKUP': return { where: 'On Its Way To A Pickup, Nothing On Board', next: 'A Wait Point Or Parking, Whichever Is Nearer' };
    case 'NOT_STARTED': return { where: 'Had Not Started', next: 'Parking' };
    default: return { where: 'Being Cancelled', next: null };
  }
}

/** The open next steps of a robot (server decided), with the old flags as a fallback for an older server. */
export function openActions(item: CancellationItem): Set<CancellationAction> {
  if (item.actions) return new Set(item.actions);
  const open = new Set<CancellationAction>();
  if (item.canHandOver) open.add('UNLOAD_BY_SCAN');
  if (item.canDeliver) open.add('CONTINUE_DELIVERY');
  return open;
}

export type CancellationTone = 'success' | 'warning' | 'danger' | 'info';

export function cancellationTone(status: CancellationStatus): CancellationTone {
  switch (status) {
    case 'FINALIZED':
    case 'PARKING_ROBOTS': return 'success';
    case 'MANUAL_INTERVENTION': return 'danger';
    case 'WAITING_ROBOT':
    case 'STOPPING': return 'warning';
    default: return 'info';
  }
}

/** Still in progress: the screen keeps polling and never says "cancelled" while cargo is on a robot. */
export function isCancellationActive(cancellation: Cancellation | null | undefined): boolean {
  return !!cancellation && cancellation.status !== 'FINALIZED';
}

/** Containers of a Job still on its robot (what an unload by scan is for). */
export function cargoStillOnRobot(item: CancellationItem) {
  return item.containers.filter(container => container.jobContainerStatus === 'ONBOARD' && container.resolution !== 'HANDED_OVER');
}

export type ScanMatch =
  | { kind: 'match'; containerId: string; barcode: string }
  | { kind: 'already'; barcode: string }
  | { kind: 'not_on_robot'; barcode: string };

/**
 * Which container of this Job a scanned label names. A label of a container already unloaded is "already" (the server
 * would answer the same, but the person sees it at once); any other label is not on this robot.
 */
export function matchScannedContainer(item: CancellationItem, scanned: string): ScanMatch {
  const code = scanned.trim().toUpperCase();
  const found = item.containers.find(container => (container.barcode ?? '').trim().toUpperCase() === code);
  if (!found) return { kind: 'not_on_robot', barcode: scanned.trim() };
  if (found.resolution === 'HANDED_OVER') return { kind: 'already', barcode: found.barcode ?? scanned.trim() };
  if (found.jobContainerStatus !== 'ONBOARD') return { kind: 'not_on_robot', barcode: found.barcode ?? scanned.trim() };
  return { kind: 'match', containerId: found.containerId, barcode: found.barcode ?? scanned.trim() };
}

/** One line for the progress card: what happened to the containers so far. */
export function cancellationCounts(cancellation: Cancellation) {
  return {
    delivered: cancellation.delivered,
    handedOver: cancellation.handedOver,
    notPickedUp: cancellation.notPickedUp,
    onRobot: cancellation.onRobot,
  };
}

/** A key per confirmation: a double tap or a retried request never starts two cancellations. */
export function newIdempotencyKey(random: () => number = Math.random, now: () => number = Date.now): string {
  return `m-${now().toString(36)}-${Math.floor(random() * 1e12).toString(36)}`;
}
