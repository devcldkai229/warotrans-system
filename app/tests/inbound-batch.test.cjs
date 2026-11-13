const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const load = createLoader();
const { applyBatchGroupProduct, batchCounts, inboundBatchProblem, newBatchGroup } = load('src/features/inventory/inboundBatch.ts');
const { emptyPreparation, validPreparation } = load('src/features/inventory/voucherPreparation.ts');
const { createPreparationStorage } = load('src/features/inventory/preparationStorage.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const product = { id: 'p-1', sku: 'RICE', name: 'Rice', isActive: true };
const group = (key = 'group-1', overrides = {}) => ({ key, product, containerCount: '6', quantity: '24', unit: 'pcs', ...overrides });

test('batch counts separate requested, grouped and active Product-assigned containers', () => {
  const groups = [group('group-1'), group('group-2', { containerCount: '4', product: null })];
  assert.deepEqual(plain(batchCounts('10', groups)), { total: 10, grouped: 10, assigned: 6, remaining: 0 });
  assert.deepEqual(plain(batchCounts('', [])), { total: null, grouped: 0, assigned: 0, remaining: null });
});

test('new planning groups have unique local keys without constructing barcodes, Container IDs or per-box overrides', () => {
  const first = newBatchGroup([], '5');
  const next = newBatchGroup([first], '2');
  assert.notEqual(first.key, next.key);
  assert.equal(next.containerCount, '2');
  assert.equal(next.product, null);
  assert.equal('barcode' in next, false);
  assert.equal('containerId' in next, false);
  assert.equal('quantities' in next, false);
});

test('batch review accepts a fully assigned mixed-product lot and never changes stock or actual contents', () => {
  const groups = [group(), group('group-2', { product: { ...product, id: 'p-2', sku: 'BEANS' }, containerCount: '4', quantity: '12' })];
  const before = JSON.stringify(groups);
  assert.equal(inboundBatchProblem('10', groups), null);
  assert.equal(JSON.stringify(groups), before);
  assert.equal(inboundBatchProblem('11', groups).message, 'Product group counts must equal the batch container count.');
  assert.equal(inboundBatchProblem('9', groups).message, 'Product group counts must equal the batch container count.');
});

test('review identifies the group with invalid Product, group count, common quantity or unit', () => {
  for (const patch of [{ product: null }, { product: { ...product, isActive: false } }, { containerCount: '0' }, { containerCount: '1.5' }, { quantity: '0' }, { quantity: '-1' }, { unit: ' ' }]) {
    const problem = inboundBatchProblem('6', [group('group-1', patch)]);
    assert.equal(problem.groupKey, 'group-1');
  }
  assert.match(inboundBatchProblem('0', [group()]).message, /1 and 9,999/);
  assert.match(inboundBatchProblem('10000', [group()]).message, /1 and 9,999/);
  assert.ok(inboundBatchProblem('6', []));
  assert.ok(inboundBatchProblem('12', [group(), group()]));
});

test('old preparations and legacy cached quantities remain readable while malformed batch caches are rejected', () => {
  const old = emptyPreparation('INBOUND');
  assert.equal(validPreparation(old, 'INBOUND'), true);
  assert.equal(validPreparation({ ...old, groups: [group()] }, 'INBOUND'), true);
  assert.equal(validPreparation({ ...old, groups: [group('group-1', { quantities: { 1: '24' } })] }, 'INBOUND'), true);
  for (const groups of [null, {}, [null], [group(), group()], [group('x', { containerCount: 6 })], [group('x', { unit: null })]]) {
    assert.equal(validPreparation({ ...old, groups }, 'INBOUND'), false);
  }
  assert.equal(Object.keys(old.contents).length, 0);
});

test('batch plans survive device persistence scoped to the real draft ID without inventing contents', async () => {
  const memory = new Map();
  const store = createPreparationStorage({ get: async key => memory.get(key) ?? null, set: async (key, value) => { memory.set(key, value); }, remove: async key => { memory.delete(key); } });
  const scope = { accountId: 'staff', warehouseId: 'warehouse', documentKey: 'real-server-voucher-id' };
  const value = { ...emptyPreparation('INBOUND'), requestedCount: '6', groups: [group('group-1')] };
  await store.write(scope, value);
  const restored = await store.read(scope);
  assert.deepEqual(plain(restored), plain(value));
  assert.equal(validPreparation(restored, 'INBOUND'), true);
  assert.equal(await store.read({ ...scope, accountId: 'another-staff' }), null);
  assert.equal(Object.keys(restored.contents).length, 0);
});

test('selecting a new product updates or clears only the target group', () => {
  const initial = [group('group-1'), group('group-2', { product: { ...product, id: 'p-2', sku: 'BEANS' } })];
  const cleared = applyBatchGroupProduct(initial, 'group-1', null);
  assert.equal(cleared[0].product, null);
  assert.equal(cleared[1].product.id, 'p-2');
  assert.equal(inboundBatchProblem('12', cleared).groupKey, 'group-1');
  const replaced = applyBatchGroupProduct(cleared, 'group-1', { ...product, id: 'p-3', sku: 'CORN' });
  assert.equal(replaced[0].product.id, 'p-3');
});
