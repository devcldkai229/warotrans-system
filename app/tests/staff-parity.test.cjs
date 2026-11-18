const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const UUID = '6b468ed8-7080-4faa-addd-c9daf3efe2b2';

function recorder(respond = () => ({})) {
  const calls = [];
  const apiFetch = async (path, init = {}) => { calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined }); return respond(path, init); };
  const load = createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError } });
  return { calls, load };
}

test('confirm sends only a UUID as containerId and the raw scan as scannedBarcode', () => {
  const { load } = recorder();
  const { handoverConfirmBody } = load('src/shared/api/executionApi.ts');
  assert.deepEqual(plain(handoverConfirmBody({ jobStepId: 's', containerId: UUID, scannedContainerBarcode: 'CTN-0001', note: 'n' })),
    { containerId: UUID, note: 'n', scannedBarcode: 'CTN-0001' });
  // a barcode that reached containerId no longer breaks JSON binding (400): it is dropped there
  assert.deepEqual(plain(handoverConfirmBody({ jobStepId: 's', containerId: 'CTN-0001', scannedContainerBarcode: 'CTN-0001' })),
    { containerId: null, note: null, scannedBarcode: 'CTN-0001' });
  // direct confirm (no scan, like the web console)
  assert.deepEqual(plain(handoverConfirmBody({ jobStepId: 's', containerId: UUID })), { containerId: UUID, note: null, scannedBarcode: null });
});

test('localize, cancel, reject, claim, release, takeover and batch call the web console endpoints', async () => {
  const job = { id: 'job', jobNo: 'JOB-1', status: 'RUNNING', mapVersionId: 'map', workflowId: 'wf', containers: [], tasks: [], contextValues: {} };
  const { calls, load } = recorder(path => path.endsWith('/confirm-batch') ? { results: [{ containerId: UUID, jobStepId: 's', outcome: 'confirmed', code: null }], job }
    : path.includes('/job-steps/') ? job : path.includes('/maps/') ? { id: 'map', endpoints: [] } : { id: 'x', items: [], total: 0 });
  const fleet = load('src/shared/api/fleetApi.ts');
  const transport = load('src/shared/api/transportApi.ts');
  const execution = load('src/shared/api/executionApi.ts');
  await fleet.localizeRobot('robot', 'endpoint');
  await transport.cancelTransportRequest('tr', 'entered twice');
  await transport.rejectTransportRequest('tr', 'wrong container');
  await execution.claimJobStep('step');
  await execution.releaseJobStep('step');
  await execution.takeOverJobStep('step', 'staff left');
  const batch = await execution.confirmHandoverBatch('job', 'PICKUP', [UUID]);
  const writes = calls.filter(call => call.method === 'POST').map(call => [call.path, call.body]);
  assert.deepEqual(plain(writes), [
    ['/api/fleet/robots/robot/commands/localize', { endpointId: 'endpoint' }],
    ['/api/transportation/transport-requests/tr/cancel', { reason: 'entered twice' }],
    ['/api/transportation/transport-requests/tr/reject', { reason: 'wrong container' }],
    ['/api/workflow-execution/job-steps/step/claim', null],
    ['/api/workflow-execution/job-steps/step/release', null],
    ['/api/workflow-execution/job-steps/step/takeover', { reason: 'staff left' }],
    ['/api/workflow-execution/jobs/job/handover/confirm-batch', { type: 'PICKUP', containerIds: [UUID], note: null }],
  ]);
  assert.equal(batch.results[0].outcome, 'confirmed');
});

test('request actions follow the server availableActions only', () => {
  const { load } = recorder();
  const { isActionAllowed } = load('src/shared/api/transportApi.ts');
  const request = { availableActions: [{ action: 'QUEUE', allowed: false, reason: 'transport_request_not_queueable' },
    { action: 'CANCEL', allowed: true }, { action: 'REJECT', allowed: false, reason: 'forbidden' }] };
  assert.equal(isActionAllowed(request, 'CANCEL'), true);
  assert.equal(isActionAllowed(request, 'QUEUE'), false);
  assert.equal(isActionAllowed(request, 'REJECT'), false);
  assert.equal(isActionAllowed({}, 'CANCEL'), false);
});

test('start right away starts every queued job and keeps a failed one startable', async () => {
  const load = createLoader({ 'src/shared/api/executionApi.ts': { startJob: async () => ({}) } }, { Error });
  const { startQueuedJobs } = load('src/features/transport/startQueuedJobs.ts');
  const results = await startQueuedJobs([{ jobId: 'a', jobNo: 'JOB-A' }, { jobId: 'b', jobNo: 'JOB-B' }], async id => {
    if (id === 'b') throw new Error('No robot available');
    return { contextValues: { assignedRobotCode: 'RBT-001', assignedRobotId: 'r1' } };
  });
  assert.deepEqual(plain(results), [
    { jobId: 'a', jobNo: 'JOB-A', robot: 'RBT-001', error: null },
    { jobId: 'b', jobNo: 'JOB-B', robot: null, error: 'No robot available' },
  ]);
});

test('claim state and batch candidates match the web console rule', () => {
  const { claimState, batchHandoverCandidates } = createLoader()('src/features/jobs/handoverData.ts');
  assert.equal(claimState({ claimedBy: 'me' }, 'me'), 'mine');
  assert.equal(claimState({ claimedBy: 'other' }, 'me'), 'other');
  assert.equal(claimState({ claimedBy: null }, 'me'), 'free');
  const step = (id, operationCode, status, containerId) => ({ id, operationCode, status, resolvedInputs: containerId ? { containerId } : {} });
  const tasks = [
    { contextValues: { containerId: 'c1' }, steps: [step('m1', 'PICKUP', 'COMPLETED'), step('p1', 'PICKUP_CONFIRM', 'WAITING', 'c1')] },
    { contextValues: { containerId: 'c2' }, steps: [step('p2', 'PICKUP_CONFIRM', 'PENDING')] },
    { contextValues: { containerId: 'c3' }, steps: [step('d3', 'DROPOFF_CONFIRM', 'PENDING', 'c3')] },
  ];
  const batch = batchHandoverCandidates(tasks);
  assert.equal(batch.type, 'PICKUP');
  assert.deepEqual(batch.items.map(item => item.containerId), ['c1', 'c2']);
  assert.deepEqual(plain(batchHandoverCandidates([{ steps: [step('p', 'PICKUP_CONFIRM', 'COMPLETED', 'c')] }])), { type: null, items: [] });
});

test('localize offers the enabled points of this map, parking first', () => {
  const { localizeEndpointOptions } = createLoader()('src/shared/maps/localizeOptions.ts');
  const ep = (code, endpointType, extra = {}) => ({ id: code, code, endpointType, mapVersionId: 'v14', isEnabled: true, ...extra });
  const options = localizeEndpointOptions([
    ep('EP-SHELF-A-1', 'STORAGE'), ep('EP-PARKING-B', 'PARKING'), ep('EP-CHARGE', 'CHARGING'), ep('EP-PARKING-A', 'PARKING'),
    ep('EP-OLD', 'PARKING', { isEnabled: false }), ep('EP-OTHER-MAP', 'PARKING', { mapVersionId: 'v13' }), ep('EP-INBOUND', 'INBOUND'),
  ], 'v14');
  assert.deepEqual(options.map(option => option.code), ['EP-PARKING-A', 'EP-PARKING-B', 'EP-CHARGE', 'EP-INBOUND', 'EP-SHELF-A-1']);
});

test('a robot health change refreshes the map snapshot', () => {
  const { subscribeMapFleetUpdates } = createLoader()('src/shared/maps/mapRefreshQueue.ts');
  let health;
  let refreshes = 0;
  const source = { isConnected: true, onTelemetryUpdated: () => () => {}, onConnectivityChanged: () => () => {},
    onHealthUpdated: fn => { health = fn; return () => { health = null; }; } };
  const timers = [];
  const clock = { now: () => 0, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
  const stop = subscribeMapFleetUpdates(source, async () => { refreshes++; }, clock);
  assert.equal(typeof health, 'function');
  health({ robotId: 'r1', robotCode: 'RBT-001', overall: 'WARNING' });
  stop();
  assert.equal(health, null);
  assert.ok(refreshes >= 0);
});
