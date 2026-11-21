const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const {
  cancellationTone,
  cargoStillOnRobot,
  isCancellationActive,
  matchScannedContainer,
  newIdempotencyKey,
  openActions,
  robotNextStep,
  CANCELLATION_STAGE_TEXT,
} = createLoader()('src/features/transport/cancellationData.ts');

const item = {
  jobId: 'job-1', jobNo: 'J211126001', jobStatus: 'PAUSED', robotId: 'r', robotCode: 'RBT-002', robotOnline: true,
  robotMotionHeld: true, stage: 'CARGO_ON_ROBOT', canHandOver: true, canDeliver: true,
  containers: [
    { containerId: 'c4', barcode: 'C211126004', jobContainerStatus: 'ONBOARD', resolution: null },
    { containerId: 'c5', barcode: 'C211126005', jobContainerStatus: 'CANCELLED', resolution: 'HANDED_OVER' },
    { containerId: 'c6', barcode: 'C211126006', jobContainerStatus: 'DELIVERED', resolution: 'DELIVERED' },
  ],
};

test('a scanned label is matched to the container still on this robot, case and spaces ignored', () => {
  assert.equal(matchScannedContainer(item, ' c211126004 ').kind, 'match');
  assert.equal(matchScannedContainer(item, 'C211126004').containerId, 'c4');
});

test('a label already unloaded is reported as such, a delivered or foreign label is not on this robot', () => {
  assert.equal(matchScannedContainer(item, 'C211126005').kind, 'already');
  assert.equal(matchScannedContainer(item, 'C211126006').kind, 'not_on_robot');
  assert.equal(matchScannedContainer(item, 'C999').kind, 'not_on_robot');
});

test('only cargo still on board counts as left to unload', () => {
  assert.deepEqual(cargoStillOnRobot(item).map(c => c.containerId), ['c4']);
});

test('the screen keeps following a cancellation until it is finalized and colours what needs a person', () => {
  assert.equal(isCancellationActive(null), false);
  assert.equal(isCancellationActive({ status: 'RECOVERING' }), true);
  assert.equal(isCancellationActive({ status: 'FINALIZED' }), false);
  assert.equal(cancellationTone('MANUAL_INTERVENTION'), 'danger');
  assert.equal(cancellationTone('WAITING_ROBOT'), 'warning');
  assert.equal(cancellationTone('FINALIZED'), 'success');
  assert.equal(Object.keys(CANCELLATION_STAGE_TEXT).length, 12);
});

test('each confirmation gets its own idempotency key', () => {
  let n = 0;
  const a = newIdempotencyKey(() => 0.1, () => 1000 + n++);
  const b = newIdempotencyKey(() => 0.1, () => 1000 + n++);
  assert.notEqual(a, b);
  assert.ok(a.length <= 128);
});

test('cancel sends the reason code, the idempotency key header and the chosen details', async () => {
  const calls = [];
  const api = createLoader({
    'src/shared/api/client.ts': {
      apiFetch: async (path, init) => { calls.push({ path, init }); return { id: 'tr-1' }; },
      ApiError: class extends Error {},
    },
  })('src/shared/api/transportApi.ts');

  await api.cancelTransportRequest('tr-1', 'customer cancelled', { reasonCode: 'CUSTOMER_CANCELLED', idempotencyKey: 'k-1', detailIds: ['d-2'] });

  assert.equal(calls[0].path, '/api/transportation/transport-requests/tr-1/cancel');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'k-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { reason: 'customer cancelled', reasonCode: 'CUSTOMER_CANCELLED', detailIds: ['d-2'] });
});

test('a request never cancelled answers null, and a hand-over posts the scan and the shelf', async () => {
  const calls = [];
  const api = createLoader({
    'src/shared/api/client.ts': {
      apiFetch: async (path, init) => { calls.push({ path, init }); return path.endsWith('/cancellation') ? null : { status: 'RECOVERING' }; },
      ApiError: class extends Error {},
    },
  })('src/shared/api/transportApi.ts');

  assert.equal(await api.getCancellation('tr-1'), null);
  await api.handOverCancelledCargo('tr-1', 'job-1', { containerId: 'c4', scannedBarcode: 'C211126004', storageLocationId: 's-1', levelNo: 2 });

  assert.equal(calls[1].path, '/api/transportation/transport-requests/tr-1/cancellation/jobs/job-1/handover');
  assert.deepEqual(JSON.parse(calls[1].init.body), { containerId: 'c4', scannedBarcode: 'C211126004', storageLocationId: 's-1', levelNo: 2 });
});

test('the destination policy says where each robot goes next', () => {
  assert.equal(robotNextStep({ ...item, phase: 'IN_TRANSIT' }).next, 'Recovery Point, Where The Cargo Is Handled');
  assert.equal(robotNextStep({ ...item, phase: 'TO_PICKUP' }).next, 'A Wait Point Or Parking, Whichever Is Nearer');
  assert.equal(robotNextStep({ ...item, phase: 'AT_DROPOFF' }).next, 'Reconcile The Containers First');
  const atPoint = robotNextStep({ ...item, phase: 'AT_RECOVERY', recoveryPointCode: 'EP-WAIT-POINT-1' });
  assert.equal(atPoint.params.code, 'EP-WAIT-POINT-1');
  assert.equal(robotNextStep({ ...item, stage: 'SAFE_STOP' }).warn, true);
  const parked = robotNextStep({ ...item, stage: 'DONE', destinationStatus: 'SENT', destinationEndpointCode: 'EP-PARKING-A' });
  assert.equal(parked.next, 'Sent To {code}');
  assert.equal(parked.params.code, 'EP-PARKING-A');
});

test('next steps come from the server, with the old flags only for an older server', () => {
  assert.deepEqual([...openActions({ ...item, actions: ['SEND_TO_RECOVERY'] })], ['SEND_TO_RECOVERY']);
  assert.deepEqual([...openActions({ ...item, actions: undefined })].sort(), ['CONTINUE_DELIVERY', 'UNLOAD_BY_SCAN']);
  assert.equal(CANCELLATION_STAGE_TEXT.AT_RECOVERY, 'At The Recovery Point');
});
