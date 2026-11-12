const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const product = (overrides = {}) => ({ id: 'product-1', categoryId: 'category', sku: 'SKU-1', supplierBarcode: 'BAR-1',
  name: 'Product One', description: null, isActive: true, ...overrides });
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function load(apiFetch) { return createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError } }); }
function lookup(apiFetch) { return load(apiFetch)('src/features/inventory/productLookup.ts').lookupReceivingProduct; }

test('resolve sends the verified GET wire names, trims input and passes cancellation to every read', async () => {
  const calls = [], controller = new AbortController();
  const api = load(async (url, init) => { calls.push({ url: new URL(url, 'https://unit.test'), init }); return {}; })('src/shared/api/warehouseApi.ts');
  await api.resolveProduct({ barcode: '  SKU+Case/1  ' }, controller.signal);
  await api.resolveProduct({ search: '  Light Sensor  ' }, controller.signal);
  await api.listProducts({ search: 'SKU+Case/1', isActive: true, take: 100 }, controller.signal);
  await api.listProductCategories(controller.signal);
  assert.equal(calls[0].url.pathname, '/api/warehouse/products/resolve');
  assert.equal(calls[0].url.searchParams.get('barcode'), 'SKU+Case/1');
  assert.equal(calls[1].url.searchParams.get('query'), 'Light Sensor');
  assert.equal(calls[1].url.searchParams.has('search'), false);
  assert.equal(calls[2].url.searchParams.get('isActive'), 'true');
  assert.ok(calls.every(call => call.init.signal === controller.signal && !call.init.method));
});

test('a unique exact barcode uses a fresh resolver and complete catalog, with the latest product metadata', async () => {
  const calls = [], controller = new AbortController();
  const current = product({ name: 'Updated Product Name' });
  const resolve = lookup(async (url, init) => {
    calls.push({ url, signal: init.signal });
    return url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : { items: [current], total: 1 };
  });
  assert.deepEqual(plain(await resolve(' BAR-1 ', controller.signal)), { kind: 'matched', product: current });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.signal === controller.signal));
});

test('SKU scans are supported without a supplier barcode and preserve case', async () => {
  const item = product({ sku: 'Sku-Mixed', supplierBarcode: null });
  let sentCode;
  const resolve = lookup(async url => {
    if (url.includes('/resolve?')) { sentCode = new URL(url, 'https://unit.test').searchParams.get('barcode'); return { exactMatch: item, items: [item] }; }
    return { items: [item], total: 1 };
  });
  assert.equal((await resolve('Sku-Mixed', new AbortController().signal)).product.id, item.id);
  assert.equal(sentCode, 'Sku-Mixed');
});

test('unknown/inactive codes preserve the backend 404 and never fall back to a cached or fuzzy product', async () => {
  let requests = 0;
  const failure = new ApiError(404, 'product_not_found', 'No active product');
  const resolve = lookup(async () => { requests++; throw failure; });
  await assert.rejects(() => resolve('UNKNOWN', new AbortController().signal), error => error === failure);
  assert.equal(requests, 1);
});

test('a barcode matching one SKU and another supplier barcode requires staff choice', async () => {
  const one = product({ sku: 'SAME', supplierBarcode: null });
  const two = product({ id: 'product-2', sku: 'OTHER', supplierBarcode: 'SAME' });
  const resolve = lookup(async url => url.includes('/resolve?') ? { exactMatch: one, items: [one] } : { items: [one, two], total: 2 });
  assert.deepEqual(plain(await resolve('SAME', new AbortController().signal)), { kind: 'choose', reason: 'multiple', products: [one, two] });
});

test('partial catalog results cannot prove uniqueness even if one exact match was returned', async () => {
  for (const items of [[product()], []]) {
    const resolve = lookup(async url => url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : { items, total: 101 });
    const result = await resolve('BAR-1', new AbortController().signal);
    assert.equal(result.kind, 'choose'); assert.equal(result.reason, 'incomplete');
    assert.deepEqual(plain(result.products), items);
  }
});

test('invalid, inactive, fuzzy or mismatched resolver payloads cannot select a product', async () => {
  for (const exactMatch of [null, product({ isActive: false }), product({ supplierBarcode: 'BAR-OTHER' }), product({ supplierBarcode: 'bar-1' })]) {
    let reads = 0;
    const resolve = lookup(async () => { reads++; return { exactMatch, items: exactMatch ? [exactMatch] : [] }; });
    await assert.rejects(() => resolve('BAR-1', new AbortController().signal), error => error.code === 'product_lookup_invalid');
    assert.equal(reads, 1);
  }
});

test('a product changed between resolve and catalog verification must be scanned again', async () => {
  for (const items of [[], [product({ id: 'replacement' })], [product({ isActive: false })]]) {
    const resolve = lookup(async url => url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : { items, total: items.length });
    await assert.rejects(() => resolve('BAR-1', new AbortController().signal), error => error.code === 'product_lookup_changed');
  }
});

test('catalog counts that cannot describe a complete result are rejected', async () => {
  for (const total of [-1, 0, undefined, 1.5]) {
    const resolve = lookup(async url => url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : { items: [product()], total });
    await assert.rejects(() => resolve('BAR-1', new AbortController().signal), error => error.code === 'product_lookup_invalid');
  }
});

test('network/permission failures during verification never become a successful selection', async () => {
  for (const status of [0, 403, 500]) {
    const failure = new ApiError(status, 'lookup_failed', 'Lookup failed');
    const resolve = lookup(async url => { if (url.includes('/resolve?')) return { exactMatch: product(), items: [product()] }; throw failure; });
    await assert.rejects(() => resolve('BAR-1', new AbortController().signal), error => error === failure);
  }
});

test('blank or already-cancelled attempts never issue a request', async () => {
  let reads = 0;
  const resolve = lookup(async () => { reads++; });
  await assert.rejects(() => resolve('  ', new AbortController().signal), error => error.code === 'product_code_required');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => resolve('BAR-1', controller.signal), error => error.name === 'AbortError');
  assert.equal(reads, 0);
});

test('closing during resolve prevents verification or selection even if the transport returns late', async () => {
  const response = deferred(), controller = new AbortController(); let reads = 0;
  const resolve = lookup(async () => { reads++; return response.promise; });
  const pending = resolve('BAR-1', controller.signal);
  controller.abort();
  response.resolve({ exactMatch: product(), items: [product()] });
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(reads, 1);
});

test('closing during catalog verification prevents a late successful lookup result', async () => {
  const response = deferred(), controller = new AbortController();
  const resolve = lookup(async url => url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : response.promise);
  const pending = resolve('BAR-1', controller.signal);
  await new Promise(done => setImmediate(done));
  controller.abort(); response.resolve({ items: [product()], total: 1 });
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('a repeated scan rechecks the backend and does not reuse a product that became inactive', async () => {
  let inactive = false, reads = 0;
  const resolve = lookup(async url => {
    reads++;
    if (inactive) throw new ApiError(404, 'product_not_found', 'Inactive');
    return url.includes('/resolve?') ? { exactMatch: product(), items: [product()] } : { items: [product()], total: 1 };
  });
  assert.equal((await resolve('BAR-1', new AbortController().signal)).kind, 'matched');
  inactive = true;
  await assert.rejects(() => resolve('BAR-1', new AbortController().signal), error => error.code === 'product_not_found');
  assert.equal(reads, 3);
});
