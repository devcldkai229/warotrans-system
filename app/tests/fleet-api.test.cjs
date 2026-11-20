const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const plain = value => JSON.parse(JSON.stringify(value));
function loadFleet(apiFetch, getAccessToken, capabilitiesOverride) {
  const client = { apiFetch, ApiError };
  if (getAccessToken) client.getAccessToken = getAccessToken;
  const mocks = { 'src/shared/api/client.ts': client };
  if (capabilitiesOverride) {
    mocks['src/shared/api/capabilities.ts'] = capabilitiesOverride;
  }
  return createLoader(mocks)('src/shared/api/fleetApi.ts');
}

test('online filtering reads all pages, preserves warehouse and abort signal, and returns a filtered total', async () => {
  const signal = new AbortController().signal;
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: String(index), isOnline: index === 100 }));
  const offsets = [];
  const api = loadFleet(async (path, init) => {
    const url = new URL(path, 'https://be.test');
    assert.equal(url.searchParams.has('isOnline'), false);
    assert.equal(url.searchParams.get('warehouseId'), 'warehouse');
    assert.equal(url.searchParams.get('take'), '100');
    assert.equal(init.signal, signal);
    const skip = Number(url.searchParams.get('skip'));
    offsets.push(skip);
    return { items: rows.slice(skip, skip + 100), total: rows.length };
  });
  const response = await api.listRobots({ warehouseId: 'warehouse', isOnline: true }, signal);
  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(plain(response), { items: [{ id: '100', isOnline: true }], total: 1 });
});
test('offline filtering returns only false values and does not treat unknown connectivity as offline', async () => {
  const api = loadFleet(async path => {
    assert.equal(new URL(path, 'https://be.test').searchParams.has('isOnline'), false);
    return { items: [{ id: 'off', isOnline: false }, { id: 'on', isOnline: true }, { id: 'unknown' }], total: 3 };
  });
  assert.deepEqual(plain(await api.listRobots({ isOnline: false })), { items: [{ id: 'off', isOnline: false }], total: 1 });
});
test('an incomplete page cannot silently turn into a filtered empty fleet', async () => {
  const api = loadFleet(async () => ({ items: [], total: 1 }));
  await assert.rejects(() => api.listRobots({ isOnline: true }), error => error.code === 'fleet_list_incomplete');
});
test('unfiltered reads retain the BE total and default route', async () => {
  const api = loadFleet(async path => {
    assert.equal(path, '/api/fleet/robots');
    return { items: [{ id: 'first' }], total: 103 };
  });
  assert.deepEqual(plain(await api.listRobots()), { items: [{ id: 'first' }], total: 103 });
});

test('getRobotStopState validates identity and rejects malformed responses', async () => {
  const controller = new AbortController();
  const stopState = {
    robotId: 'robot-1',
    state: 'STOPPED_VERIFIED',
    motionHeld: true,
    commandId: 'cmd-1',
    mode: 'PAUSE',
    commandStatus: 'COMPLETED',
    outcome: 'SUCCEEDED',
    errorCode: null,
    issuedAt: '2026-11-20T08:15:00Z',
    completedAt: '2026-11-20T08:15:02Z',
  };
  let captured = null;
  const api = loadFleet(async (path, init) => {
    captured = { path, init };
    return stopState;
  });
  const res = await api.getRobotStopState('robot-1', controller.signal);
  assert.equal(captured.path, '/api/fleet/robots/robot-1/stop-state');
  assert.equal(captured.init.signal, controller.signal);
  assert.deepEqual(plain(res), stopState);

  for (const invalid of [null, { ...stopState, robotId: 'other' }, { ...stopState, motionHeld: 'yes' }, { ...stopState, state: 123 }]) {
    const badApi = loadFleet(async () => invalid);
    await assert.rejects(() => badApi.getRobotStopState('robot-1'), error => error.status === 502 && error.code === 'stop_state_invalid');
  }
});

test('manual lease acquisition and teleop stay gated by default without calling backend', async () => {
  let networkCalls = 0;
  const gatedApi = loadFleet(async () => {
    networkCalls += 1;
    return {};
  }, () => 'tech-token');

  await assert.rejects(
    () => gatedApi.acquireManualLease('robot-1'),
    error => error.status === 501 && error.code === 'backend_capability_unavailable',
  );
  await assert.rejects(
    () => gatedApi.teleopRobot('robot-1', 0.2, 0),
    error => error.status === 501 && error.code === 'backend_capability_unavailable',
  );
  assert.equal(networkCalls, 0);
});

test('manual lease, teleop, stopRobot and resumeRobotMotion enforce caller token, finiteness and validation', async () => {
  const requests = [];
  const lease = {
    robotId: 'robot-1',
    active: true,
    holderId: 'tech-1',
    holderName: 'Tech One',
    until: '2026-11-20T09:00:30Z',
    heldByMe: true,
  };
  const stopState = {
    robotId: 'robot-1',
    state: 'REQUESTED',
    motionHeld: false,
    commandId: 'cmd-stop',
    mode: 'STOP',
    commandStatus: 'SENT',
    outcome: null,
    errorCode: null,
    issuedAt: '2026-11-20T09:00:00Z',
    completedAt: null,
  };
  let currentToken = 'tech-token';
  const api = loadFleet(
    async (path, init = {}, token) => {
      requests.push({
        path,
        method: init.method || 'GET',
        body: init.body ? JSON.parse(init.body) : undefined,
        token,
      });
      if (path.endsWith('/manual/lease') && init.method === 'DELETE') return null;
      if (path.endsWith('/manual/lease')) return lease;
      if (path.endsWith('/teleop')) return { robotId: 'robot-1', robotCode: 'RBT-001', linear: 0.2, angular: 0 };
      return stopState;
    },
    () => currentToken,
    { mobileCapabilities: { manualDriveTeleop: true }, requireMobileCapability: () => {} },
  );

  await api.getManualLease('robot-1');
  await api.acquireManualLease('robot-1', { takeover: true, reason: '  shift swap  ' });
  await api.teleopRobot('robot-1', 0.2, 0, true);
  await api.releaseManualLease('robot-1');
  await api.stopRobot('robot-1', 'STOP', '  obstacle  ');
  await api.resumeRobotMotion('robot-1');

  assert.deepEqual(plain(requests), [
    { path: '/api/fleet/robots/robot-1/manual/lease', method: 'GET' },
    { path: '/api/fleet/robots/robot-1/manual/lease', method: 'POST', body: { takeover: true, reason: 'shift swap' }, token: 'tech-token' },
    { path: '/api/fleet/robots/robot-1/teleop', method: 'POST', body: { linear: 0.2, angular: 0, assist: true }, token: 'tech-token' },
    { path: '/api/fleet/robots/robot-1/manual/lease', method: 'DELETE', token: 'tech-token' },
    { path: '/api/fleet/robots/robot-1/commands/stop', method: 'POST', body: { mode: 'STOP', reason: 'obstacle' }, token: 'tech-token' },
    { path: '/api/fleet/robots/robot-1/commands/resume', method: 'POST', token: 'tech-token' },
  ]);

  await assert.rejects(() => api.teleopRobot('robot-1', NaN, 0), error => error.code === 'teleop_invalid_velocity');
  await assert.rejects(() => api.teleopRobot('robot-1', 0.2, Infinity), error => error.code === 'teleop_invalid_velocity');

  currentToken = null;
  await assert.rejects(() => api.teleopRobot('robot-1', 0.2, 0), error => error.status === 401 && error.code === 'unauthenticated');

  const badLeaseApi = loadFleet(async () => ({ robotId: 'other-robot', active: true, heldByMe: true }));
  await assert.rejects(() => badLeaseApi.getManualLease('robot-1'), error => error.status === 502 && error.code === 'manual_lease_invalid');
});
