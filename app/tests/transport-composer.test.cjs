const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const load = createLoader();
const plain = value => JSON.parse(JSON.stringify(value));
const data = load('src/features/transport/composerData.ts');
const MAP = 'v14';
const ep = (code, name, extra = {}) => ({ id: `e-${code}`, mapVersionId: MAP, code, name, endpointType: 'WAYPOINT', x: 0, y: 0, yaw: 0, isEnabled: true, ...extra });
const endpoints = [ep('EP-INBOUND', 'Inbound'), ep('EP-OUTBOUND', 'Outbound'), ep('EP-SHELF-A-1', 'Shelf A 1'), ep('EP-SHELF-C-1', 'Shelf C 1'),
  ep('EP-CHARGE', 'Charge', { endpointType: 'CHARGER' }), ep('EP-QUEUE-POINT', 'Queue Point'), ep('EP-OLD', 'Old', { isEnabled: false })];
const locations = [
  { id: 'L-A1', warehouseId: 'w', endpointId: 'e-EP-SHELF-A-1', endpointCode: 'EP-SHELF-A-1', code: 'SHELF-A-1', name: 'Shelf A 1', isActive: true },
  { id: 'L-C1', warehouseId: 'w', endpointId: 'e-EP-SHELF-C-1', endpointCode: 'EP-SHELF-C-1', code: 'SHELF-C-1', name: 'Shelf C 1', isActive: true },
];
const places = data.composerPlaces({ endpoints, locations, mapId: MAP });
const voucher = (type, status = 'CONFIRMED', id = `${type}-1`) => ({ id, code: `PX-${id}`, type, status, createdAt: '2026-11-18T01:00:00Z', confirmedAt: '2026-11-18T02:00:00Z' });
const container = (id, extra = {}) => ({ id, barcode: `CTN-${id}`, status: 'CREATED', productId: 'p', productSku: 'SKU', productName: 'Product',
  currentStorageLocationId: null, currentStorageLocationCode: null, currentEndpointId: null, currentLevelNo: null, ...extra });

test('workflow codes map to the web kinds', () => {
  assert.equal(data.workflowKindOf('INBOUND'), 'INBOUND');
  assert.equal(data.workflowKindOf('OUTBOUND_RETRIEVAL'), 'OUTBOUND');
  assert.equal(data.workflowKindOf('INTERNAL_RELOCATION'), 'INTERNAL');
  assert.equal(data.workflowKindOf('POINT_TO_POINT_TRANSPORT'), 'OTHER');
});

test('inbound offers containers on a confirmed receiving voucher that are not shelved; outbound and relocation follow the backend rules', () => {
  const held = new Set(['busy']);
  const fresh = container('a', { voucher: voucher('INBOUND') });
  const shelved = container('b', { status: 'STORED', currentStorageLocationId: 'L-A1', voucher: voucher('INBOUND') });
  const draft = container('c', { voucher: voucher('INBOUND', 'DRAFT') });
  assert.equal(data.ineligibleReason(fresh, 'INBOUND', held), null);
  assert.equal(data.ineligibleReason(shelved, 'INBOUND', held), 'Already on a shelf');
  assert.equal(data.ineligibleReason(draft, 'INBOUND', held), 'Not on a confirmed receiving voucher');
  assert.equal(data.ineligibleReason(container('busy', { voucher: voucher('INBOUND') }), 'INBOUND', held), 'Already in a transport request');
  const issued = container('d', { status: 'STORED', currentStorageLocationId: 'L-A1', voucher: voucher('OUTBOUND') });
  assert.equal(data.ineligibleReason(issued, 'OUTBOUND', held), null);
  assert.equal(data.ineligibleReason(shelved, 'OUTBOUND', held), 'Not on a confirmed issue voucher');
  assert.equal(data.ineligibleReason(shelved, 'INTERNAL', held), null);
  assert.equal(data.ineligibleReason(fresh, 'INTERNAL', held), 'Not on a shelf');
});

test('containers group by voucher (newest first) for inbound and by shelf name for relocation', () => {
  const older = { ...voucher('INBOUND', 'CONFIRMED', 'old'), confirmedAt: '2026-11-17T00:00:00Z' };
  const groups = data.groupContainers([container('a', { voucher: older }), container('b', { voucher: voucher('INBOUND') }), container('c')], 'INBOUND', () => '');
  assert.deepEqual(plain(groups.map(group => group.key)), ['INBOUND-1', 'old', 'other']);
  const shelves = data.groupContainers([container('x', { currentStorageLocationId: 'L-C1' }), container('y', { currentStorageLocationId: 'L-A1' })], 'INTERNAL',
    id => places.find(place => place.storageLocationId === id).name);
  assert.deepEqual(plain(shelves.map(group => group.title)), ['Shelf A 1', 'Shelf C 1']);
});

test('places are shelves by their name, then stations; chargers, queue points and disabled endpoints are left out', () => {
  assert.deepEqual(plain(places.map(place => `${place.kind}:${place.name}`)), ['location:Shelf A 1', 'location:Shelf C 1', 'endpoint:Inbound', 'endpoint:Outbound']);
  assert.deepEqual(plain(data.searchPlaces(places, "shelf-c").map(place => place.name)), ['Shelf C 1']);
  assert.deepEqual(plain(data.suggestedPlaces("OUTBOUND", "destination", places).map(place => place.name)), ['Outbound']);
});

test('defaults: inbound starts at the only receiving point, outbound ends at the only shipping point, a shelved container starts at its shelf', () => {
  assert.equal(data.defaultSource(container('a'), 'INBOUND', places).name, 'Inbound');
  assert.equal(data.defaultSource(container('b', { currentStorageLocationId: 'L-C1' }), 'INTERNAL', places).name, 'Shelf C 1');
  assert.equal(data.defaultDestination('OUTBOUND', places).name, 'Outbound');
  assert.equal(data.defaultDestination('INBOUND', places), null);
});

test('request details carry shelf and endpoint ids in selection order and refuse an unfinished trip', () => {
  const a = container('a');
  const b = container('b', { status: 'STORED', currentStorageLocationId: 'L-C1', currentLevelNo: 2 });
  const shelfA = places.find(place => place.name === 'Shelf A 1');
  const shelfC = places.find(place => place.name === 'Shelf C 1');
  const inbound = places.find(place => place.name === 'Inbound');
  const details = data.buildDetails([a, b], { a: { source: inbound, destination: shelfA }, b: { source: shelfC, destination: shelfA } });
  assert.deepEqual(JSON.parse(JSON.stringify(details)), [
    { sequenceNo: 1, containerId: 'a', sourceStorageLocationId: null, sourceEndpointId: 'e-EP-INBOUND', sourceLevelNo: null,
      destinationStorageLocationId: 'L-A1', destinationEndpointId: 'e-EP-SHELF-A-1', destinationLevelNo: null },
    { sequenceNo: 2, containerId: 'b', sourceStorageLocationId: 'L-C1', sourceEndpointId: 'e-EP-SHELF-C-1', sourceLevelNo: 2,
      destinationStorageLocationId: 'L-A1', destinationEndpointId: 'e-EP-SHELF-A-1', destinationLevelNo: null },
  ]);
  assert.throws(() => data.buildDetails([a], { a: { source: inbound, destination: null } }), /CTN-a: Choose where to deliver it/);
  assert.throws(() => data.buildDetails([a], { a: { source: shelfA, destination: shelfA } }), /must differ/);
});
