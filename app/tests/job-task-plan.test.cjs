const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const { mapJobDetailToAppJobItem, jobTaskFocus, jobStepTitle } = createLoader()('src/features/jobs/jobData.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const step = (id, sequenceNo, status = 'PENDING', stepType = 'CHECK') => ({ id, sequenceNo, status, stepType, operationCode: 'ROBOT_READY' });
const task = (id, sequenceNo, steps, contextValues = {}) => ({ id, sequenceNo, steps, contextValues, status: 'PENDING', taskKey: 'LOAD_AT_STOP' });
const job = tasks => ({ id: 'job', jobNo: 'JOB-1', status: 'RUNNING', createdAt: '2026-10-23', containers: [], tasks });

test('task plan preserves separate runtime tasks at the same endpoint and orders their own steps', () => {
  const context = { stopEndpointCode: 'EP-1', stopAction: 'PICKUP', executionScope: 'PER_CONTAINER_AT_STOP' };
  const input = job([
    task('second-container', 3, [step('s3', 1)], { ...context, containerId: 'container-2' }),
    task('stop', 1, [step('s2', 2, 'COMPLETED', 'MOVE'), step('s1', 1, 'COMPLETED')], { ...context, executionScope: 'ONCE_PER_STOP', containerIds: ['container-1', 'container-2'] }),
    task('first-container', 2, [step('handover', 1, 'WAITING', 'HUMAN_INTERACTION')], { ...context, containerId: 'container-1' }),
  ]);
  const before = JSON.stringify(input);
  const mapped = mapJobDetailToAppJobItem(input);
  assert.deepEqual(plain(mapped.tasks.map(item => item.id)), ['stop', 'first-container', 'second-container']);
  assert.deepEqual(plain(mapped.tasks[0].steps.map(item => item.id)), ['s1', 's2']);
  assert.deepEqual(plain(mapped.tasks[0].containerCodes), ['container-1', 'container-2']);
  assert.deepEqual(plain(mapped.tasks[1].containerCodes), ['container-1']);
  assert.equal(mapped.tasks[1].steps[0].status, 'WAITING');
  assert.equal(mapped.tasks[0].status, 'PENDING');
  assert.equal(JSON.stringify(input), before);
});

test('task plan retains step errors, timestamps and all four step types without inventing progress', () => {
  const steps = [step('check', 1, 'COMPLETED'), step('move', 2, 'FAILED', 'MOVE'), step('human', 3, 'PENDING', 'HUMAN_INTERACTION'), step('wait', 4, 'PENDING', 'WAIT')];
  steps[1].errorMessage = 'Navigation timeout';
  steps[1].startedAt = '2026-10-23T01:00:00Z';
  const mapped = mapJobDetailToAppJobItem({ ...job([task('task', 1, steps)]), status: 'PAUSED' });
  assert.equal(mapped.status, 'PAUSED');
  assert.equal(mapped.progressPercent, 25);
  assert.deepEqual(plain(mapped.tasks[0].steps.map(item => item.stepType)), ['CHECK', 'MOVE', 'HUMAN_INTERACTION', 'WAIT']);
  assert.equal(jobTaskFocus(mapped.tasks[0]).errorMessage, 'Navigation timeout');
  assert.equal(jobTaskFocus(mapped.tasks[0]).startedAt, steps[1].startedAt);
  assert.equal(jobStepTitle({ ...steps[0], name: 'Kiểm tra robot' }), 'Kiểm tra robot');
  assert.equal(jobStepTitle(steps[0]), 'Robot Ready');
  assert.deepEqual(plain(mapJobDetailToAppJobItem(job([])).tasks), []);
});

test('hydration uses the current task endpoint for a check without a step target, and leaves missing locations empty', async () => {
  const raw = { ...job([{ ...task('stop', 1, [step('current-check', 1, 'EXECUTING'), { ...step('move', 2, 'PENDING', 'MOVE'), targetEndpointId: 'different-endpoint' }]), stopAction: 'DROPOFF', stopEndpointId: 'endpoint' }]), currentStepId: 'current-check', workflowId: 'workflow', mapVersionId: 'map' };
  const load = createLoader({
    'src/shared/api/client.ts': { apiFetch: async () => raw },
    'src/shared/api/navigationApi.ts': { getMapVersionDetail: async () => ({ id: 'map', endpoints: [{ id: 'endpoint', code: 'EP-RACK-A' }, { id: 'different-endpoint', code: 'EP-PARK' }] }) },
    'src/shared/api/workflowApi.ts': { getWorkflow: async () => ({ id: 'workflow', code: 'INBOUND_PUTAWAY', name: 'Inbound Putaway' }) },
    'src/shared/api/fleetApi.ts': { listRobots: async () => ({ items: [] }) },
  });
  const { getJobDetail } = load('src/shared/api/executionApi.ts');
  const hydrated = await getJobDetail('job');
  assert.equal(hydrated.contextValues.currentStop, 'EP-RACK-A');
  assert.equal(hydrated.tasks[0].steps[1].targetEndpointCode, 'EP-PARK');
  raw.tasks[0].stopEndpointId = undefined;
  raw.tasks[0].stopAction = undefined;
  assert.equal((await getJobDetail('job')).contextValues.currentStop, '');
});
