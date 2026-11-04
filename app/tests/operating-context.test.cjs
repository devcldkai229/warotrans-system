const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const warehouse = id => ({ id, isActive: true });
const map = (id, warehouseId, versionNo, publishedAt, status = 'PUBLISHED') => ({ id, warehouseId, versionNo, publishedAt, createdAt: publishedAt, status });
function load(warehouses, maps) {
  return createLoader({
    'src/shared/api/warehouseApi.ts': { listWarehouses: warehouses },
    'src/shared/api/navigationApi.ts': { getActiveMapVersion: maps },
  })('src/shared/api/operatingContextApi.ts');
}

test('Home and inventory automatically choose the latest published map across legacy warehouses', async () => {
  const api = load(async () => ({ items: [warehouse('legacy'), warehouse('current')], total: 2 }), async id => id === 'legacy'
    ? map('v1', id, 1, '2026-10-16T00:00:00Z')
    : map('v18', id, 18, '2026-10-25T09:07:32Z'));
  const context = await api.getOperatingContext();
  assert.equal(context.warehouse.id, 'current');
  assert.equal(context.map.id, 'v18');
});

test('backend active-map is authoritative and unpublished or mismatched maps are rejected', async () => {
  const api = load(async () => ({ items: [warehouse('sim')], total: 1 }), async () => map('be-active', 'sim', 18, '2026-10-25T00:00:00Z'));
  assert.equal((await api.getOperatingContext()).map.id, 'be-active');
  assert.equal(api.latestPublishedContext([{ warehouse: warehouse('sim'), map: map('draft', 'sim', 19, '2026-10-27', 'DRAFT') }]), null);
  assert.equal(api.latestPublishedContext([{ warehouse: warehouse('sim'), map: map('wrong-warehouse', 'other', 20, '2026-10-27') }]), null);
});

test('all warehouse pages are checked and repeat retains its warehouse identity', async () => {
  const calls = [];
  const api = load(async ({ skip, take }) => {
    calls.push({ skip, take });
    return { items: [warehouse(skip === 0 ? 'old' : 'new')], total: 2 };
  }, async id => map(id, id, id === 'old' ? 1 : 18, id === 'old' ? '2026-10-01' : '2026-10-25'));
  assert.equal((await api.getOperatingContext()).warehouse.id, 'new');
  assert.equal(calls[1].skip, 1);
  assert.equal(calls[0].take, 100);
  assert.equal((await api.getOperatingContext('old')).warehouse.id, 'old');
});

test('failed map lookup and missing publication remain errors instead of silently showing a legacy map', async () => {
  const api = load(async () => ({ items: [warehouse('old'), warehouse('new')], total: 2 }), async id => {
    if (id === 'new') throw new Error('Map API unavailable');
    return map('v1', id, 1, '2026-10-01');
  });
  await assert.rejects(() => api.getOperatingContext(), /Map API unavailable/);
  await assert.rejects(() => load(async () => ({ items: [warehouse('sim')], total: 1 }), async () => null).getOperatingContext(), /No published/);
});
