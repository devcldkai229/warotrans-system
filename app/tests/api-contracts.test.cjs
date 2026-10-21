const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function modules(apiFetch) {
  return createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError } });
}

for (const [name, file, operation] of [
  ['create request', 'transportApi', api => api.createTransportRequest({ warehouseId: 'wh', mapVersionId: 'map', workflowId: 'selected', details: [] })],
  ['queue request', 'transportApi', api => api.queueTransportRequest('missing')],
  ['start job', 'executionApi', api => api.startJob('job')],
  ['confirm handover', 'executionApi', api => api.confirmHandover({ jobStepId: 'step', containerId: 'container' })],
  ['missing job', 'executionApi', api => api.getJobDetail('missing')],
]) {
  test(`${name} propagates BE rejection without creating local success`, async () => {
    const load = modules(async () => { throw new ApiError(409, 'rejected', 'Backend rejected this action'); });
    await assert.rejects(() => operation(load(`src/shared/api/${file}.ts`)), /Backend rejected/);
  });
}
test('empty fleet and warehouse results remain empty and preserve BE totals', async () => {
  const load = modules(async () => ({ items: [], total: 0 }));
  for (const result of [await load('src/shared/api/fleetApi.ts').listRobots(),
    await load('src/shared/api/warehouseApi.ts').listContainers({ warehouseId: 'empty' }),
    await load('src/shared/api/warehouseApi.ts').listStorageLocations({ warehouseId: 'empty' }),
    await load('src/shared/api/transportApi.ts').listTransportRequests()]) assert.deepEqual(plain(result), { items: [], total: 0 });
});
test('unsupported BE commands cannot send a request or report success', async () => {
  let requests = 0;
  const load = modules(async () => { requests++; throw new Error('Unexpected network call'); });
  for (const action of [() => load('src/shared/api/warehouseApi.ts').createContainer({ productId: 'product' }),
    () => load('src/shared/api/executionApi.ts').acceptHumanTask('task'),
    () => load('src/shared/api/executionApi.ts').reportTaskProblem('task', { reason: 'DAMAGE' })]) {
    await assert.rejects(async () => action(), error => error.status === 501 && error.code === 'backend_capability_unavailable');
  }
  assert.equal(requests, 0);
});
test('transport submits the chosen workflow and preserves storage locations and levels', async () => {
  let request;
  const load = modules(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { id: 'created' }; });
  const detail = { sequenceNo: 1, containerId: 'container', sourceStorageLocationId: 'source-location', sourceEndpointId: 'source', sourceLevelNo: 2,
    destinationStorageLocationId: 'destination-location', destinationEndpointId: 'destination', destinationLevelNo: 3, productName: 'Display Only' };
  await load('src/shared/api/transportApi.ts').createTransportRequest({ warehouseId: 'warehouse', mapVersionId: 'map', workflowId: 'chosen-inbound', workflowInputs: { fragile: false }, details: [detail] });
  assert.equal(request.body.workflowId, 'chosen-inbound');
  assert.equal(request.body.details[0].sourceLevelNo, 2);
  assert.equal(request.body.details[0].destinationStorageLocationId, 'destination-location');
  assert.equal(request.body.details[0].destinationLevelNo, 3);
  assert.equal('productName' in request.body.details[0], false);
  assert.deepEqual(request.body.workflowInputs, { fragile: false });
});
test('job details cannot silently substitute another ID', async () => {
  const load = modules(async () => ({ id: 'another-job' }));
  await assert.rejects(() => load('src/shared/api/executionApi.ts').getJobDetail('requested-job'), error => error.code === 'job_identity_mismatch');
});
test('job presentation uses real task ownership and completed step counts', () => {
  const map = modules(async () => {}).call(null, 'src/features/jobs/jobData.ts').mapJobDetailToAppJobItem;
  const job = { id: 'job', jobNo: 'JOB-1', status: 'RUNNING', createdAt: '2026-10-20', containers: [], contextValues: { assignedStaffId: 'operator-a' },
    tasks: [{ sequenceNo: 1, steps: [{ sequenceNo: 1, status: 'COMPLETED', stepType: 'CHECK' }, { sequenceNo: 2, status: 'WAITING', stepType: 'HUMAN_INTERACTION' }] }] };
  assert.equal(map(job, 'operator-a').isMine, true);
  assert.equal(map(job, 'operator-b').isMine, false);
  assert.equal(map(job, 'operator-a').progressPercent, 50);
  assert.equal(map({ ...job, status: 'ASSIGNED', contextValues: {} }).hasWaitingHandover, false);
  assert.equal(map(job).battery, '—');
});
