import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'

/**
 * Route guard. UX only: the backend enforces roles (AdminOnly / StaffOrAdmin). Every screen built so far is an
 * Admin screen, so a Staff account is sent back to login instead of seeing pages the API would reject.
 */
export function RequireAuth() {
  const { account } = useAuth()
  const location = useLocation()

  if (!account || account.role !== 'ADMIN') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
