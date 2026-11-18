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
  // acceptHumanTask is gone: /tasks/{id}/accept never existed; claiming is job-steps/{id}/claim (staff-parity tests).
  for (const action of [() => load('src/shared/api/warehouseApi.ts').createContainer({ productId: 'product' })]) {
    await assert.rejects(async () => action(), error => error.status === 501 && error.code === 'backend_capability_unavailable');
  }
  assert.equal(requests, 0);
});
test('a staff incident becomes an IssueReport on the operations API', async () => {
  let request;
  const load = modules(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { id: 'issue', code: 'ISS-1', status: 'OPEN' }; });
  const issue = await load('src/shared/api/executionApi.ts').reportTaskProblem(undefined, { reason: 'CONTAINER_DAMAGED', note: 'torn' }, 'step-1', { jobId: 'job-1' });
  assert.equal(issue.code, 'ISS-1');
  assert.match(request.url, /\/api\/operations\/issues$/);
  assert.deepEqual(plain({ type: request.body.issueType, severity: request.body.severity, jobId: request.body.jobId, step: request.body.jobStepId }),
    { type: 'CONTAINER', severity: 'HIGH', jobId: 'job-1', step: 'step-1' });
  assert.match(request.body.description, /torn/);
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
  assert.equal('outboundFifo' in request.body, false);
  assert.deepEqual(request.body.workflowInputs, { fragile: false });

  await load('src/shared/api/transportApi.ts').createTransportRequest({
    warehouseId: 'warehouse',
    mapVersionId: 'map',
    workflowId: 'outbound-retrieval',
    outboundFifo: { productId: 'product-1', containerCount: 1 },
    details: [detail],
  });
  assert.deepEqual(request.body.outboundFifo, { productId: 'product-1', containerCount: 1 });
});

test('previewOutboundPick verifies FIFO preview items and rejects malformed responses', async () => {
  let captured = null;
  const validItem = {
    barcode: 'CTN-001',
    sourceStorageLocationCode: 'A1-01',
    admittedAt: '2026-11-18T08:00:00Z',
    detail: {
      sequenceNo: 1,
      containerId: 'c1',
      sourceStorageLocationId: 'loc-1',
      sourceEndpointId: 'ep-rack',
      sourceLevelNo: 1,
      destinationStorageLocationId: null,
      destinationEndpointId: 'ep-outbound',
      destinationLevelNo: null,
    },
  };
  const validResponse = { requestedCount: 1, isComplete: true, items: [validItem] };
  const api = modules(async (url, init) => { captured = { url, init }; return validResponse; })('src/shared/api/transportApi.ts');
  const controller = new AbortController();
  const reqBody = { warehouseId: 'wh-1', mapVersionId: 'map-1', productId: 'prod-1', containerCount: 1, destinationEndpointId: 'ep-outbound' };
  const result = await api.previewOutboundPick(reqBody, controller.signal);
  assert.equal(captured.url, '/api/transportation/transport-requests/outbound-pick-preview');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.signal, controller.signal);
  assert.deepEqual(JSON.parse(captured.init.body), reqBody);
  assert.deepEqual(plain(result), validResponse);

  for (const bad of [
    null,
    { requestedCount: 2, isComplete: false, items: [] },
    { requestedCount: 1, isComplete: true, items: [] },
    { requestedCount: 1, isComplete: true, items: [{ ...validItem, detail: { ...validItem.detail, destinationEndpointId: 'other-gate' } }] },
    { requestedCount: 1, isComplete: true, items: [{ ...validItem, barcode: ' ' }] },
  ]) {
    const badApi = modules(async () => bad)('src/shared/api/transportApi.ts');
    await assert.rejects(() => badApi.previewOutboundPick(reqBody), error => error.status === 502 && error.code === 'outbound_pick_preview_invalid');
  }
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
