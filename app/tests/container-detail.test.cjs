const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const load = createLoader();
const {
  formatContainerLocation,
  canMoveContainer,
  canRecoverContainer,
  matchesRecordedShelf,
} = load('src/features/inventory/containerDetailData.ts');

const places = {
  locations: [
    { id: 'loc-1', code: 'SHELF-A-1', name: 'Shelf A1', endpointId: 'ep-a1', endpointCode: 'EP-A1' },
  ],
  name(key, fallback = '—') {
    if (key === 'ep-in') return 'Inbound Gate 1';
    return fallback;
  },
  areasOf(key) {
    if (key === 'ep-a1') return [{ id: 'z1', code: 'ZONE-AREA-A', name: 'Zone A' }];
    return [];
  },
};

test('formatContainerLocation resolves shelf name, level, endpoint fallback, and areas', () => {
  const shelved = formatContainerLocation({
    status: 'STORED',
    currentStorageLocationCode: 'SHELF-A-1',
    currentStorageLocationName: 'Old Name',
    currentEndpointId: null,
    currentLevelNo: 2,
  }, places);
  assert.equal(shelved.primary, 'Shelf A1 · Level 2');
  assert.equal(shelved.shelfCode, 'SHELF-A-1');
  assert.equal(shelved.isOnShelf, true);
  assert.equal(shelved.areas.length, 1);
  assert.equal(shelved.areas[0].name, 'Zone A');

  const atStation = formatContainerLocation({
    status: 'CREATED',
    currentStorageLocationCode: null,
    currentEndpointId: 'ep-in',
    currentLevelNo: null,
  }, places);
  assert.equal(atStation.primary, 'Inbound Gate 1');
  assert.equal(atStation.isOnShelf, false);

  const issued = formatContainerLocation({
    status: 'ISSUED',
    currentStorageLocationCode: null,
    currentEndpointId: null,
    currentLevelNo: null,
  }, places);
  assert.equal(issued.primary, 'Issued');

  const unlocated = formatContainerLocation({
    status: 'HOLD',
    currentStorageLocationCode: null,
    currentEndpointId: null,
    currentLevelNo: null,
  }, places);
  assert.equal(unlocated.primary, 'Not on a shelf');
});

test('canMoveContainer and canRecoverContainer enforce status, transport, and permission guards', () => {
  assert.equal(canMoveContainer({ status: 'STORED', currentStorageLocationId: 'loc-1', inActiveTransport: false }, true), true);
  assert.equal(canMoveContainer({ status: 'STORED', currentStorageLocationId: 'loc-1', inActiveTransport: true }, true), false);
  assert.equal(canMoveContainer({ status: 'STORED', currentStorageLocationId: 'loc-1', inActiveTransport: false }, false), false);
  assert.equal(canMoveContainer({ status: 'IN_TRANSIT', currentStorageLocationId: 'loc-1', inActiveTransport: false }, true), false);

  assert.equal(canRecoverContainer({ status: 'HOLD', inActiveTransport: false }, true), true);
  assert.equal(canRecoverContainer({ status: 'IN_TRANSIT', inActiveTransport: false }, true), true);
  assert.equal(canRecoverContainer({ status: 'IN_TRANSIT', inActiveTransport: true }, true), false);
  assert.equal(canRecoverContainer({ status: 'STORED', inActiveTransport: false }, true), false);
  assert.equal(canRecoverContainer({ status: 'HOLD', inActiveTransport: false }, false), false);
});

test('matchesRecordedShelf compares scanned shelf or endpoint codes case-insensitively', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(matchesRecordedShelf('SHELF-A-1', 'shelf-a-1', places.locations))),
    { scannedLabel: 'SHELF-A-1', ok: true },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(matchesRecordedShelf('SHELF-A-1', 'ep-a1', places.locations))),
    { scannedLabel: 'SHELF-A-1', ok: true },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(matchesRecordedShelf('SHELF-A-1', 'SHELF-B-2', places.locations))),
    { scannedLabel: 'SHELF-B-2', ok: false },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(matchesRecordedShelf(null, 'SHELF-A-1', places.locations))),
    { scannedLabel: 'SHELF-A-1', ok: false },
  );
});
