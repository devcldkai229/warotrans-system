import type { QueryClient } from '@tanstack/react-query';
import { markAllNotificationsRead, markNotificationRead } from '../api/notificationsApi';
import { PERMISSIONS, sessionCan } from '../auth/permissions';
import type { UserSession } from '../types/contracts';
import type { LiveNotificationEvent } from './realtimeClient';

export const notificationInboxKey = (accountId: string, role: string) => ['notification-inbox', accountId, role] as const;

function assertActive(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('The notification request was cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** A failed POST leaves the cached snapshot unchanged. Only a new server read changes badges/read state. */
export async function saveNotificationRead(
  client: QueryClient,
  queryKey: ReturnType<typeof notificationInboxKey>,
  id: string | null,
  signal: AbortSignal,
) {
  await (id === null ? markAllNotificationsRead(signal) : markNotificationRead(id, signal));
  assertActive(signal);
  // A GET started before this write must not restore an old unread flag.
  await client.cancelQueries({ queryKey, exact: true });
  assertActive(signal);
  await client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
}

interface InboxUpdateSource {
  onNotificationReceived: (callback: (event: LiveNotificationEvent) => void) => () => void;
  onConnectionStateChange: (callback: (connected: boolean) => void) => () => void;
}

/** Events are invalidations, not inbox records. Keep one trailing refresh during a slow GET. */
export function subscribeInboxUpdates(source: InboxUpdateSource, refresh: () => Promise<unknown>) {
  let disposed = false;
  let running = false;
  let pending = false;
  function request() {
    if (disposed) return;
    if (running) { pending = true; return; }
    running = true;
    void Promise.resolve().then(() => { if (!disposed) return refresh(); }).catch(() => {
      // The query exposes the error; polling, reconnect and Retry can recover.
    }).finally(() => {
      running = false;
      if (pending && !disposed) { pending = false; request(); }
    });
  }
  const notification = source.onNotificationReceived(request);
  const connection = source.onConnectionStateChange(connected => { if (connected) request(); });
  request();
  return () => { disposed = true; notification(); connection(); };
}

/** Only navigate to native screens with a verified entity contract and current read permission. */
export function notificationDestination(item: LiveNotificationEvent, session: UserSession | null) {
  if (!item.entityId) return null;
  if (item.entityType === 'JOB' && sessionCan(session, PERMISSIONS.jobRead)) {
    return { screen: 'job_detail' as const, params: { jobId: item.entityId } };
  }
  if (item.entityType === 'REQUEST' && sessionCan(session, PERMISSIONS.transportRead)) {
    return { screen: 'transport_detail' as const, params: { requestId: item.entityId } };
  }
  return null;
}
