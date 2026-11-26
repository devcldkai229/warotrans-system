import { AI_ENABLED } from '@/shared/api/ai'
import { LAB_ENABLED } from '@/shared/api/lab'
import { PERMISSIONS, type Permission } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'

export interface NavItem {
  label: string
  to: string
  /** Shown only when the session holds this permission (the API would refuse the screen's calls otherwise). */
  requires: Permission
}

export interface NavGroup {
  label: string
  /** Route prefix: the group is active on every screen under it. */
  to: string
  requires?: Permission
  items?: NavItem[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: t('Monitor'),
    to: '/monitor',
    items: [
      { label: t('Fleet'), to: '/monitor/fleet', requires: PERMISSIONS.robotRead },
      { label: t('Transport requests'), to: '/monitor/requests', requires: PERMISSIONS.transportRead },
      { label: t('Jobs'), to: '/monitor/jobs', requires: PERMISSIONS.jobRead },
      { label: t('Transport journals'), to: '/monitor/journals', requires: PERMISSIONS.evidenceRead },
    ],
  },
  {
    label: t('Configure'),
    to: '/configure',
    items: [
      { label: t('Facility'), to: '/configure/facility', requires: PERMISSIONS.mapRead },
      { label: t('Workflows'), to: '/configure/workflows', requires: PERMISSIONS.workflowRead },
    ],
  },
  {
    label: t('Operations'),
    to: '/operations',
    items: [
      { label: t('Issues'), to: '/operations/issues', requires: PERMISSIONS.issueRead },
      { label: t('Technical tickets'), to: '/operations/tickets', requires: PERMISSIONS.robotRead },
      { label: t('Notifications'), to: '/operations/notifications', requires: PERMISSIONS.notificationRead },
      { label: t('Robot history'), to: '/operations/robot-history', requires: PERMISSIONS.robotRead },
      { label: t('Audit log'), to: '/operations/audit', requires: PERMISSIONS.auditRead },
    ],
  },
  { label: t('Statistics'), to: '/dashboard', requires: PERMISSIONS.statisticsRead },
]


/** Technician portal (/tech): robot screens only. Each item still needs its permission, like the admin menu. */
export const TECH_NAV: NavGroup[] = [
  { label: t('Robots'), to: '/tech/fleet', requires: PERMISSIONS.robotRead },
  { label: t('Technical tickets'), to: '/tech/tickets', requires: PERMISSIONS.robotRead },
  { label: t('Issues'), to: '/tech/issues', requires: PERMISSIONS.issueRead },
  { label: t('Robot history'), to: '/tech/robot-history', requires: PERMISSIONS.robotRead },
  { label: t('Transport journals'), to: '/tech/journals', requires: PERMISSIONS.evidenceRead },
  ...(AI_ENABLED ? [{ label: t('AI incidents'), to: '/tech/incidents', requires: PERMISSIONS.evidenceRead }] : []),
  ...(LAB_ENABLED ? [{ label: t('Fault Injection Lab'), to: '/tech/lab', requires: PERMISSIONS.labOperate }] : []),
  { label: t('Audit log'), to: '/tech/audit', requires: PERMISSIONS.auditRead },
  { label: t('Notifications'), to: '/tech/notifications', requires: PERMISSIONS.notificationRead },
]
