import { createContext, useContext } from 'react'
import type { Account } from '@/shared/api/contracts'

export interface AuthValue {
  account: Account | null
  /** Mock sign-in. TODO(backend): replace with POST /api/identity/login (not implemented yet) and keep the JWT in the API client. */
  signIn: (account: Account) => void
  signOut: () => void
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
