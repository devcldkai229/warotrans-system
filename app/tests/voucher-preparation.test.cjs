const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const load = createLoader();
const prep = load('src/features/inventory/voucherPreparation.ts');
const { createPreparationStorage } = load('src/features/inventory/preparationStorage.ts');
const scope = { accountId: 'staff-1', warehouseId: 'warehouse-1', documentKey: 'voucher-1' };
const plain = value => JSON.parse(JSON.stringify(value));
const product = { id: 'product-1', sku: 'P1', name: 'Gạo', isActive: true };
function memory(fail = () => false) {
  const items = new Map();
  return { items, get: async key => items.get(key) ?? null,
    set: async (key, value) => { if (fail(key, value)) throw new Error('Storage unavailable'); items.set(key, value); },
    remove: async key => { items.delete(key); } };
}

test('container count requires a positive whole safe number; contents allow positive decimal quantities', () => {
  for (const value of ['', '0', '-1', '1.5', '2e2', '9007199254740992']) assert.equal(prep.preparationCount(value), null);
  assert.equal(prep.preparationCount(' 12 '), 12);
  for (const value of ['', '0', '-2', 'NaN', 'Infinity', '3pcs', '2e2']) assert.equal(prep.contentsQuantity(value), null);
  assert.equal(prep.contentsQuantity('2,5'), 2.5);
  assert.equal(prep.contentsQuantity('2.5'), 2.5);
});

test('inbound review requires actual allocated IDs matching requested count and complete active-product contents', () => {
  const value = prep.emptyPreparation('INBOUND'); value.requestedCount = '2';
  assert.match(prep.inboundPreparationProblem([], value), /barcodes/);
  assert.match(prep.inboundPreparationProblem(['c1'], value), /match/);
  assert.match(prep.inboundPreparationProblem(['c1', 'c2'], value), /active product/);
  value.contents = Object.fromEntries(['c1', 'c2'].map(id => [id, { product, quantity: '24', unit: 'pcs' }]));
  assert.equal(prep.inboundPreparationProblem(['c1', 'c2'], value), null);
  value.contents.c2.product = { ...product, isActive: false };
  assert.match(prep.inboundPreparationProblem(['c1', 'c2'], value), /active product/);
  value.contents.c2 = { product, quantity: '0', unit: 'pcs' };
  assert.match(prep.inboundPreparationProblem(['c1', 'c2'], value), /greater than zero/);
  value.contents.c2 = { product, quantity: '24', unit: ' ' };
  assert.match(prep.inboundPreparationProblem(['c1', 'c2'], value), /unit/);
});

test('malformed or wrong-type saved preparations are rejected instead of silently wiping inputs', () => {
  const good = prep.emptyPreparation('INBOUND');
  assert.equal(prep.validPreparation(good, 'INBOUND'), true);
  for (const value of [null, {}, { ...good, contents: [] }, { ...good, note: null }, { ...good, selected: { c: {} } }, { ...good, contents: { c: {} } }]) assert.equal(prep.validPreparation(value, 'INBOUND'), false);
  assert.equal(prep.validPreparation(good, 'OUTBOUND'), false);
});

test('chunked local preparations round-trip Unicode and stay below the per-entry size budget', async () => {
  const adapter = memory(); const store = createPreparationStorage(adapter);
  const value = { ...prep.emptyPreparation('INBOUND'), note: 'Nhập hàng 📦 '.repeat(600), contents: { c1: { product, quantity: '2', unit: 'thùng' } } };
  await store.write(scope, value);
  assert.deepEqual(plain(await store.read(scope)), plain(value));
  assert.ok(adapter.items.size > 2);
  assert.ok([...adapter.items.values()].every(value => Buffer.byteLength(value) <= 1800));
});

test('failed replacement preserves last committed preparation and allows a retry', async () => {
  let failWrites = false;
  const adapter = memory((key) => failWrites && !key.endsWith('.0'));
  const store = createPreparationStorage(adapter);
  await store.write(scope, { note: 'original' });
  failWrites = true;
  await assert.rejects(store.write(scope, { note: 'new'.repeat(2000) }));
  assert.deepEqual(plain(await store.read(scope)), { note: 'original' });
  failWrites = false;
  await store.write(scope, { note: 'retried' });
  assert.deepEqual(plain(await store.read(scope)), { note: 'retried' });
});

test('ordered writes retain newest preparation and isolate account, warehouse and document', async () => {
  const store = createPreparationStorage(memory());
  await Promise.all([store.write(scope, { note: 'first' }), store.write(scope, { note: 'last' }),
    store.write({ ...scope, accountId: 'staff-2' }, { note: 'another account' }), store.write({ ...scope, warehouseId: 'warehouse-2' }, { note: 'another warehouse' })]);
  assert.equal((await store.read(scope)).note, 'last');
  assert.equal((await store.read({ ...scope, accountId: 'staff-2' })).note, 'another account');
  assert.equal((await store.read({ ...scope, warehouseId: 'warehouse-2' })).note, 'another warehouse');
  assert.equal(await store.read({ ...scope, documentKey: 'another-voucher' }), null);
});

test('incomplete committed cache is surfaced as an error instead of an empty draft', async () => {
  const adapter = memory(); const store = createPreparationStorage(adapter);
  await store.write(scope, { note: 'saved' });
  const key = [...adapter.items.keys()].find(key => key.endsWith('.0'));
  adapter.items.delete(key);
  await assert.rejects(store.read(scope), /incomplete/);
});

const { outboundPreviewItems, loadOutboundPreview } = createLoader({
  'src/shared/api/client.ts': { ApiError: class ApiError extends Error { constructor(status, code, message) { super(message); this.code = code; } } },
  'src/shared/api/navigationApi.ts': {}, 'src/shared/api/warehouseApi.ts': {},
})('src/features/inventory/outboundPreparation.ts');
const point = { id: 'out', code: 'OUTBOUND-01', mapVersionId: 'map', endpointType: 'WAYPOINT', isEnabled: true };
const map = { id: 'map', warehouseId: 'warehouse-1', endpoints: [point] };
const container = { id: 'c1', barcode: 'CT-1', status: 'STORED', inActiveTransport: false, currentStorageLocationId: 'loc', currentEndpointId: 'out' };

test('outbound preview only uses explicit current locations on enabled outbound point-code hints', () => {
  const result = outboundPreviewItems(map, scope.warehouseId, [container,
    { ...container, id: 'moving', inActiveTransport: true }, { ...container, id: 'unknown', inActiveTransport: undefined },
    { ...container, id: 'issued', status: 'ISSUED' }, { ...container, id: 'elsewhere', currentEndpointId: 'shelf' },
    { ...container, id: 'unlocated', currentStorageLocationId: null }, container]);
  assert.deepEqual(plain(result.items).map(value => value.id), ['c1']);
  assert.throws(() => outboundPreviewItems(map, 'another-warehouse', [container]), /another warehouse/);
  for (const change of [{ isEnabled: false }, { mapVersionId: 'old-map' }, { code: 'NOTOUTBOUND' }, { endpointType: 'PARK' }]) {
    assert.equal(outboundPreviewItems({ ...map, endpoints: [{ ...point, ...change }] }, scope.warehouseId, [container]).items.length, 0);
  }
});

test('outbound preview paginates fully, forwards cancellation and never turns a truncated list into empty success', async () => {
  let calls = [];
  const signal = new AbortController().signal;
  let truncate = false;
  const api = createLoader({
    'src/shared/api/client.ts': { ApiError: class ApiError extends Error { constructor(status, code, message) { super(message); this.code = code; } } },
    'src/shared/api/navigationApi.ts': { getActiveMapVersion: async () => map, getMapVersionDetail: async () => map },
    'src/shared/api/warehouseApi.ts': { listContainers: async (params, actualSignal) => { calls.push(params); assert.equal(actualSignal, signal); return params.skip === 0 ? { items: [container], total: 2 } : { items: truncate ? [] : [{ ...container, id: 'c2' }], total: 2 }; } },
  })('src/features/inventory/outboundPreparation.ts');
  assert.equal((await api.loadOutboundPreview(scope.warehouseId, signal)).items.length, 2);
  assert.deepEqual(calls.map(value => value.skip), [0, 1]);
  truncate = true;
  await assert.rejects(api.loadOutboundPreview(scope.warehouseId, signal), error => error.code === 'incomplete_container_list');
});

test('outbound review detects changed barcode, point or product after refresh', () => {
  const { staleOutboundSelections } = createLoader({ 'src/shared/api/client.ts': {}, 'src/shared/api/navigationApi.ts': {}, 'src/shared/api/warehouseApi.ts': {} })('src/features/inventory/outboundPreparation.ts');
  const current = { ...container, productName: 'Rice', productSku: 'RICE' };
  const selection = [{ id: current.id, barcode: current.barcode, endpointId: current.currentEndpointId, productName: current.productName, productSku: current.productSku }];
  assert.equal(staleOutboundSelections(selection, [current]).length, 0);
  for (const change of [{ barcode: 'different' }, { currentEndpointId: 'other-outbound' }, { productName: 'Changed' }, { productSku: 'NEW' }]) assert.equal(staleOutboundSelections(selection, [{ ...current, ...change }]).length, 1);
  assert.equal(staleOutboundSelections(selection, []).length, 1);
});

test('reading a preparation during replacement completes before old chunks are cleaned', async () => {
  const adapter = memory(); const store = createPreparationStorage(adapter);
  await store.write(scope, { note: 'first' });
  const [read] = await Promise.all([store.read(scope), store.write(scope, { note: 'next' })]);
  assert.equal(read.note, 'first');
  assert.equal((await store.read({ documentKey: scope.documentKey, warehouseId: scope.warehouseId, accountId: scope.accountId })).note, 'next');
});

test('cleanup failure after manifest commit does not report a committed save as failed', async () => {
  const adapter = memory();
  const store = createPreparationStorage({ ...adapter, remove: async () => { throw new Error('Cleanup unavailable'); } });
  await store.write(scope, { note: 'first' });
  await store.write(scope, { note: 'next' });
  assert.equal((await store.read(scope)).note, 'next');
});

test('inbound progress counts only current real containers and excludes incomplete contents', () => {
  const value = prep.emptyPreparation('INBOUND');
  value.contents = { a: { product, quantity: '2', unit: 'pcs' }, b: { product, quantity: '0', unit: 'pcs' }, removed: { product, quantity: '5', unit: 'pcs' } };
  assert.deepEqual(plain(prep.inboundContentsProgress(['a', 'b', 'c'], value)), { complete: 1, total: 3, firstIncomplete: 'b' });
  assert.deepEqual(plain(prep.inboundContentsProgress([], value)), { complete: 0, total: 0, firstIncomplete: null });
});

test('next incomplete container follows visible order, wraps and never selects removed or complete rows', () => {
  const value = prep.emptyPreparation('INBOUND');
  value.contents = { a: { product, quantity: '2', unit: 'pcs' } };
  assert.equal(prep.nextIncompleteContainer(['a', 'b', 'c'], 'a', value), 'b');
  assert.equal(prep.nextIncompleteContainer(['a', 'b', 'c'], 'c', value), 'b');
  assert.equal(prep.nextIncompleteContainer(['a'], 'a', value), null);
  assert.equal(prep.nextIncompleteContainer(['a', 'b'], 'removed', value), 'b');
});

test('container stepper changes one unit, starts empty input at one and respects bounds', () => {
  assert.equal(prep.stepContainerCount('5', 1), '6');
  assert.equal(prep.stepContainerCount('5', -1), '4');
  assert.equal(prep.stepContainerCount('', 1), '1');
  assert.equal(prep.stepContainerCount('', -1), '1');
  assert.equal(prep.stepContainerCount('invalid', 1), '1');
  assert.equal(prep.stepContainerCount('1', -1), '1');
  assert.equal(prep.stepContainerCount('9999', 1), '9999');
});
