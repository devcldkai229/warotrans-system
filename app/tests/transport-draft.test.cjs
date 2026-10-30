const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-module.cjs')();
const { mappedLocations, stationPoints, containerOrigin, transportDestinations, containerReadiness,
  activeContainerIds, movementDetail, validateMovementFields } = load('src/features/transport/transportDraft.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const ep = (id, code, type = 'WAYPOINT', map = 'map') => ({ id, code, name: code, endpointType: type, mapVersionId: map, isEnabled: true });
const endpoints = [ep('in', 'EP-INBOUND'), ep('out', 'EP-OUTBOUND'), ep('rack', 'EP-SHELF-1'), ep('rack2', 'EP-SHELF-2'), ep('charge', 'EP-CHARGER', 'CHARGER'), ep('park', 'EP-PARK', 'PARK'), ep('old', 'EP-OLD-SHELF', 'WAYPOINT', 'old-map')];
const loc = (id, endpointId, warehouseId = 'warehouse') => ({ id, endpointId, warehouseId, code: id, name: id, isActive: true });
const locations = mappedLocations([loc('staging', 'in'), loc('shelf', 'rack'), loc('shelf2', 'rack2'), loc('old-location', 'old'), loc('other-warehouse', 'rack', 'other'), loc('charger', 'charge')], endpoints, 'warehouse', 'map');
const container = { id: 'ctn', barcode: 'CTN-1', status: 'PACKED', currentStorageLocationId: null, currentEndpointId: null, currentLevelNo: null };

test('unlocated DB containers never become inbound just because a station hint exists', () => {
  assert.equal(stationPoints(endpoints, 'map', 'INBOUND').length, 1);
  assert.equal(containerOrigin(container, locations, endpoints, 'map'), null);
  assert.equal(containerReadiness(container, 'inbound', null, new Set(), ['in']), 'Location Required');
  const received = { ...container, currentStorageLocationId: 'staging' };
  const origin = containerOrigin(received, locations, endpoints, 'map');
  assert.equal(origin.endpointId, 'in');
  assert.equal(containerReadiness(received, 'inbound', origin, new Set(), ['in']), null);
  assert.equal(containerReadiness(received, 'inbound', origin, new Set(), ['another-inbound']), 'At Another Location');
});

test('map/warehouse identity and conflicting endpoint/location data cannot be silently rewritten', () => {
  assert.equal(locations.some(x => x.id === 'old-location' || x.id === 'other-warehouse'), false);
  assert.equal(containerOrigin({ ...container, currentStorageLocationId: 'old-location', currentEndpointId: 'in' }, locations, endpoints, 'map'), null);
  assert.equal(containerOrigin({ ...container, currentStorageLocationId: 'staging', currentEndpointId: 'rack' }, locations, endpoints, 'map'), null);
  assert.equal(containerReadiness({ ...container, status: 'STORED' }, 'outbound', { endpointId: 'park', locationId: null }, new Set(), []), 'Storage Location Required');
});

test('putaway offers real mapped storage locations, not chargers, parking, staging or old map targets', () => {
  assert.deepEqual(plain(transportDestinations('inbound', locations, endpoints, 'map').map(x => x.id)), ['shelf', 'shelf2']);
  assert.deepEqual(plain(transportDestinations('outbound', locations, endpoints, 'map').map(x => x.endpointId)), ['out']);
  assert.deepEqual(plain(transportDestinations('inbound', [], endpoints, 'map')), []);
});

test('active detail conflicts stay blocked even when the parent request aggregate says completed', () => {
  const held = activeContainerIds([{ status: 'COMPLETED', details: [{ containerId: 'ctn', status: 'IN_PROGRESS' }, { containerId: 'free', status: 'COMPLETED' }] }]);
  assert.equal(held.has('ctn'), true); assert.equal(held.has('free'), false);
  assert.equal(containerReadiness(container, 'inbound', null, held, ['in']), 'Already In A Request');
});

test('movement uses actual storage/endpoint identities, never an invented level or pickup override', () => {
  const source = containerOrigin({ ...container, currentStorageLocationId: 'staging', currentLevelNo: 2 }, locations, endpoints, 'map');
  const target = transportDestinations('inbound', locations, endpoints, 'map')[0];
  const detail = movementDetail({ ...container, currentLevelNo: 2 }, source, target, 1);
  assert.equal(detail.sourceStorageLocationId, 'staging'); assert.equal(detail.sourceLevelNo, 2);
  assert.equal(detail.destinationStorageLocationId, 'shelf'); assert.equal(detail.destinationEndpointId, 'rack');
  assert.equal(detail.destinationLevelNo, null);
  assert.throws(() => movementDetail(container, null, target, 1), /known location/);
  assert.throws(() => movementDetail(container, source, { ...target, endpointId: source.endpointId }, 1), /different destination/);
  assert.throws(() => validateMovementFields([{ key: 'destination.levelNo', label: 'Destination Level', required: true }], [detail]), /location data is not available/);
  assert.doesNotThrow(() => validateMovementFields([{ key: 'destination.levelNo', required: false }], [detail]));
});
