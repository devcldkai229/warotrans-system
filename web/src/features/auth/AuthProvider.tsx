import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '@/shared/api/client'
import type { Account } from '@/shared/api/contracts'
import { login, logout } from './api'
import { AuthContext, ConsoleAccessError, type AuthStatus, type AuthValue } from './authContext'
import { MOCK_ACCOUNT } from './mock'

// VITE_MOCK_AUTO_LOGIN=true skips the login screen so the mock-data screens can be built without a running backend.
const MOCK_AUTO_LOGIN = import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true'

interface AuthState {
  status: AuthStatus
  account: Account | null
}

const ANONYMOUS: AuthState = { status: 'anonymous', account: null }

/** Ends a session that belongs to a non-Admin account. UX only: the API enforces roles on every request. */
async function rejectNonAdmin(): Promise<void> {
  try {
    await logout()
  } finally {
    setAccessToken(null)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    MOCK_AUTO_LOGIN ? { status: 'authenticated', account: MOCK_ACCOUNT } : { status: 'loading', account: null },
  )

  // Restore the session after a page load: the access token is memory-only, the refresh cookie survives.
  useEffect(() => {
    if (MOCK_AUTO_LOGIN) return
    let cancelled = false

    refreshSession()
      .then(async (session) => {
        if (session && session.account.role !== 'ADMIN') {
          await rejectNonAdmin()
          return null
        }
        return session
      })
      .catch(() => null)
      .then((session) => {
        if (cancelled) return
        setState(session ? { status: 'authenticated', account: session.account } : ANONYMOUS)
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
    if (session.account.role !== 'ADMIN') {
      await rejectNonAdmin()
      throw new ConsoleAccessError()
    }
    setAccessToken(session.accessToken)
    setState({ status: 'authenticated', account: session.account })
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

  const value = useMemo<AuthValue>(() => ({ ...state, signIn, signOut }), [state, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
