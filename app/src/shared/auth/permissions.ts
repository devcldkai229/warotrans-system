import type { UserSession } from '../types/contracts';

/**
 * Permission names enforced by the backend (WaroTrans.BuildingBlocks.Authorization.Permissions), the same list the
 * web console uses. A screen or button is shown only when the session holds the permission the API will check.
 */
export const PERMISSIONS = {
  mapRead: 'map.read',
  warehouseRead: 'warehouse.read',
  productCreate: 'product.create',
  voucherWrite: 'voucher.write',
  containerCreate: 'container.create',
  containerRecover: 'container.recover',
  transportRead: 'tr.read',
  transportCreate: 'tr.create',
  transportCancel: 'tr.cancel',
  transportReject: 'tr.reject',
  workflowRead: 'workflow.read',
  jobRead: 'job.read',
  jobOperate: 'job.operate',
  jobTakeover: 'job.takeover',
  jobPause: 'job.pause',
  robotRead: 'robot.read',
  robotManage: 'robot.manage',
  robotConfigure: 'robot.configure',
  robotStop: 'robot.stop',
  /** LOCALIZE at a known endpoint; never makes the robot move. */
  robotLocalize: 'robot.localize',
  robotManualDrive: 'robot.manual.drive',
  trafficRead: 'traffic.read',
  notificationRead: 'notification.read',
  issueRead: 'issue.read',
  issueCreate: 'issue.create',
  issueManage: 'issue.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** True when the session's server-issued permissions include `permission`. Nothing is granted without a session. */
export function sessionCan(session: UserSession | null | undefined, permission: Permission): boolean {
  return session?.permissions?.includes(permission) ?? false;
}

/** Initials for the avatar: first letters of the first two words. */
export function initialsFor(fullName: string): string {
  return fullName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'OP';
}
