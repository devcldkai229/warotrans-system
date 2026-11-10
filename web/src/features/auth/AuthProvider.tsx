import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '@/shared/api/client'
import type { Account, Capabilities, Session } from '@/shared/api/contracts'
import { hasPermission, mayUseConsole, PERMISSIONS, type Permission } from '@/shared/auth/permissions'
import { changeOwnPassword, getCapabilities, login, logout } from './api'
import { AuthContext, ConsoleAccessError, type AuthStatus, type AuthValue } from './authContext'
import { MOCK_ACCOUNT } from './mock'

// VITE_MOCK_AUTO_LOGIN=true skips the login screen so the mock-data screens can be built without a running backend.
const MOCK_AUTO_LOGIN = import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true'

const MOCK_CAPABILITIES: Capabilities = {
  accountId: MOCK_ACCOUNT.id,
  role: 'ADMIN',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
  robotScope: { allRobots: true, robotIds: [] },
}

interface AuthState {
  status: AuthStatus
  account: Account | null
  capabilities: Capabilities | null
}

const ANONYMOUS: AuthState = { status: 'anonymous', account: null, capabilities: null }

/** Ends a session that may not use the console. UX only: the API enforces permissions on every request. */
async function rejectSession(): Promise<void> {
  try {
    await logout()
  } finally {
    setAccessToken(null)
  }
}

/**
 * Loads the capabilities of a fresh session. A temporary password is always let through (to the change-password
 * screen); otherwise the account needs console.access.
 */
async function admit(session: Session): Promise<AuthState> {
  setAccessToken(session.accessToken)
  const capabilities = await getCapabilities()
  if (!capabilities.mustChangePassword && !mayUseConsole(capabilities)) {
    await rejectSession()
    throw new ConsoleAccessError()
  }
  return { status: 'authenticated', account: session.account, capabilities }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    MOCK_AUTO_LOGIN
      ? { status: 'authenticated', account: MOCK_ACCOUNT, capabilities: MOCK_CAPABILITIES }
      : { status: 'loading', account: null, capabilities: null },
  )

  // Restore the session after a page load: the access token is memory-only, the refresh cookie survives.
  useEffect(() => {
    if (MOCK_AUTO_LOGIN) return
    let cancelled = false

    refreshSession()
      .then((session) => (session ? admit(session) : ANONYMOUS))
      .catch(() => ANONYMOUS)
      .then((next) => {
        if (!cancelled) setState(next)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => setState(ANONYMOUS))
    return () => setSessionExpiredHandler(null)
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const session = await login(username, password)
    setState(await admit(session))
  }, [])

  const signOut = useCallback(async () => {
    try {
      if (!MOCK_AUTO_LOGIN) await logout()
    } catch {
      // The local session ends even when the server cannot be reached; the refresh token then expires on its own.
    } finally {
      setAccessToken(null)
      setState(ANONYMOUS)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const session = await changeOwnPassword(currentPassword, newPassword)
    // The new token no longer carries the "must change password" mark; capabilities now list real permissions.
    setState(await admit(session))
  }, [])

  const can = useCallback((permission: Permission) => hasPermission(state.capabilities, permission), [state.capabilities])

  const value = useMemo<AuthValue>(
    () => ({ ...state, can, signIn, signOut, changePassword }),
    [state, can, signIn, signOut, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
