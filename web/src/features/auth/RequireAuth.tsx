import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'
import './auth.css'

/**
 * Route guard. UX only: the backend enforces roles (AdminOnly / StaffOrAdmin) on every request.
 * The web console is Admin-only; Staff accounts use the mobile app.
 */
export function RequireAuth() {
  const { status, account } = useAuth()
  const location = useLocation()

  // Wait for the session restore before deciding, otherwise a reload would always bounce through /login.
  if (status === 'loading') {
    return (
      <div className="auth-splash" role="status">
        Restoring session…
      </div>
    )
  }

  if (!account || account.role !== 'ADMIN') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
