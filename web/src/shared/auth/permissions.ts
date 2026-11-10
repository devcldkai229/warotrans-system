import type { Capabilities } from '@/shared/api/contracts'

/**
 * Permission names as the backend enforces them (WaroTrans.BuildingBlocks.Authorization.Permissions).
 * Screens decide what to show from these, never from the role name: the server's matrix is the only source.
 */
export const PERMISSIONS = {
  userManage: 'user.manage',
  consoleAccess: 'console.access',
  mapRead: 'map.read',
  mapWrite: 'map.write',
  warehouseRead: 'warehouse.read',
  warehouseWrite: 'warehouse.write',
  containerCreate: 'container.create',
  voucherWrite: 'voucher.write',
  transportRead: 'tr.read',
  transportCreate: 'tr.create',
  transportCancel: 'tr.cancel',
  transportReject: 'tr.reject',
  workflowRead: 'workflow.read',
  workflowWrite: 'workflow.write',
  jobRead: 'job.read',
  jobOperate: 'job.operate',
  jobPause: 'job.pause',
  jobCancel: 'job.cancel',
  robotRead: 'robot.read',
  robotManage: 'robot.manage',
  robotConfigure: 'robot.configure',
  robotCommand: 'robot.command',
  robotStop: 'robot.stop',
  robotManualDrive: 'robot.manual.drive',
  robotMaintenance: 'robot.maintenance',
  robotPower: 'robot.power',
  robotDiagnostics: 'robot.diagnostics',
  trafficRead: 'traffic.read',
  trafficManage: 'traffic.manage',
  dispatchOverride: 'dispatch.override',
  notificationRead: 'notification.read',
  issueRead: 'issue.read',
  issueCreate: 'issue.create',
  issueManage: 'issue.manage',
  auditRead: 'audit.read',
  statisticsRead: 'statistics.read',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** True when the capabilities grant `permission`. No capabilities (not signed in yet) grants nothing. */
export function hasPermission(capabilities: Capabilities | null | undefined, permission: Permission): boolean {
  return capabilities?.permissions.includes(permission) ?? false
}

/**
 * True when the caller may act on this robot: the permission must be granted and, for a Technician, the robot must
 * be in their scope. The server checks the same on every request; this only hides what would be refused.
 */
export function canActOnRobot(
  capabilities: Capabilities | null | undefined,
  permission: Permission,
  robotId: string,
): boolean {
  if (!capabilities || !hasPermission(capabilities, permission)) return false
  return capabilities.robotScope.allRobots || capabilities.robotScope.robotIds.includes(robotId)
}

/** True when `can` grants the one permission, or any one of a list (a screen several roles reach by different rights). */
export function holdsPermission(can: (permission: Permission) => boolean, needs: Permission | Permission[]): boolean {
  return Array.isArray(needs) ? needs.some(can) : can(needs)
}

/** The web console is for Admins and Technicians; Staff work in the mobile app. */
export function mayUseConsole(capabilities: Capabilities | null | undefined): boolean {
  return hasPermission(capabilities, PERMISSIONS.consoleAccess)
}
