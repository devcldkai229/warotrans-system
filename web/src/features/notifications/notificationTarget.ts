import type { AdminNotification } from '@/shared/api/contracts'
import type { Tone } from '@/shared/ui/statusTones'
import { pathsFor, type ConsolePaths } from '@/shared/routing/consolePaths'

export const TYPE_TONE: Record<AdminNotification['type'], Tone> = {
  ALERT: 'red',
  WARNING: 'amber',
  INFO: 'blue',
  ASSIGNMENT: 'blue',
  SYSTEM: 'grey',
}

/**
 * Where a notification leads: the route the server gave it (SY-04), else derived from what it is about. The fallback
 * mirrors the backend's NotificationRoutes, so an older notification without a stored route opens the same screen.
 * The bell and the Notifications page both use it, so a click lands in the same place from either.
 *
 * The route is then rewritten into the portal the screen is shown in (`paths.translate`): in the Technician portal a
 * notification about a transport request has no screen, so it leads nowhere instead of to a refused page.
 */
export function notificationTarget(
  notification: Pick<AdminNotification, 'route' | 'entityType' | 'entityId'>,
  paths: Pick<ConsolePaths, 'translate'> = pathsFor('admin'),
): string | null {
  const route = adminRoute(notification)
  return route ? paths.translate(route) : null
}

function adminRoute(notification: Pick<AdminNotification, 'route' | 'entityType' | 'entityId'>): string | null {
  if (notification.route) return notification.route
  const { entityType, entityId } = notification
  if (!entityId) return null
  switch (entityType) {
    case 'JOB':
      return `/monitor/jobs/${entityId}`
    case 'ISSUE':
      return `/operations/issues/${entityId}`
    case 'REQUEST':
      return `/monitor/requests?requestId=${entityId}`
    case 'ROBOT':
      return `/monitor/fleet?robotId=${entityId}`
    default:
      return null
  }
}
