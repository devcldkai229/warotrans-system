const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
const {
  humanConfirmation, handoverStatus, handoverStopOwnerState, handoverStopPhase, isBlockingHandoverIssue,
  mergeMyJobIdsWithStops, recordStopScan, stopScanProgress,
} = createLoader()('src/features/jobs/handoverData.ts');
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
    'src/shared/api/client.ts': { apiFetch, ApiError: class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }, getAccessToken: () => 'staff-token' },
    'src/shared/api/navigationApi.ts': { getMapVersionDetail: async () => ({ id: 'map', endpoints: [] }) },
    'src/shared/api/workflowApi.ts': { getWorkflow: async () => ({ id: 'workflow' }) },
    'src/shared/api/fleetApi.ts': { listRobots: async () => ({ items: [] }) },
  })('src/shared/api/executionApi.ts');
}
const rawJob = () => ({ id: 'job', workflowId: 'workflow', mapVersionId: 'map', containers: [], tasks: [{ id: 'task', steps: [confirmedStep('ROBOT_BUTTON')] }] });

test('confirmation posts only container and note; authenticated actor and source belong to BE', async () => {
  let request;
  const api = loadApi(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return rawJob(); });
  const container = '6b468ed8-7080-4faa-addd-c9daf3efe2b2';
  const result = await api.confirmHandover({ jobStepId: 'step', containerId: container, note: 'Loaded',
    confirmedBy: 'fake-staff', confirmationSource: 'ROBOT_BUTTON', confirmedByRobotId: 'fake-robot' });
  assert.equal(request.url, '/api/workflow-execution/job-steps/step/confirm');
  assert.deepEqual(request.body, { containerId: container, note: 'Loaded', scannedBarcode: null });
  assert.equal(result.tasks[0].steps[0].outputValues.confirmationSource, 'ROBOT_BUTTON');
});

test('resume uses the registered job endpoint and keeps backend rejection authoritative', async () => {
  let request;
  const api = loadApi(async (url, init, token) => { request = { url, body: JSON.parse(init.body), token }; return rawJob(); });
  await api.resumeJob('job');
  assert.equal(request.url, '/api/workflow-execution/jobs/job/resume');
  assert.equal(request.token, 'staff-token');
  assert.deepEqual(request.body, { robotId: null });
  await api.resumeJob('job', 'replacement-robot');
  assert.deepEqual(request.body, { robotId: 'replacement-robot' });
  await assert.rejects(() => loadApi(async () => { throw new Error('payload_recovery_required'); }).resumeJob('job'), /payload_recovery_required/);
});

test('pauseJob requires a trimmed reason up to 500 chars, binds caller token and reads availableActions', async () => {
  let request;
  const pausedJob = {
    ...rawJob(),
    status: 'PAUSED',
    failureCode: 'operator_paused',
    failureMessage: 'Pallet blocking aisle',
    operatorPause: { pausedBy: 'staff-a', pausedAt: '2026-11-20T08:15:00Z', reason: 'Pallet blocking aisle' },
    availableActions: [
      { action: 'START', allowed: false, reason: 'job_not_startable' },
      { action: 'PAUSE', allowed: false, reason: 'job_not_running' },
      { action: 'RESUME', allowed: false, reason: 'job_pause_owner_required' },
    ],
  };
  const api = loadApi(async (url, init, token) => { request = { url, init, token }; return pausedJob; });

  await assert.rejects(() => api.pauseJob('job', '   '), error => error.code === 'job_pause_reason_required');
  await assert.rejects(() => api.pauseJob('job', 'x'.repeat(501)), error => error.code === 'job_pause_reason_too_long');

  const result = await api.pauseJob('job', '  Pallet blocking aisle  ');
  assert.equal(request.url, '/api/workflow-execution/jobs/job/pause');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.token, 'staff-token');
  assert.deepEqual(JSON.parse(request.init.body), { reason: 'Pallet blocking aisle' });
  assert.equal(result.operatorPause.pausedBy, 'staff-a');
  assert.equal(api.isJobActionAllowed(result, 'RESUME', true), false);
  assert.equal(api.getJobAction(result, 'RESUME').reason, 'job_pause_owner_required');
  assert.equal(api.isJobActionAllowed(result, 'PAUSE', true), false);
  assert.equal(api.isJobActionAllowed({ id: 'legacy' }, 'START', true), true);
  assert.equal(api.isJobActionAllowed({ id: 'legacy' }, 'START', false), false);
});

const stopOffer = (overrides = {}) => ({
  id: 'stop-1',
  jobId: 'job-1',
  jobNo: 'JOB-100',
  mapVersionId: 'map-1',
  endpointId: 'ep-1',
  moveId: 'move-1',
  action: 'PICKUP',
  containers: [{ containerId: 'ctn-1', barcode: 'CTN-0001' }],
  offerOpensAt: '2026-11-20T08:00:10Z',
  robotReadyAt: null,
  claimedBy: null,
  claimedByName: null,
  beginDeadline: null,
  beganAt: null,
  version: 2,
  availableActions: [
    { action: 'CLAIM', allowed: true, reason: null },
    { action: 'BEGIN', allowed: false, reason: 'handover_stop_claim_required' },
    { action: 'RELEASE', allowed: false, reason: 'handover_stop_claim_required' },
  ],
  ...overrides,
});

test('listHandoverStops calls GET queue and rejects malformed payloads', async () => {
  const calls = [];
  const api = loadApi(async (url) => {
    calls.push(url);
    if (url.includes('mine=true')) return { items: [stopOffer({ claimedBy: 'staff-a' })] };
    return { items: [stopOffer()] };
  });

  const all = await api.listHandoverStops();
  assert.equal(calls[0], '/api/workflow-execution/handover-stops');
  assert.equal(all.length, 1);
  assert.equal(all[0].moveId, 'move-1');

  const mine = await api.listHandoverStops({ mine: true });
  assert.equal(calls[1], '/api/workflow-execution/handover-stops?mine=true');
  assert.equal(mine[0].claimedBy, 'staff-a');

  const badApi = loadApi(async () => ({ items: 'not-an-array' }));
  await assert.rejects(() => badApi.listHandoverStops(), error => error.status === 502 && error.code === 'handover_stops_invalid');
});

test('claimHandoverStop, beginHandoverStop and releaseHandoverStop send moveId+version, bind caller token, and validate responses', async () => {
  const requests = [];
  const api = loadApi(async (url, init, token) => {
    requests.push({ url, method: init.method, body: JSON.parse(init.body), token });
    return stopOffer({ version: JSON.parse(init.body).version + 1 });
  });

  const claimed = await api.claimHandoverStop('job-1', 'stop-1', 'move-1', 2);
  const begun = await api.beginHandoverStop('job-1', 'stop-1', 'move-1', 3);
  const released = await api.releaseHandoverStop('job-1', 'stop-1', 'move-1', 4);

  assert.deepEqual(requests, [
    { url: '/api/workflow-execution/jobs/job-1/handover-stops/stop-1/claim', method: 'POST', body: { moveId: 'move-1', version: 2 }, token: 'staff-token' },
    { url: '/api/workflow-execution/jobs/job-1/handover-stops/stop-1/begin', method: 'POST', body: { moveId: 'move-1', version: 3 }, token: 'staff-token' },
    { url: '/api/workflow-execution/jobs/job-1/handover-stops/stop-1/release', method: 'POST', body: { moveId: 'move-1', version: 4 }, token: 'staff-token' },
  ]);
  assert.equal(claimed.version, 3);
  assert.equal(begun.version, 4);
  assert.equal(released.version, 5);

  await assert.rejects(() => api.claimHandoverStop('job-1', 'stop-1', ' ', 1), error => error.code === 'handover_stop_invalid');
  await assert.rejects(() => api.beginHandoverStop('job-1', 'stop-1', 'move-1', -1), error => error.code === 'handover_stop_invalid');

  const mismatchedApi = loadApi(async () => stopOffer({ jobId: 'other-job' }));
  await assert.rejects(() => mismatchedApi.claimHandoverStop('job-1', 'stop-1', 'move-1', 2), error => error.status === 502 && error.code === 'handover_stop_invalid');

  const conflictApi = loadApi(async () => {
    const err = new Error('The handover stop changed.');
    err.status = 409;
    err.code = 'handover_stop_changed';
    throw err;
  });
  await assert.rejects(() => conflictApi.claimHandoverStop('job-1', 'stop-1', 'move-1', 2), error => error.code === 'handover_stop_changed');

  assert.equal(api.isHandoverStopActionAllowed(stopOffer(), 'CLAIM'), true);
  assert.equal(api.isHandoverStopActionAllowed(stopOffer(), 'BEGIN'), false);
  assert.equal(api.getHandoverStopAction(stopOffer(), 'BEGIN').reason, 'handover_stop_claim_required');
});

test('handover stop helpers classify pre-arrival/ready/in-progress/other and merge My Tasks job IDs', () => {
  assert.equal(handoverStopOwnerState(stopOffer(), 'staff-a'), 'free');
  assert.equal(handoverStopPhase(stopOffer(), 'staff-a'), 'unclaimed_approaching');
  assert.equal(handoverStopPhase(stopOffer({ robotReadyAt: '2026-11-20T08:00:25Z' }), 'staff-a'), 'unclaimed_ready');
  assert.equal(handoverStopPhase(stopOffer({ claimedBy: 'staff-a' }), 'staff-a'), 'claimed_approaching');
  assert.equal(handoverStopPhase(stopOffer({ claimedBy: 'staff-a', robotReadyAt: '2026-11-20T08:00:25Z' }), 'staff-a'), 'claimed_ready');
  assert.equal(handoverStopPhase(stopOffer({ claimedBy: 'staff-a', robotReadyAt: '2026-11-20T08:00:25Z', beganAt: '2026-11-20T08:00:30Z' }), 'staff-a'), 'in_progress');
  assert.equal(handoverStopPhase(stopOffer({ claimedBy: 'staff-b' }), 'staff-a'), 'claimed_by_other');

  const merged = mergeMyJobIdsWithStops(
    [
      { id: 'job-1', isMine: false, status: 'RUNNING' },
      { id: 'job-2', isMine: true, status: 'RUNNING' },
      { id: 'job-3', isMine: true, status: 'COMPLETED' },
      { id: 'job-4', isMine: false, status: 'RUNNING' },
    ],
    [
      stopOffer({ jobId: 'job-1', claimedBy: 'staff-a' }),
      stopOffer({ jobId: 'job-4', claimedBy: 'staff-b' }),
    ],
    'staff-a',
  );
  assert.deepEqual([...merged].sort(), ['job-1', 'job-2']);
});

test('confirmHandoverStop sends moveId, version and deduplicated container scans, propagating 409 holds', async () => {
  const requests = [];
  const api = loadApi(async (url, init, token) => {
    requests.push({ url, method: init.method, body: JSON.parse(init.body), token });
    return { ...rawJob(), status: 'RUNNING' };
  });

  const job = await api.confirmHandoverStop('job-1', 'stop-1', 'move-1', 4, [
    { containerId: 'ctn-1', barcode: ' CTN-0001 ' },
    { containerId: 'ctn-2', barcode: 'CTN-0002' },
  ]);
  assert.equal(job.id, 'job');
  assert.deepEqual(requests[0], {
    url: '/api/workflow-execution/jobs/job-1/handover-stops/stop-1/confirm',
    method: 'POST',
    body: {
      moveId: 'move-1',
      version: 4,
      scans: [
        { containerId: 'ctn-1', barcode: 'CTN-0001' },
        { containerId: 'ctn-2', barcode: 'CTN-0002' },
      ],
    },
    token: 'staff-token',
  });

  await assert.rejects(
    () => api.confirmHandoverStop('job-1', 'stop-1', 'move-1', 4, []),
    error => error.code === 'handover_scan_manifest_mismatch',
  );
  await assert.rejects(
    () => api.confirmHandoverStop('job-1', 'stop-1', 'move-1', 4, [
      { containerId: 'ctn-1', barcode: 'CTN-0001' },
      { containerId: 'ctn-1', barcode: 'CTN-0001' },
    ]),
    error => error.code === 'handover_scan_manifest_mismatch',
  );

  const blockedApi = loadApi(async () => {
    const err = new Error('Resolve the wrong or missing container issue before confirming.');
    err.status = 409;
    err.code = 'handover_issue_blocking';
    throw err;
  });
  await assert.rejects(
    () => blockedApi.confirmHandoverStop('job-1', 'stop-1', 'move-1', 4, [{ containerId: 'ctn-1', barcode: 'CTN-0001' }]),
    error => error.status === 409 && error.code === 'handover_issue_blocking',
  );
});

test('recordStopScan, stopScanProgress and isBlockingHandoverIssue track multi-container scans and blocking issues', () => {
  const stop = stopOffer({
    containers: [
      { containerId: 'ctn-1', barcode: 'CTN-0001' },
      { containerId: 'ctn-2', barcode: 'CTN-0002' },
    ],
  });

  const step1 = recordStopScan(stop, {}, ' ctn-0001 ');
  assert.equal(step1.matchedContainerId, 'ctn-1');
  assert.equal(step1.duplicate, false);

  const dup = recordStopScan(stop, step1.nextScans, 'CTN-0001');
  assert.equal(dup.matchedContainerId, 'ctn-1');
  assert.equal(dup.duplicate, true);

  const wrong = recordStopScan(stop, step1.nextScans, 'CTN-9999');
  assert.equal(wrong.matchedContainerId, null);
  assert.deepEqual(plain(stopScanProgress(stop, step1.nextScans)), {
    total: 2,
    scanned: 1,
    complete: false,
    missingIds: ['ctn-2'],
    payload: [{ containerId: 'ctn-1', barcode: 'CTN-0001' }],
  });

  const step2 = recordStopScan(stop, step1.nextScans, 'CTN-0002');
  assert.deepEqual(plain(stopScanProgress(stop, step2.nextScans)), {
    total: 2,
    scanned: 2,
    complete: true,
    missingIds: [],
    payload: [
      { containerId: 'ctn-1', barcode: 'CTN-0001' },
      { containerId: 'ctn-2', barcode: 'CTN-0002' },
    ],
  });

  assert.equal(isBlockingHandoverIssue({ problemCode: 'WRONG_CONTAINER', status: 'OPEN' }), true);
  assert.equal(isBlockingHandoverIssue({ problemCode: 'MISSING_CONTAINER', status: 'IN_PROGRESS' }), true);
  assert.equal(isBlockingHandoverIssue({ problemCode: 'WRONG_CONTAINER', status: 'RESOLVED' }), false);
  assert.equal(isBlockingHandoverIssue({ problemCode: 'BARCODE_UNREADABLE', status: 'OPEN' }), false);
});
