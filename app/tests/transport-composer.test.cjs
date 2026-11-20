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

test('inbound offers containers on a confirmed receiving voucher that are not shelved; outbound and relocation take free stored shelf containers without needing an outbound voucher', () => {
  const held = new Set(['busy']);
  const fresh = container('a', { voucher: voucher('INBOUND') });
  const shelved = container('b', { status: 'STORED', currentStorageLocationId: 'L-A1', voucher: voucher('INBOUND') });
  const shelvedNoVoucher = container('b2', { status: 'STORED', currentStorageLocationId: 'L-A1', voucher: null });
  const draft = container('c', { voucher: voucher('INBOUND', 'DRAFT') });
  assert.equal(data.ineligibleReason(fresh, 'INBOUND', held), null);
  assert.equal(data.ineligibleReason(shelved, 'INBOUND', held), 'Already on a shelf');
  assert.equal(data.ineligibleReason(draft, 'INBOUND', held), 'Not on a confirmed receiving voucher');
  assert.equal(data.ineligibleReason(container('busy', { voucher: voucher('INBOUND') }), 'INBOUND', held), 'Already in a transport request');
  const issued = container('d', { status: 'STORED', currentStorageLocationId: 'L-A1', voucher: voucher('OUTBOUND') });
  assert.equal(data.ineligibleReason(shelvedNoVoucher, 'OUTBOUND', held), null);
  assert.equal(data.ineligibleReason(shelved, 'OUTBOUND', held), null);
  assert.equal(data.ineligibleReason(issued, 'OUTBOUND', held), null);
  assert.equal(data.ineligibleReason(fresh, 'OUTBOUND', held), 'Not on a shelf');
  assert.equal(data.ineligibleReason(container('busy', { status: 'STORED', currentStorageLocationId: 'L-A1' }), 'OUTBOUND', held), 'Already in a transport request');
  assert.equal(data.ineligibleReason({ ...shelvedNoVoucher, inActiveTransport: true }, 'OUTBOUND', held), 'Already in a transport request');
  assert.equal(data.ineligibleReason(shelved, 'INTERNAL', held), null);
  assert.equal(data.ineligibleReason(fresh, 'INTERNAL', held), 'Not on a shelf');
});

test('containers group by voucher (newest first) for inbound and by shelf name for outbound and relocation', () => {
  const older = { ...voucher('INBOUND', 'CONFIRMED', 'old'), confirmedAt: '2026-11-17T00:00:00Z' };
  const groups = data.groupContainers([container('a', { voucher: older }), container('b', { voucher: voucher('INBOUND') }), container('c')], 'INBOUND', () => '');
  assert.deepEqual(plain(groups.map(group => group.key)), ['INBOUND-1', 'old', 'other']);
  const outboundShelves = data.groupContainers([
    container('x', { status: 'STORED', currentStorageLocationId: 'L-C1' }),
    container('y', { status: 'STORED', currentStorageLocationId: 'L-A1' }),
  ], 'OUTBOUND', id => places.find(place => place.storageLocationId === id).name);
  assert.deepEqual(plain(outboundShelves.map(group => group.title)), ['Shelf A 1', 'Shelf C 1']);
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

test('outbound auto-fills single gate, requires one TR gate choice when multiple exist, and never falls back when shelf is missing from map', () => {
  const twoGatePlaces = data.composerPlaces({
    endpoints: [...endpoints, ep('EP-OUTBOUND-2', 'Outbound 2')],
    locations,
    mapId: MAP,
  });
  assert.deepEqual(plain(data.outboundGates(places).map(gate => gate.code)), ['EP-OUTBOUND']);
  assert.deepEqual(plain(data.outboundGates(twoGatePlaces).map(gate => gate.code)), ['EP-OUTBOUND', 'EP-OUTBOUND-2']);
  assert.equal(data.defaultDestination('OUTBOUND', places).code, 'EP-OUTBOUND');
  assert.equal(data.defaultDestination('OUTBOUND', twoGatePlaces), null);

  // Stored container without any outbound voucher resolves real shelf source and builds valid outbound TR detail
  const storedWithoutVoucher = container('no-voucher', {
    status: 'STORED',
    currentStorageLocationId: 'L-A1',
    currentEndpointId: 'e-EP-SHELF-A-1',
    currentLevelNo: 3,
    voucher: null,
  });
  const gate1 = data.outboundGates(twoGatePlaces)[0];
  const src = data.defaultSource(storedWithoutVoucher, 'OUTBOUND', twoGatePlaces);
  assert.equal(src.code, 'SHELF-A-1');
  assert.equal(data.outboundMovementProblem({ source: src, destination: gate1 }, true), null);
  const outboundDetail = data.buildDetails([storedWithoutVoucher], { 'no-voucher': { source: src, destination: gate1 } });
  assert.deepEqual(plain(outboundDetail), [{
    sequenceNo: 1,
    containerId: 'no-voucher',
    sourceStorageLocationId: 'L-A1',
    sourceEndpointId: 'e-EP-SHELF-A-1',
    sourceLevelNo: 3,
    destinationStorageLocationId: null,
    destinationEndpointId: 'e-EP-OUTBOUND',
    destinationLevelNo: null,
  }]);

  // Validation messages & missing active shelf guard
  assert.equal(
    data.defaultSource({ ...storedWithoutVoucher, currentStorageLocationId: 'L-INACTIVE', currentEndpointId: 'e-EP-INBOUND' }, 'OUTBOUND', places),
    null,
  );
  assert.equal(data.outboundMovementProblem({ source: null, destination: gate1 }, true), 'Location Unavailable On This Map');
  assert.equal(data.outboundMovementProblem({ source: src, destination: null }, true), 'Choose an outbound gate');
  assert.equal(data.outboundMovementProblem({ source: src, destination: null }, false), 'No outbound point is configured on this map.');
  assert.equal(data.outboundMovementProblem({ source: src, destination: src }, true), 'Pick-up and delivery must differ');
});

test('legacy StorageLocations bound to Inbound or Outbound gate endpoints stay gates on both single-gate and multi-gate maps', () => {
  const legacySinglePlaces = data.composerPlaces({
    endpoints,
    locations: [
      ...locations,
      { id: 'L-LEGACY-IN', warehouseId: 'w', endpointId: 'e-EP-INBOUND', endpointCode: 'EP-INBOUND', code: 'LOC-IN', name: 'Inbound Stage', isActive: true },
      { id: 'L-LEGACY-OUT', warehouseId: 'w', endpointId: 'e-EP-OUTBOUND', endpointCode: 'EP-OUTBOUND', code: 'LOC-OUT', name: 'Outbound Stage', isActive: true },
    ],
    mapId: MAP,
  });
  assert.deepEqual(plain(data.inboundGates(legacySinglePlaces).map(gate => [gate.code, gate.kind, gate.storageLocationId])), [['EP-INBOUND', 'endpoint', null]]);
  assert.deepEqual(plain(data.outboundGates(legacySinglePlaces).map(gate => [gate.code, gate.kind, gate.storageLocationId])), [['EP-OUTBOUND', 'endpoint', null]]);
  assert.deepEqual(plain(data.suggestedPlaces('INBOUND', 'destination', legacySinglePlaces).map(place => place.code)), ['SHELF-A-1', 'SHELF-C-1']);
  assert.equal(data.defaultSource(container('legacy-in', { status: 'CREATED', currentStorageLocationId: 'L-LEGACY-IN', currentEndpointId: 'e-EP-INBOUND' }), 'INBOUND', legacySinglePlaces).code, 'EP-INBOUND');
  assert.equal(data.defaultDestination('OUTBOUND', legacySinglePlaces).code, 'EP-OUTBOUND');
  assert.equal(data.placeForEndpoint(legacySinglePlaces, 'e-EP-OUTBOUND').kind, 'endpoint');

  const multiEndpoints = [...endpoints, ep('EP-INBOUND-2', 'Inbound 2'), ep('EP-OUTBOUND-2', 'Outbound 2')];
  const legacyMultiPlaces = data.composerPlaces({
    endpoints: multiEndpoints,
    locations: [
      ...locations,
      { id: 'L-IN-1', warehouseId: 'w', endpointId: 'e-EP-INBOUND', endpointCode: 'EP-INBOUND', code: 'IN-1', name: 'Inbound 1', isActive: true },
      { id: 'L-IN-2', warehouseId: 'w', endpointId: 'e-EP-INBOUND-2', endpointCode: 'EP-INBOUND-2', code: 'IN-2', name: 'Inbound 2', isActive: true },
      { id: 'L-OUT-1', warehouseId: 'w', endpointId: 'e-EP-OUTBOUND', endpointCode: 'EP-OUTBOUND', code: 'OUT-1', name: 'Outbound 1', isActive: true },
      { id: 'L-OUT-2', warehouseId: 'w', endpointId: 'e-EP-OUTBOUND-2', endpointCode: 'EP-OUTBOUND-2', code: 'OUT-2', name: 'Outbound 2', isActive: true },
    ],
    mapId: MAP,
  });
  assert.deepEqual(plain(data.inboundGates(legacyMultiPlaces).map(gate => gate.code)), ['EP-INBOUND', 'EP-INBOUND-2']);
  assert.deepEqual(plain(data.outboundGates(legacyMultiPlaces).map(gate => gate.code)), ['EP-OUTBOUND', 'EP-OUTBOUND-2']);
  assert.equal(data.defaultSource(container('multi-in'), 'INBOUND', legacyMultiPlaces), null);
  assert.equal(data.defaultDestination('OUTBOUND', legacyMultiPlaces), null);
});
