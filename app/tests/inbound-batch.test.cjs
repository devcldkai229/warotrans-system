const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const load = createLoader({ 'src/shared/api/client.ts': { ApiError } });
const {
  applyBatchGroupProduct,
  applyDraftBatchGroupEdit,
  batchCounts,
  beginPendingBatch,
  buildContainerBatchBody,
  clearPendingBatch,
  createBatchRequestId,
  DEFAULT_QUANTITY,
  DEFAULT_UNIT,
  inboundBatchProblem,
  isDefinitiveBatchRejection,
  isPendingBatchForVoucher,
  newBatchGroup,
  reconcilePendingBatchWithVoucher,
} = load('src/features/inventory/inboundBatch.ts');
const { emptyPreparation, validPreparation } = load('src/features/inventory/voucherPreparation.ts');
const { createPreparationStorage } = load('src/features/inventory/preparationStorage.ts');
const { canAllocateInboundBatch } = load('src/features/inventory/stockVoucherData.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const product = { id: 'p-1', sku: 'RICE', name: 'Rice', isActive: true };
const group = (key = 'group-1', overrides = {}) => ({ key, product, containerCount: '6', quantity: '24', unit: 'pcs', ...overrides });

test('batch counts separate requested, grouped and active Product-assigned containers', () => {
  const groups = [group('group-1'), group('group-2', { containerCount: '4', product: null })];
  assert.deepEqual(plain(batchCounts('10', groups)), { total: 10, grouped: 10, assigned: 6, remaining: 0 });
  assert.deepEqual(plain(batchCounts('', [])), { total: null, grouped: 0, assigned: 0, remaining: null });
});

test('new planning groups start with empty box contents unless defaults are passed explicitly', () => {
  const first = newBatchGroup([], '5');
  const next = newBatchGroup([first], '2');
  assert.notEqual(first.key, next.key);
  assert.equal(next.containerCount, '2');
  assert.equal(next.quantity, '');
  assert.equal(next.unit, '');
  assert.equal(next.product, null);
  assert.equal('barcode' in next, false);
  assert.equal('containerId' in next, false);
  assert.equal('quantities' in next, false);
  const quick = newBatchGroup([], '3', DEFAULT_QUANTITY, DEFAULT_UNIT);
  assert.equal(quick.quantity, '1');
  assert.equal(quick.unit, 'container');
});

test('batch review accepts a fully assigned mixed-product lot and never changes stock or actual contents', () => {
  const groups = [group(), group('group-2', { product: { ...product, id: 'p-2', sku: 'BEANS' }, containerCount: '4', quantity: '12' })];
  const before = JSON.stringify(groups);
  assert.equal(inboundBatchProblem('10', groups), null);
  assert.equal(JSON.stringify(groups), before);
  assert.equal(inboundBatchProblem('11', groups).message, 'Product group counts must equal the batch container count.');
  assert.equal(inboundBatchProblem('9', groups).message, 'Product group counts must equal the batch container count.');
});

test('review identifies the group with invalid Product, box count, quantity per box or unit', () => {
  for (const patch of [
    { product: null },
    { product: { ...product, isActive: false } },
    { containerCount: '0' },
    { containerCount: '1.5' },
    { quantity: '' },
    { quantity: '0' },
    { quantity: '1.2345' },
    { unit: '' },
    { unit: '   ' },
    { unit: 'u'.repeat(33) },
  ]) {
    const problem = inboundBatchProblem('6', [group('group-1', patch)]);
    assert.equal(problem.groupKey, 'group-1');
  }
  assert.match(inboundBatchProblem('0', [group()]).message, /1 and 9,999/);
  assert.match(inboundBatchProblem('10000', [group()]).message, /1 and 9,999/);
  assert.ok(inboundBatchProblem('6', []));
  assert.ok(inboundBatchProblem('12', [group(), group()]));
  assert.equal(inboundBatchProblem('6', [group('group-1', { containerCount: '6', quantity: '24', unit: 'chai' })]), null);
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

test('batch request builder maps groups, decimal precision, unit limits and supplier barcode accurately', () => {
  const reqId = createBatchRequestId();
  assert.match(reqId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(reqId, createBatchRequestId());
  const groups = [
    group('group-1', { product: { ...product, supplierBarcode: ' 8930001 ' }, containerCount: '6', quantity: '12,5', unit: ' pcs ' }),
    group('group-2', { product: { ...product, id: 'p-2', sku: 'BEANS' }, containerCount: '4', quantity: '10', unit: 'kg' }),
  ];
  const body = plain(buildContainerBatchBody('wh-1', reqId, '10', groups, 'voucher-1'));
  assert.deepEqual(body, {
    warehouseId: 'wh-1',
    requestId: reqId,
    stockVoucherId: 'voucher-1',
    containerCount: 10,
    groups: [
      { groupKey: 'group-1', productId: 'p-1', containerCount: 6, quantityPerContainer: 12.5, unit: 'pcs', supplierPackageBarcode: '8930001' },
      { groupKey: 'group-2', productId: 'p-2', containerCount: 4, quantityPerContainer: 10, unit: 'kg' },
    ],
  });
  assert.throws(() => buildContainerBatchBody('', reqId, '10', groups), /WarehouseId/);
  assert.throws(() => buildContainerBatchBody('wh-1', ' ', '10', groups), /RequestId/);
  assert.throws(() => buildContainerBatchBody('wh-1', reqId, '6', [group('g-1', { quantity: '', unit: '' })]), /quantity/i);
  const quickBody = plain(buildContainerBatchBody('wh-1', reqId, '6', [group('g-1', { quantity: DEFAULT_QUANTITY, unit: DEFAULT_UNIT })]));
  assert.equal(quickBody.groups[0].quantityPerContainer, 1);
  assert.equal(quickBody.groups[0].unit, 'container');
});

test('preparation requestId validation and batch allocation permission gate work as expected', () => {
  const base = emptyPreparation('INBOUND');
  assert.equal(validPreparation({ ...base, requestId: 'req-123' }, 'INBOUND'), true);
  assert.equal(validPreparation({ ...base, requestId: '  ' }, 'INBOUND'), false);
  assert.equal(validPreparation({ ...base, requestId: 123 }, 'INBOUND'), false);
  const staff = { role: 'STAFF', permissions: ['warehouse.read', 'voucher.write'] };
  assert.equal(canAllocateInboundBatch(staff), false);
  assert.equal(canAllocateInboundBatch({ ...staff, permissions: [...staff.permissions, 'container.create'] }), true);
});

test('missing local preparation on an existing draft inbound voucher can be re-entered with product, quantity and unit', () => {
  const { batchTotal } = load('src/features/inventory/inboundBatch.ts');
  const lost = emptyPreparation('INBOUND');
  assert.equal(lost.groups, undefined);
  const recovered = [{ ...newBatchGroup([], '2'), product, quantity: '24', unit: 'chai' }];
  const total = batchTotal(recovered);
  assert.equal(total, '2');
  assert.equal(inboundBatchProblem(total, recovered), null);
  const body = plain(buildContainerBatchBody('wh-1', createBatchRequestId(), total, recovered, 'draft-voucher-1'));
  assert.equal(body.stockVoucherId, 'draft-voucher-1');
  assert.equal(body.containerCount, 2);
  assert.deepEqual(body.groups, [
    { groupKey: 'group-1', productId: 'p-1', containerCount: 2, quantityPerContainer: 24, unit: 'chai' },
  ]);
});

test('pendingBatch preserves exact requestId and payload on lost response and slow refetch, blocking edits until reconciled', async () => {
  const memory = new Map();
  const store = createPreparationStorage({
    get: async key => memory.get(key) ?? null,
    set: async (key, value) => { memory.set(key, value); },
    remove: async key => { memory.delete(key); },
  });
  const scope = { accountId: 'staff', warehouseId: 'wh-1', documentKey: 'draft-1' };
  const initialGroups = [group('group-1', { containerCount: '6', quantity: '24', unit: 'pcs' })];
  const initialPrep = { ...emptyPreparation('INBOUND'), requestedCount: '6', groups: initialGroups };

  // 1. Staff starts allocation: exact requestId + payload are persisted before POST.
  const firstPlan = beginPendingBatch(initialPrep, 'wh-1', 'draft-1');
  await store.write(scope, firstPlan.nextPrep);
  assert.equal(isPendingBatchForVoucher(firstPlan.nextPrep.pendingBatch, 'wh-1', 'draft-1'), true);
  assert.equal(validPreparation(firstPlan.nextPrep, 'INBOUND'), true);

  // 2. BE saves lot, response is lost (network/502/409/401) or user leaves screen; slow refetch returns empty DRAFT.
  for (const status of [0, 401, 403, 409, 500, 502]) {
    assert.equal(isDefinitiveBatchRejection(new ApiError(status, 'err', 'Uncertain')), false);
  }
  const restored = await store.read(scope);
  const afterSlowRefetch = reconcilePendingBatchWithVoucher(restored, { status: 'DRAFT', lines: [] });
  assert.equal(isPendingBatchForVoucher(afterSlowRefetch.pendingBatch, 'wh-1', 'draft-1'), true);

  // 3. Regression guard: Staff tries to change box count while outcome is unresolved -> blocked, key & payload preserved.
  const editedGroups = [group('group-1', { containerCount: '8', quantity: '24', unit: 'pcs' })];
  const afterEditAttempt = applyDraftBatchGroupEdit(afterSlowRefetch, editedGroups, 'wh-1', 'draft-1');
  assert.equal(afterEditAttempt.requestedCount, '6');
  assert.equal(afterEditAttempt.requestId, firstPlan.nextPrep.requestId);
  assert.deepEqual(plain(afterEditAttempt.pendingBatch), plain(firstPlan.nextPrep.pendingBatch));

  // 4. Retrying reuses exact same requestId and payload.
  const retryPlan = beginPendingBatch(afterEditAttempt, 'wh-1', 'draft-1');
  assert.equal(retryPlan.body.requestId, firstPlan.body.requestId);
  assert.deepEqual(plain(retryPlan.body), plain(firstPlan.body));

  // 5. Reconciliation clears pendingBatch once server voucher has lines (or leaves DRAFT), and 400/404 unlocks editing.
  assert.equal(isDefinitiveBatchRejection(new ApiError(400, 'bad', 'Invalid')), true);
  assert.equal(isDefinitiveBatchRejection(new ApiError(404, 'missing', 'Missing')), true);
  const reconciled = reconcilePendingBatchWithVoucher(afterEditAttempt, { status: 'DRAFT', lines: [{ id: 'l-1' }] });
  assert.equal(reconciled.pendingBatch, undefined);
  assert.equal(reconciled.requestId, undefined);
  assert.equal(clearPendingBatch(afterEditAttempt).pendingBatch, undefined);
});

test('empty DRAFT with no pendingBatch remains editable and rejects malformed pendingBatch caches', () => {
  const fresh = { ...emptyPreparation('INBOUND'), requestedCount: '6', groups: [group('group-1')] };
  const edited = applyDraftBatchGroupEdit(fresh, [group('group-1', { containerCount: '10' })], 'wh-1', 'draft-1');
  assert.equal(edited.requestedCount, '10');
  assert.equal(edited.pendingBatch, undefined);

  const validBody = buildContainerBatchBody('wh-1', 'req-1', '6', [group('group-1')], 'draft-1');
  assert.equal(validPreparation({ ...fresh, requestId: 'req-1', pendingBatch: { requestId: 'req-1', body: validBody } }, 'INBOUND'), true);
  for (const bad of [
    null,
    {},
    { requestId: 'req-1', body: { ...validBody, requestId: 'req-2' } },
    { requestId: 'req-1', body: { ...validBody, containerCount: 5 } },
    { requestId: 'req-1', body: { ...validBody, groups: [] } },
    { requestId: 'req-1', body: { ...validBody, warehouseId: ' ' } },
  ]) {
    assert.equal(validPreparation({ ...fresh, pendingBatch: bad }, 'INBOUND'), false);
  }
});
