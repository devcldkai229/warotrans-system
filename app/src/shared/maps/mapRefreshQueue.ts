import type { RobotConnectivityEvent, RobotTelemetryEvent } from '../realtime/realtimeClient';

interface RefreshClock {
  now: () => number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

/** One request at a time; keep one trailing refresh when more events arrive. */
export function createMapRefreshQueue(refresh: () => Promise<unknown>, intervalMs = 250, clock: RefreshClock = {
  now: Date.now, setTimeout, clearTimeout,
}) {
  let disposed = false;
  let pending = false;
  let running = false;
  let lastStarted = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    if (disposed || running || !pending || timer !== undefined) return;
    const wait = Math.max(0, lastStarted + intervalMs - clock.now());
    if (wait > 0) {
      timer = clock.setTimeout(() => { timer = undefined; flush(); }, wait);
      return;
    }
    pending = false;
    running = true;
    lastStarted = clock.now();
    void Promise.resolve().then(() => { if (!disposed) return refresh(); }).catch(() => {
      // Query state owns the error; polling/reconnect can retry later.
    }).finally(() => {
      running = false;
      flush();
    });
  }

  return {
    request() { if (!disposed) { pending = true; flush(); } },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** Events invalidate server snapshots; their pose is never joined to an older map ID. */
export function isMapTelemetryEvent(event: RobotTelemetryEvent, now = Date.now()): boolean {
  const timestamp = typeof event?.lastTelemetryAt === 'string' ? Date.parse(event.lastTelemetryAt) : NaN;
  return typeof event?.robotId === 'string' && !!event.robotId
    && typeof event.robotCode === 'string' && !!event.robotCode
    && [event.poseX, event.poseY, event.poseYaw].every(Number.isFinite)
    && Number.isFinite(timestamp) && timestamp <= now + 5_000;
}

interface MapUpdateSource {
  readonly isConnected: boolean;
  onTelemetryUpdated: (callback: (event: RobotTelemetryEvent) => void) => () => void;
  onConnectivityChanged: (callback: (event: RobotConnectivityEvent) => void) => () => void;
}

export function subscribeMapFleetUpdates(source: MapUpdateSource, refresh: () => Promise<unknown>, clock?: RefreshClock) {
  const queue = createMapRefreshQueue(refresh, 250, clock);
  const timestamps = new Map<string, number>();
  const telemetry = source.onTelemetryUpdated(event => {
    if (!source.isConnected || !isMapTelemetryEvent(event, clock?.now())) return;
    const timestamp = Date.parse(event.lastTelemetryAt!);
    if (timestamps.get(event.robotId) === timestamp) return;
    timestamps.set(event.robotId, timestamp);
    queue.request();
  });
  const connectivity = source.onConnectivityChanged(event => {
    if (source.isConnected && typeof event?.robotId === 'string' && event.robotId
      && typeof event.isOnline === 'boolean') queue.request();
  });
  queue.request();
  return () => { telemetry(); connectivity(); queue.dispose(); };
}
