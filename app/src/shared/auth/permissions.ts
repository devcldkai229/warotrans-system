import type { UserSession } from '../types/contracts';

/**
 * Permission names enforced by the backend (WaroTrans.BuildingBlocks.Authorization.Permissions), the same list the
 * web console uses. A screen or button is shown only when the session holds the permission the API will check.
 */
export const PERMISSIONS = {
  mapRead: 'map.read',
  warehouseRead: 'warehouse.read',
  containerCreate: 'container.create',
  containerRecover: 'container.recover',
  transportRead: 'tr.read',
  transportCreate: 'tr.create',
  transportCancel: 'tr.cancel',
  workflowRead: 'workflow.read',
  jobRead: 'job.read',
  jobOperate: 'job.operate',
  jobTakeover: 'job.takeover',
  jobPause: 'job.pause',
  robotRead: 'robot.read',
  robotStop: 'robot.stop',
  robotManualDrive: 'robot.manual.drive',
  notificationRead: 'notification.read',
  issueCreate: 'issue.create',
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
