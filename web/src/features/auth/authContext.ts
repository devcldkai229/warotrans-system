import { createContext, useContext } from 'react'
import type { Account, Capabilities } from '@/shared/api/contracts'
import type { Permission } from '@/shared/auth/permissions'

/** `loading` while the stored session is being restored after a page load. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthValue {
  status: AuthStatus
  account: Account | null
  /** What the server enforces for this session (GET /api/identity/me/capabilities). */
  capabilities: Capabilities | null
  /** Shorthand for "the server would allow this": hides actions that would be refused anyway. */
  can: (permission: Permission) => boolean
  /** Rejects with an `ApiError` (wrong credentials, locked account) or a `ConsoleAccessError` (no console access). */
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Changes the signed-in account's password; rejects with an `ApiError` the form can show. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

/** The credentials were valid, but the web console is for Admin and Technician accounts only. */
export class ConsoleAccessError extends Error {
  constructor() {
    super('This console is for administrators and technicians. Staff accounts sign in on the mobile app.')
    this.name = 'ConsoleAccessError'
  }
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

/** Human label of a role for headers and menus. */
export function roleLabel(role: Account['role']): string {
  switch (role) {
    case 'ADMIN':
      return 'administrator'
    case 'TECHNICIAN':
      return 'technician'
    default:
      return 'staff'
  }
}
