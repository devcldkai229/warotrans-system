import { apiFetch } from './client'
import type { NotificationInbox } from './contracts'

export function listNotifications(params?: { unreadOnly?: boolean; take?: number }) {
  const query = new URLSearchParams()
  if (params?.unreadOnly) query.set('unreadOnly', 'true')
  if (params?.take) query.set('take', String(params.take))
  const qs = query.toString()
  return apiFetch<NotificationInbox>(`/api/operations/notifications${qs ? `?${qs}` : ''}`)
}

export function markNotificationRead(id: string) {
  return apiFetch<void>(`/api/operations/notifications/${id}/read`, { method: 'POST' })
}

export function markAllNotificationsRead() {
  return apiFetch<void>('/api/operations/notifications/read-all', { method: 'POST' })
}
