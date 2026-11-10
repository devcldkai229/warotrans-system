import type { AccountRole } from './contracts'
import { apiFetch } from './client'

/** One role and what the server enforces for it (GET /api/identity/roles, Admin only). */
export interface RoleInfo {
  role: AccountRole
  /** Every permission the role holds. */
  permissions: string[]
  /** Whether the role's robot permissions are limited to the robots assigned to each account. */
  robotScoped: boolean
}

export interface RolesResponse {
  roles: RoleInfo[]
  /** Every permission the API protects, so a screen can show what a role does not have. */
  allPermissions: string[]
}

/** The role-permission matrix, read from the server's RolePermissionMatrix (never a copy kept in the web). */
export function listRoles() {
  return apiFetch<RolesResponse>('/api/identity/roles')
}
