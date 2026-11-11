import { apiFetch } from './client'
import type { AdminNotification, NotificationInbox } from './contracts'

export interface ListNotificationsParams {
  unreadOnly?: boolean
  type?: AdminNotification['type']
  kind?: string
  skip?: number
  take?: number
}

export function listNotifications(params?: ListNotificationsParams) {
  const query = new URLSearchParams()
  if (params?.unreadOnly) query.set('unreadOnly', 'true')
  if (params?.type) query.set('type', params.type)
  if (params?.kind) query.set('kind', params.kind)
  if (params?.skip) query.set('skip', String(params.skip))
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
