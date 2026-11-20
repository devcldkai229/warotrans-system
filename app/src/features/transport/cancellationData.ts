import type { Cancellation, CancellationItem, CancellationStage, CancellationStatus } from '../../shared/api/transportApi';

/** What each stage of a cancelled Job means for the person looking at it (TRN-03). */
export const CANCELLATION_STAGE_TEXT: Record<CancellationStage, string> = {
  PENDING: 'Being Cancelled',
  STOP_REQUESTED: 'Stop Sent, Waiting For The Robot To Hold Still',
  WAITING_ROBOT: 'Robot Offline Or Not Confirming Its Stop',
  CARGO_ON_ROBOT: 'Stopped With Cargo: Deliver It Or Unload It By Scan',
  DELIVERING: 'Delivering The Cargo On Board',
  MANUAL: 'Needs A Person',
  DONE: 'Done',
};

export const CANCELLATION_STATUS_TEXT: Record<CancellationStatus, string> = {
  REQUESTED: 'Cancel Requested',
  STOPPING: 'Stopping Robots',
  WAITING_ROBOT: 'Waiting For A Robot',
  RECOVERING: 'Cargo Being Delivered Or Unloaded',
  MANUAL_INTERVENTION: 'Needs A Person',
  FINALIZED: 'Cancellation Finished',
};

export type CancellationTone = 'success' | 'warning' | 'danger' | 'info';

export function cancellationTone(status: CancellationStatus): CancellationTone {
  switch (status) {
    case 'FINALIZED': return 'success';
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
