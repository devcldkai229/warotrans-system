const { test } = require('node:test');
const assert = require('node:assert/strict');
const { receivingCount, productForScannedBarcode, receivingLocations, registerReceivingBatch } = require('./load-module.cjs')()('src/features/inventory/receivingData.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('registration count rejects fractions, scientific notation and counts outside the existing batch limit', () => {
  for (const value of ['', '0', '-1', '1.5', '1e1', '11', 'ten']) assert.equal(receivingCount(value), null);
  assert.equal(receivingCount(' 1 '), 1);
  assert.equal(receivingCount('10'), 10);
});
test('scanned product needs a unique exact active catalog match', () => {
  const product = { id: 'p1', sku: 'SKU-1', supplierBarcode: 'BAR-1', isActive: true };
  assert.equal(productForScannedBarcode([product], ' bar-1 '), product);
  assert.equal(productForScannedBarcode([product], 'sku-1'), product);
  assert.equal(productForScannedBarcode([product], 'BAR'), null);
  assert.equal(productForScannedBarcode([{ ...product, isActive: false }], 'BAR-1'), null);
  assert.equal(productForScannedBarcode([product, { ...product, id: 'duplicate' }], 'BAR-1'), null);
});
test('receiving choices exclude another map, warehouse, disabled or non-storage targets', () => {
  const endpoint = { id: 'ep', mapVersionId: 'current-map', endpointType: 'WAYPOINT', isEnabled: true };
  const location = { id: 'loc', warehouseId: 'warehouse', endpointId: 'ep', isActive: true };
  const map = { id: 'current-map', warehouseId: 'warehouse', endpoints: [endpoint] };
  assert.deepEqual(plain(receivingLocations([location], map)), [location]);
  for (const changed of [{ mapVersionId: 'old-map' }, { isEnabled: false }, { endpointType: 'CHARGER' }, { endpointType: 'PARK' }]) {
    assert.equal(receivingLocations([location], { ...map, endpoints: [{ ...endpoint, ...changed }] }).length, 0);
  }
  assert.equal(receivingLocations([{ ...location, warehouseId: 'other' }], map).length, 0);
  assert.equal(receivingLocations([{ ...location, isActive: false }], map).length, 0);
  assert.equal(receivingLocations([location], { ...map, endpoints: [] }).length, 0);
});
test('batch registration keeps confirmed barcodes and stops at first rejection', async () => {
  let requests = 0;
  const failure = new Error('server rejected');
  const result = await registerReceivingBatch(3, async () => { requests++; if (requests === 2) throw failure; return { barcode: 'CTN-REAL-1' }; });
  assert.deepEqual(plain(result.barcodes), ['CTN-REAL-1']);
  assert.equal(result.error, failure);
  assert.equal(requests, 2);
  const empty = await registerReceivingBatch(1, async () => { throw failure; });
  assert.equal(empty.barcodes.length, 0);
  assert.equal(empty.error, failure);
  await assert.rejects(() => registerReceivingBatch(0, async () => { requests++; }), /between 1 and 10/);
  assert.equal(requests, 2);
});
