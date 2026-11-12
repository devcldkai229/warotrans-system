import { apiFetch, getAccessToken } from './client';

/** Operations/ListNotifications wire contract; read state belongs to the caller. */
export interface NotificationDto {
  id: string;
  type: string;
  kind: string;
  title: string;
  content: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  resolvedAt: string | null;
  route: string | null;
}

export interface NotificationInboxResponse {
  unreadCount: number;
  items: NotificationDto[];
}

export function listNotifications(signal?: AbortSignal) {
  // The API has no pagination cursor. Its count includes unread items outside this window.
  return apiFetch<NotificationInboxResponse>('/api/operations/notifications?take=100', { signal });
}

export function markNotificationRead(id: string, signal?: AbortSignal) {
  // Bind this person's write to its original token; never replay it as a later login after a 401.
  return apiFetch<void>(`/api/operations/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', signal }, getAccessToken());
}

export function markAllNotificationsRead(signal?: AbortSignal) {
  return apiFetch<void>('/api/operations/notifications/read-all', { method: 'POST', signal }, getAccessToken());
}
