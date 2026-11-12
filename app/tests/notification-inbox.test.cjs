const { test } = require('node:test');
const assert = require('node:assert/strict');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const snapshot = (isRead = false, unreadCount = isRead ? 0 : 1) => ({ unreadCount, items: [{
  id: 'notification', type: 'INFO', kind: 'JOB_STEP_WAITING_FOR_PERSON', title: 'Handover', content: 'Check the job.',
  entityType: 'JOB', entityId: 'job-1', createdAt: '2026-11-10T03:04:00Z', isRead, readAt: null, resolvedAt: null,
  route: '/monitor/jobs/job-1',
}] });
function modules(apiFetch) {
  return createLoader({ 'src/shared/api/client.ts': { apiFetch, getAccessToken: () => 'original-person-token' } });
}

test('inbox uses the real list/read/read-all contracts and retains the server-wide unread count', async () => {
  const requests = [];
  const controller = new AbortController();
  const load = modules(async (url, init, token) => { requests.push({ url, init, token }); return snapshot(false, 127); });
  const api = load('src/shared/api/notificationsApi.ts');
  const data = await api.listNotifications(controller.signal);
  assert.equal(data.unreadCount, 127);
  assert.equal(data.items.length, 1);
  await api.markNotificationRead('item/1', controller.signal);
  await api.markAllNotificationsRead(controller.signal);
  assert.deepEqual(requests.map(r => [r.url, r.init.method || 'GET']), [
    ['/api/operations/notifications?take=100', 'GET'],
    ['/api/operations/notifications/item%2F1/read', 'POST'],
    ['/api/operations/notifications/read-all', 'POST'],
  ]);
  assert.ok(requests.every(r => r.init.signal === controller.signal));
  assert.equal(requests[1].token, 'original-person-token');
  assert.equal(requests[2].token, 'original-person-token');
});

test('empty inbox stays empty; rejected reads do not turn into local success', async () => {
  const api = modules(async (url, init) => {
    if (init.method === 'POST') throw new Error('Server rejected read');
    return { unreadCount: 0, items: [] };
  })('src/shared/api/notificationsApi.ts');
  assert.deepEqual(plain(await api.listNotifications()), { unreadCount: 0, items: [] });
  await assert.rejects(() => api.markNotificationRead('item'), /Server rejected/);
  await assert.rejects(() => api.markAllNotificationsRead(), /Server rejected/);
});

test('REST presentation preserves real read state/time/entity instead of resetting received items to unread now', () => {
  const { toLiveNotification } = modules(async () => {})('src/shared/realtime/realtimeClient.ts');
  const item = toLiveNotification(snapshot(true).items[0]);
  assert.equal(item.isRead, true);
  assert.equal(item.createdAt, '2026-11-10T03:04:00Z');
  assert.notEqual(item.timeLabel, 'now');
  assert.equal(item.entityId, 'job-1');
  assert.equal(item.jobId, 'job-1');
  assert.equal(toLiveNotification({ ...snapshot().items[0], createdAt: '' }).timeLabel, 'Time Unavailable');
  assert.equal(toLiveNotification({ ...snapshot().items[0], kind: 'ISSUE_RESOLVED' }).category, 'SYSTEM');
});

test('notification links use verified entity IDs and current permissions; unknown/web-only routes are not guessed', () => {
  const { notificationDestination } = modules(async () => {})('src/shared/realtime/notificationInbox.ts');
  const session = { permissions: ['job.read', 'tr.read'] };
  const item = { entityType: 'JOB', entityId: 'job-1', route: 'https://unexpected.example/' };
  assert.deepEqual(plain(notificationDestination(item, session)), { screen: 'job_detail', params: { jobId: 'job-1' } });
  assert.deepEqual(plain(notificationDestination({ ...item, entityType: 'REQUEST', entityId: 'request-1' }, session)),
    { screen: 'transport_detail', params: { requestId: 'request-1' } });
  for (const entityType of ['ROBOT', 'ISSUE', 'CONTAINER', 'RECOVERY', 'NEW_KIND']) {
    assert.equal(notificationDestination({ ...item, entityType }, session), null);
  }
  assert.equal(notificationDestination(item, { permissions: [] }), null);
  assert.equal(notificationDestination({ ...item, entityId: null }, session), null);
});

test('read failure leaves flags/count unchanged and does not automatically replay the POST', async () => {
  let posts = 0;
  const { saveNotificationRead, notificationInboxKey } = modules(async () => { posts++; throw new Error('Offline'); })('src/shared/realtime/notificationInbox.ts');
  const client = new QueryClient();
  const key = notificationInboxKey('staff-a', 'Staff');
  client.setQueryData(key, snapshot(false, 127));
  try {
    await assert.rejects(() => saveNotificationRead(client, key, null, new AbortController().signal), /Offline/);
    assert.deepEqual(plain(client.getQueryData(key)), snapshot(false, 127));
    assert.equal(posts, 1);
  } finally { client.clear(); }
});

test('read-all rechecks REST, preserving a new unread item created after the server processed the command', async () => {
  let committed = false;
  const { saveNotificationRead, notificationInboxKey } = modules(async () => { committed = true; })('src/shared/realtime/notificationInbox.ts');
  const client = new QueryClient();
  const key = notificationInboxKey('staff-a', 'Staff');
  client.setQueryData(key, snapshot(false, 127));
  const after = { unreadCount: 1, items: [{ ...snapshot().items[0], id: 'new-unread' }, ...snapshot(true).items] };
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn: async () => {
    assert.equal(committed, true);
    return after;
  } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await saveNotificationRead(client, key, null, new AbortController().signal);
    assert.deepEqual(plain(client.getQueryData(key)), after);
  } finally { unsubscribe(); client.clear(); }
});

test('a late GET from before marking read cannot restore an unread flag', async () => {
  const { saveNotificationRead, notificationInboxKey } = modules(async () => {})('src/shared/realtime/notificationInbox.ts');
  const client = new QueryClient();
  const key = notificationInboxKey('staff-a', 'Staff');
  const old = deferred();
  let reads = 0, oldSignal;
  client.setQueryData(key, snapshot());
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn: ({ signal }) => {
    if (++reads === 1) { oldSignal = signal; return old.promise; }
    return Promise.resolve(snapshot(true));
  } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const pending = client.refetchQueries({ queryKey: key });
    await tick();
    await saveNotificationRead(client, key, 'notification', new AbortController().signal);
    assert.equal(oldSignal.aborted, true);
    old.resolve(snapshot());
    await pending;
    await tick();
    assert.deepEqual(plain(client.getQueryData(key)), snapshot(true));
  } finally { unsubscribe(); client.clear(); }
});

test('a failed refresh after a successful read keeps the previous snapshot and exposes the read error', async () => {
  let posts = 0;
  const { saveNotificationRead, notificationInboxKey } = modules(async () => { posts++; })('src/shared/realtime/notificationInbox.ts');
  const client = new QueryClient();
  const key = notificationInboxKey('staff-a', 'Staff');
  client.setQueryData(key, snapshot());
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, retry: false,
    queryFn: async () => { throw new Error('Inbox refresh unavailable'); } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await saveNotificationRead(client, key, null, new AbortController().signal);
    assert.equal(posts, 1);
    assert.deepEqual(plain(client.getQueryData(key)), snapshot());
    assert.equal(observer.getCurrentResult().isRefetchError, true);
    assert.match(observer.getCurrentResult().error.message, /Inbox refresh unavailable/);
  } finally { unsubscribe(); client.clear(); }
});

test('an old account write finishing after logout cannot recreate its cache or change the next account', async () => {
  const post = deferred();
  const { saveNotificationRead, notificationInboxKey } = modules(() => post.promise)('src/shared/realtime/notificationInbox.ts');
  const client = new QueryClient();
  const a = notificationInboxKey('staff-a', 'Staff');
  const b = notificationInboxKey('staff-b', 'Staff');
  const controller = new AbortController();
  client.setQueryData(a, snapshot());
  const pending = saveNotificationRead(client, a, null, controller.signal);
  controller.abort();
  client.clear();
  client.setQueryData(b, snapshot(false, 4));
  try {
    post.resolve();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(client.getQueryData(a), undefined);
    assert.deepEqual(plain(client.getQueryData(b)), snapshot(false, 4));
    assert.notDeepEqual(plain(notificationInboxKey('staff-b', 'Technician')), plain(b));
  } finally { client.clear(); }
});

function source() {
  const notifications = new Set(), connections = new Set();
  return {
    onNotificationReceived: fn => { notifications.add(fn); return () => notifications.delete(fn); },
    onConnectionStateChange: fn => { connections.add(fn); return () => connections.delete(fn); },
    notify: () => notifications.forEach(fn => fn({ id: 'same-notification' })),
    reconnect: () => connections.forEach(fn => fn(true)),
    get listeners() { return notifications.size + connections.size; },
  };
}

test('duplicate events during a slow snapshot retain one trailing refresh without starting concurrent GETs', async () => {
  const { subscribeInboxUpdates } = modules(async () => {})('src/shared/realtime/notificationInbox.ts');
  const hub = source(), first = deferred(), second = deferred();
  let requests = 0;
  const dispose = subscribeInboxUpdates(hub, () => ++requests === 1 ? first.promise : second.promise);
  await tick();
  for (let i = 0; i < 20; i++) hub.notify();
  assert.equal(requests, 1);
  first.resolve();
  await tick();
  assert.equal(requests, 2);
  dispose();
  hub.notify(); hub.reconnect(); second.resolve();
  await tick();
  assert.equal(requests, 2);
  assert.equal(hub.listeners, 0);
});

test('reconnect retries an inbox refresh that failed while offline', async () => {
  const { subscribeInboxUpdates } = modules(async () => {})('src/shared/realtime/notificationInbox.ts');
  const hub = source(); let requests = 0;
  const dispose = subscribeInboxUpdates(hub, async () => { if (++requests === 1) throw new Error('Offline'); });
  await tick();
  hub.reconnect();
  await tick();
  assert.equal(requests, 2);
  dispose();
});
