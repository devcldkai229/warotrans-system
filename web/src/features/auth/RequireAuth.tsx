import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { mayUseConsole } from '@/shared/auth/permissions'
import { useAuth } from './authContext'

/**
 * Route guard. UX only: the backend enforces permissions on every request.
 * The web console is for Admins and Technicians (console.access); Staff accounts use the mobile app.
 * A temporary password must be changed before anything else opens.
 */
export function RequireAuth() {
  const { status, account, capabilities } = useAuth()
  const location = useLocation()

  // Wait for the session restore before deciding, otherwise a reload would always bounce through /login.
  if (status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center text-sm text-muted" role="status">
        Restoring session…
      </div>
    )
  }

  if (!account || !capabilities) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (capabilities.mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ from: location.pathname }} />
  }

  if (!mayUseConsole(capabilities)) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
