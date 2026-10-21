const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const load = createLoader();
const { parseStaffInputs, requestStatusLabel } = load('src/features/transport/dispatchData.ts');
const { worldToMapPercent } = load('src/shared/utils/mapCoordinates.ts');
const field = (key, dataType, required = true) => ({ key, label: key, dataType, required });

test('request status does not imply a waiting handover or completed inventory verification', () => {
  assert.equal(requestStatusLabel('IN_PROGRESS'), 'In Progress');
  assert.equal(requestStatusLabel('PARTIALLY_COMPLETED'), 'Partially Completed');
  assert.equal(requestStatusLabel('COMPLETED'), 'Completed');
  assert.equal(requestStatusLabel('REJECTED'), 'Rejected');
  assert.equal(requestStatusLabel('UNKNOWN_FROM_SERVER'), 'UNKNOWN_FROM_SERVER');
});

test('STAFF_INPUT preserves false and zero, omits undeclared and optional blank fields', () => {
  const result = parseStaffInputs([field('fragile', 'BOOLEAN'), field('count', 'INTEGER'), field('note', 'STRING', false)],
    { fragile: 'false', count: '0', note: '', injected: 'admin' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { fragile: false, count: 0 });
});
test('STAFF_INPUT rejects missing required values, invalid numeric/boolean/UUID/date types', () => {
  for (const [type, value] of [['INTEGER', '1.2'], ['DECIMAL', 'NaN'], ['BOOLEAN', 'yes'], ['UUID', 'demo-id'], ['DATETIME', 'not-a-date']]) {
    assert.throws(() => parseStaffInputs([field('value', type)], { value }));
  }
  assert.throws(() => parseStaffInputs([field('required', 'STRING')], {}), /required/);
});
test('map positions honor resolution, translated origin, inverted screen Y and rotated origin', () => {
  const map = { imageWidthPixels: 200, imageHeightPixels: 100, resolution: 0.1, originX: 10, originY: 20, originYaw: 0 };
  let result = worldToMapPercent(20, 25, map);
  assert.ok(Math.abs(result.x - 50) < 1e-9);
  assert.ok(Math.abs(result.y - 50) < 1e-9);
  result = worldToMapPercent(5, 30, { ...map, originYaw: Math.PI / 2 });
  assert.ok(Math.abs(result.x - 50) < 1e-9);
  assert.ok(Math.abs(result.y - 50) < 1e-9);
});
test('map geometry rejects invalid calibration and does not clamp out-of-bounds poses into the warehouse', () => {
  const map = { imageWidthPixels: 100, imageHeightPixels: 100, resolution: 1, originX: 0, originY: 0, originYaw: 0 };
  assert.equal(worldToMapPercent(1, 1, { ...map, resolution: 0 }), null);
  assert.ok(worldToMapPercent(200, 20, map).x > 100);
});
