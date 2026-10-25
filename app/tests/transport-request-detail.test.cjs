const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const loadApi = apiFetch => createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError } });
const { transportRequestProgress, transportRouteSummary } = createLoader()('src/features/transport/transportRequestData.ts');

test('request progress follows movement outcomes, including failed and cancelled lines', () => {
  const details = ['COMPLETED', 'FAILED', 'CANCELLED', 'IN_PROGRESS'].map(status => ({ status }));
  assert.deepEqual(plain(transportRequestProgress(details)), { completed: 1, total: 4, percent: 25 });
  assert.deepEqual(plain(transportRequestProgress([])), { completed: 0, total: 0, percent: 0 });
  assert.equal(transportRequestProgress([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]).percent, 100);
});

test('request routes retain multiple pickup/dropoff locations and actual IDs when labels are unavailable', () => {
  const detail = (source, destination) => ({ sourceEndpointCode: source, destinationEndpointCode: destination, sourceEndpointId: 'source-id', destinationEndpointId: 'destination-id' });
  const details = [detail('EP-A', 'EP-C'), detail('EP-B', 'EP-D'), detail('EP-A', 'EP-D')];
  assert.equal(transportRouteSummary(details, 'source'), 'EP-A (+1 stops)');
  assert.equal(transportRouteSummary(details, 'destination'), 'EP-C (+1 stops)');
  assert.equal(transportRouteSummary([detail(null, null)], 'source'), 'source-id');
});

test('related jobs use a request-filtered query and retain multiple jobs and BE totals', async () => {
  const calls = [];
  const jobs = { items: [{ id: 'job-a', jobNo: 'JOB-A' }, { id: 'job-b', jobNo: 'JOB-B' }], total: 2 };
  const load = loadApi(async url => { calls.push(url); return jobs; });
  const result = await load('src/shared/api/executionApi.ts').listJobSummaries({ transportRequestId: 'request-b', take: 200 });
  assert.deepEqual(plain(result), jobs);
  assert.equal(calls.length, 1);
  const query = new URL(calls[0], 'http://localhost').searchParams;
  assert.equal(query.get('transportRequestId'), 'request-b');
  assert.equal(query.get('take'), '200');
});

test('jobs errors propagate instead of looking like a request without jobs', async () => {
  const load = loadApi(async () => { throw new Error('Jobs unavailable'); });
  await assert.rejects(() => load('src/shared/api/executionApi.ts').listJobSummaries({ transportRequestId: 'request' }), /Jobs unavailable/);
});

test('request detail preserves all movements and cannot return another request identity', async () => {
  const response = { id: 'requested', status: 'PARTIALLY_COMPLETED', details: [{ id: 'movement-a', containerId: 'container-a', status: 'COMPLETED' }, { id: 'movement-b', containerId: 'container-b', status: 'IN_PROGRESS' }] };
  const api = loadApi(async () => response)('src/shared/api/transportApi.ts');
  assert.deepEqual(plain(await api.getTransportRequest('requested')), response);
  await assert.rejects(() => api.getTransportRequest('another-request'), error => error.code === 'request_identity_mismatch');
});

test('history lists transport requests without looking up a first job or depending on execution availability', async () => {
  const calls = [];
  const response = { items: [{ id: 'request', warehouseId: 'warehouse', workflowId: 'workflow', details: [] }], total: 1 };
  const load = loadApi(async url => {
    calls.push(url);
    if (url.startsWith('/api/transportation/transport-requests')) return response;
    if (url.startsWith('/api/workflow-execution/jobs')) throw new Error('History must not depend on a job lookup');
    return { items: [], total: 0 };
  });
  const result = await load('src/shared/api/transportApi.ts').listTransportRequests();
  assert.equal(result.items[0].id, 'request');
  assert.equal(calls.some(url => url.startsWith('/api/workflow-execution/jobs')), false);
});
