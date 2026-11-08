const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-module.cjs')({ 'react-native': { Platform: { OS: 'web' } } });
const { parseNavigationUrl } = load('src/app/navigation/NavigationContext.tsx');
const { homeFleetOnMap } = load('src/features/home/homeFleet.ts');
const { jobActivityTime } = load('src/shared/realtime/jobActivity.ts');
const plain = x => JSON.parse(JSON.stringify(x));

test('deep links open the requested Jobs scope, preserving Job/request identity', () => {
  for (const [alias, scope] of [['jobs-my', 'mine'], ['jobs-global', 'global'], ['jobs-history', 'history']]) {
    assert.deepEqual(plain(parseNavigationUrl(`https://app.test/?screen=${alias}`)), { screen: 'jobs', params: { view: scope } });
  }
  assert.deepEqual(plain(parseNavigationUrl('https://app.test/?screen=job-detail&job=job-1')), { screen: 'job_detail', params: { jobId: 'job-1' } });
  assert.deepEqual(plain(parseNavigationUrl('https://app.test/?screen=transport-detail&requestId=request-1')), { screen: 'transport_detail', params: { requestId: 'request-1' } });
  assert.equal(parseNavigationUrl('https://app.test/?screen=unknown').screen, 'home');
});
test('workflow aliases preserve the intended workflow instead of substituting Inbound', () => {
  assert.equal(parseNavigationUrl('https://app.test/?screen=point-to-point').params.workflow, 'POINT_TO_POINT_TRANSPORT');
  assert.equal(parseNavigationUrl('https://app.test/?screen=replenishment').params.workflow, 'REPLENISHMENT');
});
test('Home roster is scoped to the current warehouse and map, retaining actual offline/disabled states', () => {
  const context = { warehouse: { id: 'wh' }, map: { id: 'map-new', warehouseId: 'wh' } };
  const base = { warehouseId: 'wh', currentMapVersionId: 'map-new', isEnabled: true, isOnline: true, status: 'AVAILABLE', batteryPercent: 75, linearVelocity: 0 };
  const fleet = [
    { ...base, code: 'LOCAL' },
    { ...base, code: 'OLD-MAP', currentMapVersionId: 'map-old' },
    { ...base, code: 'OTHER-WH', warehouseId: 'other' },
    { ...base, code: 'OFFLINE', isOnline: false, status: 'EXECUTING' },
    { ...base, code: 'DISABLED', isEnabled: false },
    { ...base, code: 'NOT-READY', status: 'OFFLINE' },
  ];
  const rows = homeFleetOnMap(fleet, context);
  assert.deepEqual(plain(rows.map(row => row.id)), ['LOCAL', 'OFFLINE', 'DISABLED', 'NOT-READY']);
  assert.equal(rows.filter(row => row.active).length, 2);
  assert.equal(rows.find(row => row.id === 'OFFLINE').statusLabel, 'Offline');
  assert.equal(rows.find(row => row.id === 'OFFLINE').lastReported, true);
  assert.equal(rows.find(row => row.id === 'DISABLED').statusLabel, 'Disabled · Online');
  assert.equal(rows.find(row => row.id === 'NOT-READY').statusLabel, 'Online · Not Ready');
  assert.equal(homeFleetOnMap(fleet, null).length, 0);
  assert.equal(homeFleetOnMap(fleet, { ...context, map: { ...context.map, warehouseId: 'different' } }).length, 0);
});
test('Home roster preserves last reported data but cannot claim current availability when refresh is unavailable or paused', () => {
  const context = { warehouse: { id: 'wh' }, map: { id: 'map-new', warehouseId: 'wh' } };
  const robot = { warehouseId: 'wh', currentMapVersionId: 'map-new', code: 'LOCAL', isEnabled: true, isOnline: true,
    status: 'AVAILABLE', batteryPercent: 70, linearVelocity: 0.25 };
  for (const mode of ['unavailable', 'paused']) {
    const row = homeFleetOnMap([robot], context, mode)[0];
    assert.equal(row.active, false);
    assert.equal(row.lastReported, true);
    assert.equal(row.statusLabel, 'Last Reported · Available');
    assert.equal(row.tone, 'neutral');
    assert.equal(row.speed, '0.25 m/s');
    assert.equal(row.battery, 70);
  }
  assert.equal(homeFleetOnMap([robot], context, 'polling')[0].active, true);
  assert.equal(homeFleetOnMap([robot], context, 'live')[0].lastReported, false);
  assert.equal(robot.isOnline, true);
});
test('Start delegates robot selection to BE and preserves the returned assignment', async () => {
  let command;
  class ApiError extends Error {}
  const apiLoad = require('./load-module.cjs')({ 'src/shared/api/client.ts': { ApiError, apiFetch: async (url, init) => {
    if (init?.method === 'POST') {
      command = { url, body: JSON.parse(init.body) };
      return { id: 'job', jobNo: 'JOB', mapVersionId: 'map-new', workflowId: 'workflow', status: 'RUNNING',
        assignedRobotId: 'server-chosen', tasks: [], containers: [], contextValues: {} };
    }
    if (url === '/api/fleet/robots') return { items: [{ id: 'server-chosen', code: 'RBT-SYSTEM' }], total: 1 };
    if (url.includes('/navigation/maps/')) return { id: 'map-new', warehouseId: 'wh', endpoints: [] };
    if (url.includes('/workflows/')) return { id: 'workflow', code: 'INBOUND_PUTAWAY', name: 'Inbound' };
    throw new Error('Unexpected read');
  } } });
  const updated = await apiLoad('src/shared/api/executionApi.ts').startJob('job');
  assert.deepEqual(command, { url: '/api/workflow-execution/jobs/job/start', body: { robotId: null } });
  assert.equal(updated.assignedRobotId, 'server-chosen');
  assert.equal(updated.contextValues.assignedRobotCode, 'RBT-SYSTEM');
  const mapped = apiLoad('src/features/jobs/jobData.ts').mapJobDetailToAppJobItem(updated);
  assert.equal(mapped.mapVersionId, 'map-new');
  assert.equal(mapped.robot, 'RBT-SYSTEM');
});
test('rehydrated Job activity reports actual dates and never invents Just now', () => {
  assert.match(jobActivityTime({ createdAt: '2026-10-16T04:28:00Z' }), /^Created /);
  assert.match(jobActivityTime({ startedAt: '2026-10-28T04:28:00Z' }), /^Started /);
  assert.match(jobActivityTime({ completedAt: '2026-10-28T05:28:00Z' }), /^Finished /);
  assert.equal(jobActivityTime({ createdAt: 'invalid' }), 'Time Unavailable');
});
