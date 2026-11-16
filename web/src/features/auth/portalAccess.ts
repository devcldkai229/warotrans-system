import type { Account } from '@/shared/api/contracts'
import { pathsFor, toAdminRoute, toTechRoute } from '@/shared/routing/consolePaths'

/**
 * Which portal an account works in. This picks the menu and the landing screen only: what each screen may do is
 * still decided by the permissions the server grants, and the server checks them on every request.
 *
 * One portal per role: a Technician works only in the Technician portal (/tech), an Admin only in the admin console.
 */
export function mayUseTechPortal(role: Account['role']): boolean {
  return role === 'TECHNICIAN'
}

export function mayUseAdminPortal(role: Account['role']): boolean {
  return role !== 'TECHNICIAN'
}

/**
 * Where a Technician who opened an admin route goes: the same screen in the Technician portal when there is one
 * (a bookmarked robot, a link from an e-mail), else the Technician home.
 */
export function techRedirectFor(route: string): string {
  return toTechRoute(route) ?? pathsFor('tech').home
}

/** Where an Admin who opened a Technician route goes: the same screen in the admin console, else its home. */
export function adminRedirectFor(route: string): string {
  return toAdminRoute(route) ?? pathsFor('admin').home
}
