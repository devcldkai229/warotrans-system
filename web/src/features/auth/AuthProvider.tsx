import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Account } from '@/shared/api/contracts'
import { AuthContext, type AuthValue } from './authContext'
import { MOCK_ACCOUNT } from './mock'

const STORAGE_KEY = 'warotrans.mock-session'

// Mock only: keeps the signed-in account across reloads while previewing. Real auth keeps the JWT out of
// component state and out of localStorage; see the API client once the login endpoint exists.
function readStoredAccount(): Account | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Account) : null
  } catch {
    return null
  }
}

function writeStoredAccount(account: Account | null) {
  try {
    if (account) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(account))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode); the session then lasts until reload.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // VITE_MOCK_AUTO_LOGIN=true skips the login screen while developing against mock data.
  const [account, setAccount] = useState<Account | null>(
    () => readStoredAccount() ?? (import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true' ? MOCK_ACCOUNT : null),
  )

  const signIn = useCallback((next: Account) => {
    writeStoredAccount(next)
    setAccount(next)
  }, [])

  const signOut = useCallback(() => {
    writeStoredAccount(null)
    setAccount(null)
  }, [])

  const value = useMemo<AuthValue>(() => ({ account, signIn, signOut }), [account, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
