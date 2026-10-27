const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const { staffInputDefaults } = createLoader()('src/features/transport/dispatchData.ts');

test('repeat restores only declared staff inputs and preserves false and zero', () => {
  const fields = ['count', 'fragile', 'note', 'empty'].map(key => ({ key }));
  assert.deepEqual(JSON.parse(JSON.stringify(staffInputDefaults(fields,
    { count: 0, fragile: false, note: 'Deliver', empty: null, admin: 'private', object: {} }))),
    { count: '0', fragile: 'false', note: 'Deliver' });
});

test('queue failure retains the submitted request so retry does not create a duplicate', async () => {
  const calls = [];
  const load = createLoader({ 'src/shared/api/transportApi.ts': {
    createTransportRequest: async body => { calls.push(['create', body]); return { id: 'existing', status: 'SUBMITTED' }; },
    queueTransportRequest: async id => { calls.push(['queue', id]); throw new Error('No robot available'); },
  } }, { Error });
  const result = await load('src/features/transport/dispatchSubmission.ts').submitDispatch({ details: [] }, true);
  assert.equal(result.created.id, 'existing');
  assert.equal(result.queued, null);
  assert.equal(result.queueError, 'No robot available');
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], 'existing');
});

test('submission errors propagate and never queue an uncreated request', async () => {
  let queued = false;
  const load = createLoader({ 'src/shared/api/transportApi.ts': {
    createTransportRequest: async () => { throw new Error('Invalid container'); },
    queueTransportRequest: async () => { queued = true; },
  } });
  await assert.rejects(() => load('src/features/transport/dispatchSubmission.ts').submitDispatch({}, true), /Invalid container/);
  assert.equal(queued, false);
});

test('submit and queue remain separate actions and preserve the backend allocation', async () => {
  let calls = 0;
  const load = createLoader({ 'src/shared/api/transportApi.ts': {
    createTransportRequest: async () => ({ id: 'request' }),
    queueTransportRequest: async id => { calls++; return { transportRequestId: id, jobs: [{ jobId: 'one-job-for-ten-containers' }] }; },
  } });
  const { submitDispatch } = load('src/features/transport/dispatchSubmission.ts');
  assert.equal((await submitDispatch({}, false)).queued, null);
  assert.equal(calls, 0);
  const result = await submitDispatch({}, true);
  assert.equal(result.queued.jobs.length, 1);
  assert.equal(result.queueError, null);
});
