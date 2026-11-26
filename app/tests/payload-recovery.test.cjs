const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const plain = (value) => JSON.parse(JSON.stringify(value));

const {
  candidateReasonLabel,
  eligibleRecoveryEndpoints,
  recoveryActionReasonLabel,
  rankedRecoveryEndpoints,
  recoveryPhaseLabel,
  waitsForTechnician,
  recoveryPhaseFromCase,
  recoveryScanProgress,
  recordRecoveryScan,
} = createLoader()('src/features/safety/payloadRecoveryData.ts');

function loadExecutionApi(apiFetch, token = 'staff-token') {
  return createLoader({
    'src/shared/api/client.ts': {
      apiFetch,
      ApiError: class ApiError extends Error {
        constructor(status, code, message) {
          super(message);
          this.status = status;
          this.code = code;
        }
      },
      getAccessToken: () => token,
    },
    'src/shared/api/navigationApi.ts': { getMapVersionDetail: async () => ({ id: 'map-1', endpoints: [] }) },
    'src/shared/api/workflowApi.ts': { getWorkflow: async () => ({ id: 'wf-1' }) },
    'src/shared/api/fleetApi.ts': { listRobots: async () => ({ items: [] }) },
  })('src/shared/api/executionApi.ts');
}

const makeRecovery = (overrides = {}) => ({
  id: 'case-1',
  jobId: 'job-1',
  status: 'OPEN',
  reason: 'Motor fault',
  fromRobotId: 'rbt-1',
  toRobotId: null,
  recoveryEndpointId: null,
  containerIds: ['ctn-1', 'ctn-2'],
  robotArrived: false,
  confirmedBy: null,
  confirmedAt: null,
  note: null,
  createdAt: '2026-11-20T09:00:00Z',
  resolvedAt: null,
  claimedBy: null,
  version: 1,
  containers: [
    { containerId: 'ctn-1', barcode: 'CTN-0001' },
    { containerId: 'ctn-2', barcode: 'CTN-0002' },
  ],
  availableActions: [
    { action: 'CLAIM', allowed: true, reason: null },
    { action: 'RELEASE', allowed: false, reason: 'recovery_claim_required' },
    { action: 'ASSIGN', allowed: false, reason: 'recovery_claim_required' },
    { action: 'UNASSIGN', allowed: false, reason: 'recovery_claim_required' },
    { action: 'CONFIRM', allowed: false, reason: 'recovery_claim_required' },
    { action: 'RESUME_SAME_ROBOT', allowed: false, reason: 'recovery_claim_required' },
  ],
  ...overrides,
});

const rawJob = (overrides = {}) => ({
  id: 'job-1',
  jobNo: 'JOB-101',
  workflowId: 'wf-1',
  mapVersionId: 'map-1',
  provisioningKey: 'pk-1',
  status: 'PAUSED',
  containers: [],
  tasks: [],
  ...overrides,
});

test('getJobRecovery and listRecoveryCandidates read server contracts and reject invalid payloads', async () => {
  const api = loadExecutionApi(async (url) => {
    if (url.endsWith('/recovery')) return { recovery: makeRecovery() };
    if (url.endsWith('/candidates')) {
      return {
        items: [
          { robotId: 'rbt-2', robotCode: 'RBT-002', maxContainers: 2, eligible: true, reasons: [] },
          { robotId: 'rbt-3', robotCode: 'RBT-003', maxContainers: 1, eligible: false, reasons: ['container_limit_exceeded'] },
        ],
      };
    }
    throw new Error(`unexpected ${url}`);
  });

  const rec = await api.getJobRecovery('job-1');
  assert.equal(rec.id, 'case-1');
  assert.equal(api.isRecoveryActionAllowed(rec, 'CLAIM'), true);
  assert.equal(api.isRecoveryActionAllowed(rec, 'ASSIGN'), false);
  assert.equal(api.getRecoveryAction(rec, 'ASSIGN').reason, 'recovery_claim_required');

  const nullApi = loadExecutionApi(async () => ({ recovery: null }));
  assert.equal(await nullApi.getJobRecovery('job-1'), null);

  const candidates = await api.listRecoveryCandidates('job-1');
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].eligible, true);
  assert.deepEqual(plain(candidates[1].reasons), ['container_limit_exceeded']);

  await assert.rejects(
    () => loadExecutionApi(async () => ({ recovery: makeRecovery({ jobId: 'other' }) })).getJobRecovery('job-1'),
    error => error.status === 502 && error.code === 'recovery_invalid',
  );
  await assert.rejects(
    () => loadExecutionApi(async () => ({ items: 'bad' })).listRecoveryCandidates('job-1'),
    error => error.status === 502 && error.code === 'recovery_candidates_invalid',
  );
});

test('recovery mutations send caseId/version, bind caller token, and validate scans/note', async () => {
  const calls = [];
  const api = loadExecutionApi(async (url, init = {}, token) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, token });
    if (url.endsWith('/claim') || url.endsWith('/release') || url.endsWith('/assign') || url.endsWith('/unassign')) {
      return { recovery: makeRecovery({ claimedBy: 'staff-a', version: 2 }) };
    }
    if (url.endsWith('/transfer-confirm')) {
      return rawJob({ status: 'PAUSED' });
    }
    if (url.endsWith('/resume-same-robot')) {
      return rawJob({ status: 'RUNNING' });
    }
    throw new Error(`unexpected ${url}`);
  });

  await api.claimJobRecovery('job-1', ' case-1 ', 1);
  await api.releaseJobRecovery('job-1', 'case-1', 2);
  await api.assignRecoveryRobot('job-1', 'case-1', 2, ' rbt-2 ', ' ep-5 ');
  await api.unassignRecoveryRobot('job-1', 'case-1', 3);
  const pausedAfterTransfer = await api.confirmRecoveryTransfer(
    'job-1',
    'case-1',
    4,
    ' rbt-2 ',
    [{ containerId: 'ctn-1', barcode: ' CTN-0001 ' }, { containerId: 'ctn-2', barcode: 'CTN-0002' }],
    '  Moved safely  ',
  );
  assert.equal(pausedAfterTransfer.status, 'PAUSED');

  const resumed = await api.resumeRecoveryOnSameRobot('job-1', 'case-1', 2, '  Reset OK ');
  assert.equal(resumed.status, 'RUNNING');

  assert.deepEqual(calls, [
    { url: '/api/workflow-execution/jobs/job-1/recovery/claim', method: 'POST', body: { caseId: 'case-1', version: 1 }, token: 'staff-token' },
    { url: '/api/workflow-execution/jobs/job-1/recovery/release', method: 'POST', body: { caseId: 'case-1', version: 2 }, token: 'staff-token' },
    { url: '/api/workflow-execution/jobs/job-1/recovery/assign', method: 'POST', body: { caseId: 'case-1', version: 2, robotId: 'rbt-2', endpointId: 'ep-5' }, token: 'staff-token' },
    { url: '/api/workflow-execution/jobs/job-1/recovery/unassign', method: 'POST', body: { caseId: 'case-1', version: 3 }, token: 'staff-token' },
    {
      url: '/api/workflow-execution/jobs/job-1/recovery/transfer-confirm',
      method: 'POST',
      body: {
        caseId: 'case-1',
        version: 4,
        robotId: 'rbt-2',
        scans: [{ containerId: 'ctn-1', barcode: 'CTN-0001' }, { containerId: 'ctn-2', barcode: 'CTN-0002' }],
        note: 'Moved safely',
      },
      token: 'staff-token',
    },
    {
      url: '/api/workflow-execution/jobs/job-1/recovery/resume-same-robot',
      method: 'POST',
      body: { caseId: 'case-1', version: 2, note: 'Reset OK' },
      token: 'staff-token',
    },
  ]);

  await assert.rejects(
    () => api.confirmRecoveryTransfer('job-1', 'case-1', 4, 'rbt-2', []),
    error => error.code === 'handover_scan_manifest_mismatch',
  );
  await assert.rejects(
    () => api.confirmRecoveryTransfer('job-1', 'case-1', 4, 'rbt-2', [{ containerId: 'ctn-1', barcode: 'CTN-0001' }], 'x'.repeat(501)),
    error => error.code === 'recovery_note_too_long',
  );
  await assert.rejects(
    () => api.assignRecoveryRobot('job-1', 'case-1', -1, 'rbt-2', 'ep-1'),
    error => error.code === 'recovery_case_changed',
  );

  const armCalls = [];
  const armApi = loadExecutionApi(async (url, init = {}, token) => {
    armCalls.push({ url, method: init.method, body: JSON.parse(init.body), token });
    return {
      recovery: makeRecovery({
        version: 5,
        buttonArmed: true,
        availableActions: [{ action: 'ARM_BUTTON', allowed: true, reason: null }],
      }),
    };
  });
  const armed = await armApi.armRecoveryTransferButton(
    'job-1',
    'case-1',
    4,
    'rbt-2',
    [{ containerId: 'ctn-1', barcode: 'CTN-0001' }],
    ' Ready on robot ',
  );
  assert.equal(armed.buttonArmed, true);
  assert.equal(armApi.isRecoveryActionAllowed(armed, 'ARM_BUTTON'), true);
  assert.deepEqual(armCalls[0], {
    url: '/api/workflow-execution/jobs/job-1/recovery/arm-button',
    method: 'POST',
    body: {
      caseId: 'case-1',
      version: 4,
      robotId: 'rbt-2',
      scans: [{ containerId: 'ctn-1', barcode: 'CTN-0001' }],
      note: 'Ready on robot',
    },
    token: 'staff-token',
  });
});

test('payloadRecoveryData tracks manifest scans, phases, enabled map endpoints and error reasons', () => {
  const rec = makeRecovery({ claimedBy: 'staff-a', status: 'TARGET_ASSIGNED', robotArrived: true });
  assert.equal(recoveryPhaseFromCase(makeRecovery(), 'staff-a'), 'claim');
  assert.equal(recoveryPhaseFromCase(makeRecovery({ claimedBy: 'staff-b' }), 'staff-a'), 'claimed_other');
  assert.equal(recoveryPhaseFromCase(makeRecovery({ claimedBy: 'staff-a', status: 'OPEN' }), 'staff-a'), 'assign');
  assert.equal(recoveryPhaseFromCase(makeRecovery({ claimedBy: 'staff-a', status: 'TARGET_ASSIGNED', robotArrived: false }), 'staff-a'), 'en_route');
  assert.equal(recoveryPhaseFromCase(rec, 'staff-a'), 'confirm');
  assert.equal(recoveryPhaseFromCase(makeRecovery({ resolvedAt: '2026-11-20T10:00:00Z', status: 'TRANSFERRED' }), 'staff-a'), 'resolved');

  const badScan = recordRecoveryScan(rec, {}, 'WRONG-999');
  assert.equal(badScan.ok, false);

  const first = recordRecoveryScan(rec, {}, ' ctn-0001 ');
  assert.equal(first.ok, true);
  assert.equal(first.containerId, 'ctn-1');
  assert.equal(first.alreadyScanned, false);

  const dup = recordRecoveryScan(rec, first.nextScanned, 'CTN-0001');
  assert.equal(dup.ok, true);
  assert.equal(dup.alreadyScanned, true);

  assert.equal(recoveryScanProgress(rec, first.nextScanned).complete, false);

  const second = recordRecoveryScan(rec, first.nextScanned, 'CTN-0002');
  const progress = recoveryScanProgress(rec, second.nextScanned);
  assert.equal(progress.complete, true);
  assert.deepEqual(plain(progress.scans), [
    { containerId: 'ctn-1', barcode: 'CTN-0001' },
    { containerId: 'ctn-2', barcode: 'CTN-0002' },
  ]);

  const endpoints = eligibleRecoveryEndpoints({
    id: 'map-1',
    endpoints: [
      { id: 'e2', mapVersionId: 'map-1', code: 'EP-B', isEnabled: true },
      { id: 'e1', mapVersionId: 'map-1', code: 'EP-A', isEnabled: true },
      { id: 'e3', mapVersionId: 'map-1', code: 'EP-OFF', isEnabled: false },
      { id: 'e4', mapVersionId: 'map-2', code: 'EP-OTHER', isEnabled: true },
    ],
  });
  assert.deepEqual(endpoints.map(e => e.code), ['EP-A', 'EP-B']);

  assert.ok(candidateReasonLabel('container_limit_exceeded').includes('bay'));
  assert.ok(recoveryActionReasonLabel('recovery_request_inactive').includes('Transport Request'));
});

test('payloadRecoveryData waits for the technician and follows the ranked transfer points', () => {
  const waiting = {
    status: 'OPEN', phase: 'ASSESSMENT_REQUIRED', sourceSecuredAt: null,
    availableActions: [{ action: 'ASSIGN', allowed: false, reason: 'recovery_source_not_secured' }],
  };
  assert.equal(waitsForTechnician(waiting), true);
  assert.equal(waitsForTechnician({ ...waiting, phase: 'SOURCE_SECURED', sourceSecuredAt: '2026-11-26T03:00:00Z' }), false);
  // A case opened before phases existed never waits.
  assert.equal(waitsForTechnician({ ...waiting, phase: null }), false);
  assert.ok(recoveryPhaseLabel('ASSESSMENT_REQUIRED').includes('technician'));
  assert.equal(recoveryPhaseLabel(null), null);
  assert.ok(recoveryActionReasonLabel('recovery_source_not_secured').includes('technician'));

  const map = {
    id: 'map-1',
    endpoints: [
      { id: 'q', mapVersionId: 'map-1', code: 'EP-QUEUE', isEnabled: true },
      { id: 'p', mapVersionId: 'map-1', code: 'EP-PARKING-A', isEnabled: true },
    ],
  };
  const ranked = rankedRecoveryEndpoints([
    { endpointId: 'q', unsuitable: 'failed_robot_there' },
    { endpointId: 'p', unsuitable: null },
  ], map);
  assert.deepEqual(ranked.map(e => e.code), ['EP-PARKING-A']);
  assert.equal(rankedRecoveryEndpoints([], map), null);
});
