import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'
import { adminRedirectFor, mayUseAdminPortal, mayUseTechPortal, techRedirectFor } from './portalAccess'

/**
 * Route guard of a portal. One portal per role: a Technician only in /tech, an Admin only in the admin console; an
 * account that opens the other portal lands on the same screen in its own. UX only, like RequireAuth: the backend
 * still enforces every permission. Must sit below RequireAuth, which waits for the session.
 */
export function RequirePortal({ portal }: { portal: 'admin' | 'tech' }) {
  const { account } = useAuth()
  const location = useLocation()
  if (!account) return null

  if (portal === 'admin' && !mayUseAdminPortal(account.role)) {
    return <Navigate to={techRedirectFor(location.pathname + location.search)} replace />
  }
  if (portal === 'tech' && !mayUseTechPortal(account.role)) {
    return <Navigate to={adminRedirectFor(location.pathname + location.search)} replace />
  }
  return <Outlet />
}
