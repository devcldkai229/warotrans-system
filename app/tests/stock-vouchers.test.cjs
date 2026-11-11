const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const plain = value => JSON.parse(JSON.stringify(value));
const detail = (overrides = {}) => ({ id: 'voucher-1', code: 'PN-20261111-000001', type: 'INBOUND', status: 'DRAFT',
  warehouseId: 'warehouse-1', warehouseCode: 'WH', warehouseName: 'Warehouse', referenceNo: null, note: null,
  createdBy: 'staff', createdAt: '2026-11-11T02:00:00Z', updatedAt: '2026-11-11T02:00:00Z', confirmedAt: null,
  confirmedBy: null, cancelledBy: null, cancelledAt: null, containerCount: 0, doneCount: 0, products: [], lines: [], ...overrides });
function modules(apiFetch) {
  return createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError, getAccessToken: () => 'original-account-token' } });
}

test('voucher list sends warehouse, document filters, server search, pagination and abort signal', async () => {
  let request;
  const api = modules(async (url, init) => { request = { url: new URL(url, 'https://unit.test'), init }; return { items: [], total: 0 }; })('src/shared/api/warehouseApi.ts');
  const controller = new AbortController();
  const result = await api.listStockVouchers({ warehouseId: 'warehouse-1', type: 'OUTBOUND', status: 'DRAFT', search: 'PO + 01', skip: 25, take: 25 }, controller.signal);
  assert.deepEqual(plain(result), { items: [], total: 0 });
  assert.equal(request.url.pathname, '/api/warehouse/stock-vouchers');
  assert.deepEqual(Object.fromEntries(request.url.searchParams), { warehouseId: 'warehouse-1', type: 'OUTBOUND', status: 'DRAFT', search: 'PO + 01', skip: '25', take: '25' });
  assert.equal(request.init.signal, controller.signal);
});

test('voucher detail verifies the requested identity and preserves real document/container status independently', async () => {
  const value = detail({ status: 'CONFIRMED', doneCount: 0 });
  const api = modules(async () => value)('src/shared/api/warehouseApi.ts');
  assert.deepEqual(plain(await api.getStockVoucher('voucher-1')), value);
  await assert.rejects(() => api.getStockVoucher('other-id'), error => error.code === 'voucher_identity_mismatch');
});

test('malformed voucher details are errors, not empty successful documents', async () => {
  for (const value of [null, detail({ lines: null }), detail({ lines: [{}] }), detail({ type: 'UNKNOWN' }), detail({ containerCount: -1 }), detail({ containerCount: 1 })]) {
    const api = modules(async () => value)('src/shared/api/warehouseApi.ts');
    await assert.rejects(() => api.getStockVoucher('voucher-1'), error => error.status === 502);
  }
});

test('creating a draft sends only supported metadata, retains the server ID and binds the original caller', async () => {
  let request;
  const response = detail();
  const api = modules(async (url, init, token) => { request = { url, init, token }; return response; })('src/shared/api/warehouseApi.ts');
  const controller = new AbortController();
  const result = await api.createStockVoucherDraft({ warehouseId: 'warehouse-1', type: 'INBOUND', referenceNo: ' PO-01 ', note: ' Check labels ',
    containerCount: 9, barcode: 'must-not-be-sent', productId: 'must-not-be-sent' }, controller.signal);
  assert.equal(result.id, 'voucher-1');
  assert.equal(result.containerCount, 0);
  assert.equal(request.url, '/api/warehouse/stock-vouchers');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.signal, controller.signal);
  assert.equal(request.token, 'original-account-token');
  assert.deepEqual(JSON.parse(request.init.body), { warehouseId: 'warehouse-1', type: 'INBOUND', referenceNo: 'PO-01', note: 'Check labels' });
});

test('outbound creates a separate draft and blank optional metadata is null', async () => {
  let body;
  const api = modules(async (_, init) => { body = JSON.parse(init.body); return detail({ type: 'OUTBOUND', code: 'PX-20261111-000001' }); })('src/shared/api/warehouseApi.ts');
  const result = await api.createStockVoucherDraft({ warehouseId: 'warehouse-1', type: 'OUTBOUND', referenceNo: ' ', note: '' });
  assert.deepEqual(body, { warehouseId: 'warehouse-1', type: 'OUTBOUND', referenceNo: null, note: null });
  assert.equal(result.type, 'OUTBOUND'); assert.equal(result.status, 'DRAFT');
});

test('an uncertain or rejected draft write is not automatically replayed', async () => {
  for (const status of [0, 400, 403, 409, 500]) {
    let calls = 0;
    const failure = new ApiError(status, 'rejected', 'Could not confirm');
    const api = modules(async () => { calls++; throw failure; })('src/shared/api/warehouseApi.ts');
    await assert.rejects(() => api.createStockVoucherDraft({ warehouseId: 'warehouse-1', type: 'INBOUND' }), error => error === failure);
    assert.equal(calls, 1);
  }
});

test('a create response that cannot confirm the submitted draft is treated as an uncertain result', async () => {
  for (const response of [null, detail({ warehouseId: 'other' }), detail({ type: 'OUTBOUND' }), detail({ status: 'CONFIRMED' }), detail({ id: '' }), detail({ lines: null })]) {
    const load = modules(async () => response);
    const api = load('src/shared/api/warehouseApi.ts');
    const { uncertainDraftWrite } = load('src/features/inventory/stockVoucherData.ts');
    await assert.rejects(() => api.createStockVoucherDraft({ warehouseId: 'warehouse-1', type: 'INBOUND' }), error => error.code === 'voucher_creation_unverified' && uncertainDraftWrite(error));
  }
});

test('confirmation cannot call the old document-only endpoint as if it posted stock', async () => {
  let writes = 0;
  const api = modules(async () => { writes++; })('src/shared/api/warehouseApi.ts');
  await assert.rejects(async () => api.confirmStockVoucher('voucher-1'), error => error.code === 'backend_capability_unavailable');
  assert.equal(writes, 0);
});

test('paging deduplicates shifted rows while retaining the first, freshest snapshot and raw server offset', () => {
  const { voucherRows, nextVoucherPage, incompleteVoucherPages } = modules(async () => {})('src/features/inventory/stockVoucherData.ts');
  const pages = [{ items: [detail()], total: 3 }, { items: [detail({ status: 'CANCELLED' }), detail({ id: 'voucher-2' })], total: 4 }];
  assert.deepEqual(plain(voucherRows(pages)).map(item => [item.id, item.status]), [['voucher-1', 'DRAFT'], ['voucher-2', 'DRAFT']]);
  assert.equal(nextVoucherPage(pages[1], pages), 3);
  assert.equal(nextVoucherPage({ items: [], total: 4 }, [...pages, { items: [], total: 4 }]), undefined);
  assert.equal(incompleteVoucherPages([...pages, { items: [], total: 4 }]), true);
  assert.equal(incompleteVoucherPages([{ items: [], total: 0 }]), false);
});

test('voucher warehouses are loaded completely without requesting a robot map', async () => {
  const calls = [], controller = new AbortController();
  const load = modules(async (url, init) => {
    const parsed = new URL(url, 'https://unit.test'); calls.push(parsed.pathname);
    assert.equal(init.signal, controller.signal);
    assert.equal(parsed.searchParams.get('isActive'), 'true');
    return { items: [{ id: parsed.searchParams.get('skip') === '0' ? 'a' : 'b', isActive: true }], total: 2 };
  });
  const { loadVoucherWarehouses } = load('src/features/inventory/stockVoucherData.ts');
  assert.deepEqual(plain(await loadVoucherWarehouses(controller.signal)).map(item => item.id), ['a', 'b']);
  assert.deepEqual(calls, ['/api/warehouse/warehouses', '/api/warehouse/warehouses']);
});

test('an incomplete warehouse list is not silently accepted', async () => {
  const { loadVoucherWarehouses } = modules(async () => ({ items: [], total: 2 }))('src/features/inventory/stockVoucherData.ts');
  await assert.rejects(() => loadVoucherWarehouses(new AbortController().signal), error => error.code === 'warehouse_list_incomplete');
});

test('warehouse choice does not fall back to another warehouse or depend on map publication', () => {
  const { selectVoucherWarehouse } = modules(async () => {})('src/features/inventory/stockVoucherData.ts');
  const a = { id: 'a', isActive: true }, b = { id: 'b', isActive: true };
  assert.equal(selectVoucherWarehouse([a], ''), a);
  assert.equal(selectVoucherWarehouse([a, b], ''), undefined);
  assert.equal(selectVoucherWarehouse([a, b], 'b'), b);
  assert.equal(selectVoucherWarehouse([a, b], 'missing'), undefined);
  assert.equal(selectVoucherWarehouse([{ ...a, isActive: false }], 'a'), undefined);
});

test('draft creation requires the actual voucher permission and the read routes remain Staff/Admin only', () => {
  const { canReadVouchers, canCreateVoucher } = modules(async () => {})('src/features/inventory/stockVoucherData.ts');
  const session = { role: 'STAFF', permissions: ['warehouse.read'] };
  assert.equal(canReadVouchers(session), true); assert.equal(canCreateVoucher(session), false);
  assert.equal(canCreateVoucher({ ...session, permissions: [...session.permissions, 'voucher.write'] }), true);
  assert.equal(canReadVouchers({ ...session, role: 'TECHNICIAN' }), false);
  assert.equal(canReadVouchers(null), false);
});

test('draft form limits follow the supported wire contract and unknown writes require reconciliation', () => {
  const { draftValidation, uncertainDraftWrite } = modules(async () => {})('src/features/inventory/stockVoucherData.ts');
  assert.equal(draftValidation('a'.repeat(100), 'b'.repeat(500)), null);
  assert.ok(draftValidation('a'.repeat(101), ''));
  assert.ok(draftValidation('', 'b'.repeat(501)));
  for (const status of [0, 500, 502, 503]) assert.equal(uncertainDraftWrite(new ApiError(status)), true);
  for (const status of [400, 401, 403, 409]) assert.equal(uncertainDraftWrite(new ApiError(status)), false);
});
