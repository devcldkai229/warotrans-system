const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

function loadWarehouse(apiFetch) {
  return createLoader({ 'src/shared/api/client.ts': { apiFetch, ApiError: Error } })('src/shared/api/warehouseApi.ts');
}

test('inventory stock reads preserve server paging, search, counts and total', async () => {
  let url;
  const response = { items: [{ id: 'row', containerCount: 7, levelNo: 5 }], total: 240 };
  const api = loadWarehouse(async path => { url = path; return response; });
  const actual = await api.listInventory({ warehouseId: 'warehouse', search: 'SKU A', skip: 200, take: 200 });
  const parsed = new URL(url, 'https://example.test');
  assert.equal(parsed.pathname, '/api/warehouse/inventory');
  assert.equal(parsed.searchParams.get('warehouseId'), 'warehouse');
  assert.equal(parsed.searchParams.get('search'), 'SKU A');
  assert.equal(parsed.searchParams.get('skip'), '200');
  assert.equal(parsed.searchParams.get('take'), '200');
  assert.deepEqual(plain(actual), response);
});

test('inventory container browse can include reserved, transit and held statuses', async () => {
  let url;
  const api = loadWarehouse(async path => { url = path; return { items: [], total: 900 }; });
  const response = await api.listContainers({ warehouseId: 'warehouse', eligibleOnly: false, take: 500, search: 'supplier' });
  const parsed = new URL(url, 'https://example.test');
  assert.equal(parsed.searchParams.get('eligibleOnly'), 'false');
  assert.equal(parsed.searchParams.get('take'), '500');
  assert.equal(response.total, 900);
});

test('barcode detail lookup trims and encodes the code without inventing an endpoint', async () => {
  let url;
  const detail = { id: 'container', barcode: 'BOX/#1', currentStorageLocationId: 'location', currentLevelNo: 4 };
  const api = loadWarehouse(async path => { url = path; return detail; });
  const result = await api.getContainerByBarcode(' BOX/#1 ');
  assert.equal(url, '/api/warehouse/containers/by-barcode/BOX%2F%231');
  assert.equal(result.currentStorageLocationId, 'location');
  assert.equal(result.currentLevelNo, 4);
  assert.equal(result.currentEndpointId, null);
});

test('barcode detail errors remain errors even after a successful container list', async () => {
  const error = new Error('Registry unavailable');
  const api = loadWarehouse(async path => {
    if (path.includes('by-barcode')) throw error;
    return { items: [{ id: 'container', barcode: 'BOX' }], total: 1 };
  });
  await api.listContainers({ warehouseId: 'warehouse' });
  await assert.rejects(() => api.getContainerByBarcode('BOX'), error);
});

test('By SKU sums InventoryStock.ContainerCount and keeps distinct products and locations', () => {
  const group = createLoader()('src/features/inventory/inventoryData.ts').groupInventoryByProduct;
  const rows = [
    { id: 'stock-1', productId: 'product-1', productSku: 'SKU', productName: 'Product 1', containerCount: 8, levelNo: 1 },
    { id: 'stock-2', productId: 'product-1', productSku: 'SKU', productName: 'Product 1', containerCount: 3, levelNo: 5 },
    { id: 'stock-3', productId: 'product-2', productSku: 'SKU', productName: 'Product 2', containerCount: 0, levelNo: 1 },
  ];
  const result = group(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].containerCount, 11);
  assert.deepEqual(plain(result[0].locations), rows.slice(0, 2));
  assert.equal(result[1].containerCount, 0);
  assert.deepEqual(plain(group([])), []);
});

test('location filters use returned storage and endpoint identities for map3 shelves', () => {
  const { containerLocationFilters, getContainerLocation } = createLoader()('src/features/inventory/inventoryData.ts');
  const shelves = [
    { currentStorageLocationId: 'shelf-1', currentStorageLocationCode: 'SHELF-01', currentEndpointId: 'endpoint-1' },
    { currentStorageLocationId: 'shelf-1', currentStorageLocationCode: 'SHELF-01', currentEndpointId: 'endpoint-1' },
    { currentStorageLocationId: 'shelf-2', currentStorageLocationCode: 'SHELF-02', currentEndpointId: 'endpoint-2' },
    { currentStorageLocationId: null, currentStorageLocationCode: null, currentEndpointId: 'dock', currentEndpointCode: 'DOCK-01' },
    { currentStorageLocationId: null, currentStorageLocationCode: null, currentEndpointId: null },
  ];
  assert.deepEqual(plain(containerLocationFilters(shelves)), [
    { key: 'ALL', label: 'All Locations', count: 5 },
    { key: 'storage:shelf-1', label: 'SHELF-01', count: 2 },
    { key: 'storage:shelf-2', label: 'SHELF-02', count: 1 },
    { key: 'endpoint:dock', label: 'DOCK-01', count: 1 },
    { key: 'UNLOCATED', label: 'Unlocated', count: 1 },
  ]);
  assert.equal(getContainerLocation({ currentStorageLocationId: 'actual-location', currentStorageLocationCode: 'RACK-A-01', zoneLabel: 'Zone B' }).key, 'storage:actual-location');
  assert.deepEqual(plain(containerLocationFilters([])), [{ key: 'ALL', label: 'All Locations', count: 0 }]);
});
