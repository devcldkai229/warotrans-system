const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const { createMapRefreshQueue, isMapTelemetryEvent, subscribeMapFleetUpdates } = createLoader()('src/shared/maps/mapRefreshQueue.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

function clock() {
  let time = Date.parse('2026-10-27T09:00:00Z'), id = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(callback, delay) { timers.set(++id, { at: time + delay, callback }); return id; },
    clearTimeout(timer) { timers.delete(timer); },
    advance(ms) {
      time += ms;
      for (const [timer, task] of timers) if (task.at <= time) { timers.delete(timer); task.callback(); }
    },
    get pending() { return timers.size; },
  };
}
function source() {
  const telemetry = new Set(), connectivity = new Set();
  return {
    isConnected: true,
    onTelemetryUpdated(callback) { telemetry.add(callback); return () => telemetry.delete(callback); },
    onConnectivityChanged(callback) { connectivity.add(callback); return () => connectivity.delete(callback); },
    emit(event) { for (const callback of telemetry) callback(event); },
    connection(event) { for (const callback of connectivity) callback(event); },
    get listeners() { return telemetry.size + connectivity.size; },
  };
}
const event = (time, robotId = 'robot-1') => ({robotId, robotCode: robotId, poseX: 1, poseY: 2, poseYaw: 0, lastTelemetryAt: new Date(time).toISOString()});

test('two robots and bursts refresh immediately, coalesce and keep the final update', async () => {
  const time = clock(); let requests = 0;
  const queue = createMapRefreshQueue(async () => { requests++; }, 250, time);
  queue.request(); await tick(); assert.equal(requests, 1);
  for (let i = 0; i < 100; i++) queue.request();
  assert.equal(time.pending, 1); time.advance(249); await tick(); assert.equal(requests, 1);
  time.advance(1); await tick(); assert.equal(requests, 2); assert.equal(time.pending, 0);
  queue.dispose();
});

test('events during a slow request cause one trailing request without overlap', async () => {
  const time = clock(); let requests = 0, finish;
  const queue = createMapRefreshQueue(() => { requests++; return new Promise(resolve => { finish = resolve; }); }, 250, time);
  queue.request(); await tick();
  for (let i = 0; i < 100; i++) queue.request();
  time.advance(500); await tick(); assert.equal(requests, 1);
  finish(); await tick(); assert.equal(requests, 2);
  queue.dispose(); finish(); await tick(); assert.equal(requests, 2);
});

test('failure is recoverable; unmount/background cancels pending refreshes', async () => {
  const time = clock(); let requests = 0;
  const queue = createMapRefreshQueue(async () => { requests++; if (requests === 1) throw new Error('offline'); }, 250, time);
  queue.request(); await tick(); time.advance(300); queue.request(); await tick(); assert.equal(requests, 2);
  queue.request(); assert.equal(time.pending, 1); queue.dispose();
  time.advance(1000); queue.request(); await tick(); assert.equal(requests, 2); assert.equal(time.pending, 0);
  const immediatelyDisposed = createMapRefreshQueue(async () => { requests++; }, 250, time);
  immediatelyDisposed.request(); immediatelyDisposed.dispose(); await tick(); assert.equal(requests, 2);
});

test('malformed/future telemetry is ignored and duplicate events do not flood the API', async () => {
  const time = clock(), hub = source(); let requests = 0;
  const dispose = subscribeMapFleetUpdates(hub, async () => { requests++; }, time);
  await tick(); time.advance(300);
  const message = event(time.now());
  hub.emit(message); await tick(); assert.equal(requests, 2);
  hub.emit(message); hub.emit({ ...message, poseX: NaN }); hub.emit(event(time.now() + 6000));
  time.advance(500); await tick(); assert.equal(requests, 2);
  hub.emit(event(time.now(), 'robot-2')); await tick(); assert.equal(requests, 3);
  assert.equal(isMapTelemetryEvent({ ...message, lastTelemetryAt: null }, time.now()), false);
  hub.connection({ robotId: 'robot-2', isOnline: false }); time.advance(250); await tick(); assert.equal(requests, 4);
  dispose(); assert.equal(hub.listeners, 0);
});

test('disconnect ignores late events; reconnect revalidates and uses the server map plus pose', async () => {
  const time = clock(), hub = source();
  let snapshot, requests = 0;
  let server = {items: [{id: 'robot-1', code: 'robot-1', currentMapVersionId: 'old-map', poseX: 1}], total: 1};
  const api = createLoader({ 'src/shared/api/client.ts': {apiFetch: async () => { requests++; return server; }} })('src/shared/api/fleetApi.ts');
  const refresh = async () => { snapshot = await api.listRobots(); };
  let dispose = subscribeMapFleetUpdates(hub, refresh, time); await tick();
  hub.isConnected = false; dispose();
  hub.emit(event(time.now())); time.advance(500); await tick(); assert.equal(requests, 1);
  server = {items: [{id: 'robot-1', code: 'robot-1', currentMapVersionId: 'new-map', poseX: 3}, {id: 'robot-2', currentMapVersionId: 'new-map', poseX: 4}], total: 2};
  hub.isConnected = true; dispose = subscribeMapFleetUpdates(hub, refresh, time); await tick();
  assert.equal(snapshot.items.length, 2); assert.equal(snapshot.items[0].currentMapVersionId, 'new-map'); assert.equal(snapshot.items[0].poseX, 3);
  // Even a delayed event carrying a wildly different pose can only fetch the latest server snapshot.
  hub.emit({ ...event(time.now() - 1000), poseX: 999 }); time.advance(250); await tick();
  assert.equal(snapshot.items[0].poseX, 3); assert.equal(snapshot.items[0].currentMapVersionId, 'new-map');
  dispose(); assert.equal(hub.listeners, 0);
});
