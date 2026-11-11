import type { AccountRole, AccountStatus } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
/** Backend AccountRole values. Roles are a code-only enum, not a table (rules/00). */

export const ACCOUNT_ROLES: AccountRole[] = ['ADMIN', 'STAFF', 'TECHNICIAN']

export const ACCOUNT_STATUSES: AccountStatus[] = ['ACTIVE', 'INACTIVE', 'LOCKED']

/** UI copy describing each role. The exact rights are the backend RolePermissionMatrix. */
export const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  ADMIN: t('Full access: fleet control, data management, user administration'),
  STAFF: t('Floor work in the mobile app: transport requests, handovers, receiving; may stop a robot'),
  TECHNICIAN: t('Diagnose, stop, drive and maintain the robots assigned to them; no stock or account rights'),
}
