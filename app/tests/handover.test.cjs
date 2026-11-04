const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const { humanConfirmation, handoverStatus } = createLoader()('src/features/jobs/handoverData.ts');
const confirmedStep = (source, actor = {}) => ({
  id: 'handover-1', stepType: 'HUMAN_INTERACTION', operationCode: 'PICKUP_CONFIRM', status: 'COMPLETED',
  outputValues: { confirmed: true, confirmationSource: source, confirmedAt: '2026-10-27T05:00:00Z', ...actor },
});

test('robot button confirmation keeps the robot actor and never invents a staff identity', () => {
  const step = confirmedStep('ROBOT_BUTTON', { confirmedBy: null, confirmedByRobotId: 'robot-1' });
  assert.equal(humanConfirmation(step).confirmedBy, null);
  assert.equal(humanConfirmation(step).confirmedByRobotId, 'robot-1');
  assert.equal(handoverStatus(step, 'RUNNING').canConfirm, false);
  assert.equal(handoverStatus(step, 'RUNNING').message, 'Handover Confirmed On Robot');
  assert.equal(handoverStatus(step, 'COMPLETED').completed, true);
});

test('app confirmation reads STAFF_APP output and unknown or pending outputs do not claim a confirmation', () => {
  const step = confirmedStep('STAFF_APP', { confirmedBy: 'staff-1', confirmedByRobotId: null });
  assert.equal(humanConfirmation(step).confirmedBy, 'staff-1');
  assert.equal(humanConfirmation(step).confirmedByRobotId, null);
  assert.equal(handoverStatus(step, 'RUNNING').message, 'Handover Confirmed In App');
  assert.equal(humanConfirmation(confirmedStep('MOBILE_APP')), null);
  assert.equal(humanConfirmation({ ...step, status: 'WAITING' }), null);
  assert.equal(humanConfirmation({ ...step, outputValues: { ...step.outputValues, confirmed: false } }), null);
});

test('a pinned completed handover stays read only while the job waits at its next handover', () => {
  const pinned = confirmedStep('ROBOT_BUTTON');
  const next = { id: 'handover-2', stepType: 'HUMAN_INTERACTION', operationCode: 'DROPOFF_CONFIRM', status: 'WAITING' };
  assert.equal(handoverStatus(pinned, 'RUNNING').canConfirm, false);
  assert.equal(handoverStatus(next, 'RUNNING').canConfirm, true);
  for (const status of ['PAUSED', 'REASSIGNING', 'FAILED', 'CANCELLED', 'COMPLETED']) {
    assert.equal(handoverStatus(next, status).canConfirm, false);
  }
  assert.equal(handoverStatus({ ...next, status: 'CANCELLED' }, 'RUNNING').canConfirm, false);
  assert.equal(handoverStatus({ ...next, operationCode: 'REPORT_ISSUE' }, 'RUNNING').canConfirm, false);
  assert.equal(handoverStatus(undefined, 'RUNNING').canConfirm, false);
});

function loadApi(apiFetch) {
  return createLoader({
    'src/shared/api/client.ts': { apiFetch },
    'src/shared/api/navigationApi.ts': { getMapVersionDetail: async () => ({ id: 'map', endpoints: [] }) },
    'src/shared/api/workflowApi.ts': { getWorkflow: async () => ({ id: 'workflow' }) },
    'src/shared/api/fleetApi.ts': { listRobots: async () => ({ items: [] }) },
  })('src/shared/api/executionApi.ts');
}
const rawJob = () => ({ id: 'job', workflowId: 'workflow', mapVersionId: 'map', containers: [], tasks: [{ id: 'task', steps: [confirmedStep('ROBOT_BUTTON')] }] });

test('confirmation posts only container and note; authenticated actor and source belong to BE', async () => {
  let request;
  const api = loadApi(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return rawJob(); });
  const result = await api.confirmHandover({ jobStepId: 'step', containerId: 'container', note: 'Loaded',
    confirmedBy: 'fake-staff', confirmationSource: 'ROBOT_BUTTON', confirmedByRobotId: 'fake-robot' });
  assert.equal(request.url, '/api/workflow-execution/job-steps/step/confirm');
  assert.deepEqual(request.body, { containerId: 'container', note: 'Loaded' });
  assert.equal(result.tasks[0].steps[0].outputValues.confirmationSource, 'ROBOT_BUTTON');
});

test('resume uses the registered job endpoint and keeps backend rejection authoritative', async () => {
  let request;
  const api = loadApi(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return rawJob(); });
  await api.resumeJob('job');
  assert.equal(request.url, '/api/workflow-execution/jobs/job/resume');
  assert.deepEqual(request.body, { robotId: null });
  await api.resumeJob('job', 'replacement-robot');
  assert.deepEqual(request.body, { robotId: 'replacement-robot' });
  await assert.rejects(() => loadApi(async () => { throw new Error('payload_recovery_required'); }).resumeJob('job'), /payload_recovery_required/);
});
