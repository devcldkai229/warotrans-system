import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/authContext';
import { ApiError, getAccessToken, getUserErrorMessage } from '../api/client';
import { listNotifications } from '../api/notificationsApi';
import { PERMISSIONS, sessionCan } from '../auth/permissions';
import { notificationInboxKey, saveNotificationRead, subscribeInboxUpdates } from './notificationInbox';
import { realtimeClient, toLiveNotification } from './realtimeClient';

export function useNotificationInbox() {
  const { session } = useAuth();
  const client = useQueryClient();
  const available = sessionCan(session, PERMISSIONS.notificationRead);
  const accountId = session?.id || '';
  const role = session?.role || '';
  const queryKey = notificationInboxKey(accountId, role);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const writes = useRef(new Set<AbortController>());
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listNotifications(signal),
    enabled: available && active,
    staleTime: 0,
    refetchInterval: available && active ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: (count, error) => count < 1 && !(error instanceof ApiError && [401, 403, 404].includes(error.status)),
  });
  const { refetch } = query;
  const read = useMutation({
    mutationFn: async (id: string | null) => {
      if (!available || !getAccessToken()) throw new Error('Sign in with notification access to save read status.');
      const controller = new AbortController();
      writes.current.add(controller);
      try { await saveNotificationRead(client, notificationInboxKey(accountId, role), id, controller.signal); }
      finally { writes.current.delete(controller); }
    },
    retry: false,
  });

  useEffect(() => {
    const lifecycle = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { lifecycle.remove(); };
  }, []);

  useEffect(() => {
    read.reset();
    const pending = writes.current;
    return () => { pending.forEach(controller => controller.abort()); pending.clear(); };
  }, [accountId, role, read.reset]);

  useEffect(() => {
    if (!available || !active) return;
    return subscribeInboxUpdates(realtimeClient, () => refetch({ cancelRefetch: false }));
  }, [accountId, role, available, active, refetch]);

  const refreshNotifications = useCallback(async () => {
    if (!available || !active) return;
    read.reset();
    await refetch({ cancelRefetch: false });
  }, [available, active, read.reset, refetch]);

  // Permission failures must not leave previously visible records on screen.
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const data = available && !denied ? query.data : undefined;
  return {
    notifications: data?.items.map(toLiveNotification) || [],
    unreadCount: data?.unreadCount || 0,
    notificationsAvailable: available,
    notificationsLoading: available && query.isPending,
    notificationsRefreshing: query.isFetching,
    notificationsError: query.error ? getUserErrorMessage(query.error, 'Could not load notifications. Try again.') : null,
    notificationReadError: read.error instanceof ApiError && read.error.status === 401
      ? 'Could not verify this read request. Refresh the inbox before trying again.'
      : read.error ? getUserErrorMessage(read.error, 'Could not save read status. Try again.') : null,
    isSavingNotification: read.isPending,
    refreshNotifications,
    markNotificationRead: async (id: string) => { await read.mutateAsync(id); },
    markAllNotificationsRead: async () => { await read.mutateAsync(null); },
  };
}

export type NotificationInboxState = ReturnType<typeof useNotificationInbox>;
