import type { AccountRole, AccountStatus } from '@/shared/api/contracts'

/** Backend AccountRole values. Roles are a code-only enum, not a table (rules/00). */
export const ACCOUNT_ROLES: AccountRole[] = ['ADMIN', 'STAFF']

export const ACCOUNT_STATUSES: AccountStatus[] = ['ACTIVE', 'INACTIVE', 'LOCKED']

/** UI copy describing what each role can do. TODO(backend): the API does not expose role descriptions. */
export const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  ADMIN: 'Full access: fleet control, data management, user administration',
  STAFF: 'Operational access: jobs, inventory and storage data only',
}
