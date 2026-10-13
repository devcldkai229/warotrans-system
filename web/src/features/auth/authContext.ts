import { createContext, useContext } from 'react'
import type { Account } from '@/shared/api/contracts'

/** `loading` while the stored session is being restored after a page load. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthValue {
  status: AuthStatus
  account: Account | null
  /** Rejects with an `ApiError` (wrong credentials, locked account) or a `ConsoleAccessError` (not an Admin). */
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

/** The credentials were valid, but the web console is for Admin accounts only. */
export class ConsoleAccessError extends Error {
  constructor() {
    super('This console is for administrators. Staff accounts sign in on the mobile app.')
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
