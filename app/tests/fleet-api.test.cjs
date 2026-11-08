const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const plain = value => JSON.parse(JSON.stringify(value));
function loadFleet(apiFetch) { return createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError } })('src/shared/api/fleetApi.ts'); }

test('online filtering reads all pages, preserves warehouse and abort signal, and returns a filtered total', async () => {
  const signal = new AbortController().signal;
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: String(index), isOnline: index === 100 }));
  const offsets = [];
  const api = loadFleet(async (path, init) => {
    const url = new URL(path, 'https://be.test');
    assert.equal(url.searchParams.has('isOnline'), false);
    assert.equal(url.searchParams.get('warehouseId'), 'warehouse');
    assert.equal(url.searchParams.get('take'), '100');
    assert.equal(init.signal, signal);
    const skip = Number(url.searchParams.get('skip'));
    offsets.push(skip);
    return { items: rows.slice(skip, skip + 100), total: rows.length };
  });
  const response = await api.listRobots({ warehouseId: 'warehouse', isOnline: true }, signal);
  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(plain(response), { items: [{ id: '100', isOnline: true }], total: 1 });
});
test('offline filtering returns only false values and does not treat unknown connectivity as offline', async () => {
  const api = loadFleet(async path => {
    assert.equal(new URL(path, 'https://be.test').searchParams.has('isOnline'), false);
    return { items: [{ id: 'off', isOnline: false }, { id: 'on', isOnline: true }, { id: 'unknown' }], total: 3 };
  });
  assert.deepEqual(plain(await api.listRobots({ isOnline: false })), { items: [{ id: 'off', isOnline: false }], total: 1 });
});
test('an incomplete page cannot silently turn into a filtered empty fleet', async () => {
  const api = loadFleet(async () => ({ items: [], total: 1 }));
  await assert.rejects(() => api.listRobots({ isOnline: true }), error => error.code === 'fleet_list_incomplete');
});
test('unfiltered reads retain the BE total and default route', async () => {
  const api = loadFleet(async path => {
    assert.equal(path, '/api/fleet/robots');
    return { items: [{ id: 'first' }], total: 103 };
  });
  assert.deepEqual(plain(await api.listRobots()), { items: [{ id: 'first' }], total: 103 });
});
