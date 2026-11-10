import { msg, t } from '@/shared/i18n'

/**
 * WEB-MGMT-01: the permission names the backend enforces (WaroTrans.BuildingBlocks.Authorization.Permissions), in
 * plain words and grouped by area, so the Roles screen and the account dialog can say what a role may do. Which role
 * holds which permission is never decided here: it comes from GET /api/identity/roles, i.e. from RolePermissionMatrix.
 */
interface GroupDefinition {
  id: string
  title: string
  items: { code: string; label: string }[]
}

const GROUPS: GroupDefinition[] = [
  {
    id: 'access',
    title: msg('Accounts and console'),
    items: [
      { code: 'user.manage', label: msg('Manage accounts and roles') },
      { code: 'console.access', label: msg('Use the web console') },
    ],
  },
  {
    id: 'maps',
    title: msg('Maps'),
    items: [
      { code: 'map.read', label: msg('View maps') },
      { code: 'map.write', label: msg('Create, edit and publish maps') },
    ],
  },
  {
    id: 'warehouse',
    title: msg('Warehouse'),
    items: [
      { code: 'warehouse.read', label: msg('View warehouses, products and stock') },
      { code: 'warehouse.write', label: msg('Change warehouse master data') },
      { code: 'container.create', label: msg('Receive and create containers') },
      { code: 'voucher.write', label: msg('Create and confirm stock vouchers') },
    ],
  },
  {
    id: 'transport',
    title: msg('Transport requests'),
    items: [
      { code: 'tr.read', label: msg('View transport requests') },
      { code: 'tr.create', label: msg('Create transport requests') },
      { code: 'tr.cancel', label: msg('Cancel transport requests') },
      { code: 'tr.reject', label: msg('Reject transport requests') },
    ],
  },
  {
    id: 'workflows',
    title: msg('Workflows and jobs'),
    items: [
      { code: 'workflow.read', label: msg('View workflows') },
      { code: 'workflow.write', label: msg('Create, edit and publish workflows') },
      { code: 'job.read', label: msg('View jobs') },
      { code: 'job.operate', label: msg('Start and resume jobs, confirm steps') },
      { code: 'job.pause', label: msg('Pause jobs') },
      { code: 'job.cancel', label: msg('Cancel jobs') },
    ],
  },
  {
    id: 'robots',
    title: msg('Robots'),
    items: [
      { code: 'robot.read', label: msg('View robots') },
      { code: 'robot.manage', label: msg('Register robots and change their map') },
      { code: 'robot.configure', label: msg('Enable, disable and return robots to service') },
      { code: 'robot.command', label: msg('Send a robot to a point') },
      { code: 'robot.stop', label: msg('Stop a robot') },
      { code: 'robot.manual.drive', label: msg('Drive a robot by hand') },
      { code: 'robot.maintenance', label: msg('Start and finish maintenance') },
      { code: 'robot.power', label: msg('Restart, reboot and shut down a robot') },
      { code: 'robot.diagnostics', label: msg('View robot diagnostics') },
    ],
  },
  {
    id: 'traffic',
    title: msg('Traffic and dispatch'),
    items: [
      { code: 'traffic.read', label: msg('View traffic') },
      { code: 'traffic.manage', label: msg('Manage traffic (quarantine, release)') },
      { code: 'dispatch.override', label: msg('Override the dispatch choice') },
    ],
  },
  {
    id: 'operations',
    title: msg('Operations'),
    items: [
      { code: 'notification.read', label: msg('Read notifications') },
      { code: 'issue.read', label: msg('View issues') },
      { code: 'issue.create', label: msg('Report issues') },
      { code: 'issue.manage', label: msg('Assign and resolve issues') },
      { code: 'audit.read', label: msg('Read the audit log') },
    ],
  },
  {
    id: 'statistics',
    title: msg('Statistics'),
    items: [{ code: 'statistics.read', label: msg('View statistics') }],
  },
]

export interface PermissionGroup {
  id: string
  title: string
  items: { code: string; label: string }[]
}

/** Every permission of the catalog in groups; a permission the server has that this catalog does not know is listed under "Other" by its code. */
export function permissionGroups(allPermissions: readonly string[] = []): PermissionGroup[] {
  const known = new Set(GROUPS.flatMap((group) => group.items.map((item) => item.code)))
  const groups = GROUPS.map((group) => ({
    id: group.id,
    title: t(group.title),
    items: group.items.map((item) => ({ code: item.code, label: t(item.label) })),
  }))
  const unknown = allPermissions.filter((code) => !known.has(code))
  return unknown.length > 0 ? [...groups, { id: 'other', title: t('Other'), items: unknown.map((code) => ({ code, label: code })) }] : groups
}

/** The titles of the areas where a role holds at least one permission, in catalog order. */
export function areasOf(permissions: readonly string[]): string[] {
  const held = new Set(permissions)
  return GROUPS.filter((group) => group.items.some((item) => held.has(item.code))).map((group) => t(group.title))
}

/** Every permission code the catalog describes (the coverage test checks the web's PERMISSIONS against it). */
export function describedPermissionCodes(): string[] {
  return GROUPS.flatMap((group) => group.items.map((item) => item.code))
}
