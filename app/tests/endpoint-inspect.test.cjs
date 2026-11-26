const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const load = createLoader();
const {
  endpointKindLabel,
  findStorageLocationForEndpoint,
  summarizeShelfSlots,
  findRobotAtEndpoint,
  resolveEndpointInspection,
} = load('src/shared/maps/endpointInspect.ts');

const baseEndpoint = (overrides = {}) => ({
  id: 'ep-1',
  mapVersionId: 'map-1',
  code: 'SHELF-A-1',
  name: 'Shelf A1',
  endpointType: 'WAYPOINT',
  x: 10,
  y: 5,
  yaw: 0,
  isEnabled: true,
  ...overrides,
});

const baseLocation = (overrides = {}) => ({
  id: 'loc-1',
  warehouseId: 'wh-1',
  endpointId: 'ep-1',
  endpointCode: 'SHELF-A-1',
  code: 'SHELF-A-1',
  name: 'Shelf A1',
  zone: 'ZONE_A',
  zoneLabel: 'Zone A',
  isActive: true,
  shelfSlots: [
    { levelNo: 2, status: 'AVAILABLE', occupiedByBarcode: null },
    { levelNo: 1, status: 'OCCUPIED', occupiedByBarcode: 'C181126001', occupiedBySku: 'SKU-1', occupiedByProductName: 'Box' },
  ],
  ...overrides,
});

const baseRobot = (overrides = {}) => ({
  id: 'r-1',
  code: 'AMR-01',
  currentMapVersionId: 'map-1',
  isOnline: true,
  status: 'CHARGING',
  batteryPercent: 72,
  poseX: 10.2,
  poseY: 5.1,
  lastTelemetryAt: '2026-11-26T10:00:00Z',
  ...overrides,
});

test('endpointKindLabel humanizes every operational visual kind', () => {
  assert.equal(endpointKindLabel('SHELF'), 'Shelf');
  assert.equal(endpointKindLabel('INBOUND'), 'Inbound Gate');
  assert.equal(endpointKindLabel('OUTBOUND'), 'Outbound Gate');
  assert.equal(endpointKindLabel('CHARGER'), 'Charging Station');
  assert.equal(endpointKindLabel('INSPECTION'), 'Inspection Point');
  assert.equal(endpointKindLabel('PARK'), 'Parking');
  assert.equal(endpointKindLabel('WAIT'), 'Wait Point');
  assert.equal(endpointKindLabel('WAYPOINT'), 'Waypoint');
});

test('shelf inspection summarizes sorted levels and gates actions by permissions and occupancy', () => {
  const endpoint = baseEndpoint();
  const location = baseLocation();
  const matched = findStorageLocationForEndpoint(endpoint, [location]);
  assert.equal(matched.id, 'loc-1');

  const summary = summarizeShelfSlots(matched);
  assert.equal(summary.total, 2);
  assert.equal(summary.occupied, 1);
  assert.equal(summary.available, 1);
  assert.deepEqual(Array.from(summary.occupiedBarcodes), ['C181126001']);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.slots.map(s => s.levelNo))), [1, 2]);

  const staffView = resolveEndpointInspection({
    endpoint,
    robots: [],
    locations: [location],
    areas: [{ id: 'a-1', code: 'ZONE-AREA-A', name: 'Zone A' }],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: false,
      isTechnicalRole: false,
    },
  });
  assert.equal(staffView.kindLabel, 'Shelf');
  assert.equal(staffView.showTechCoords, false);
  assert.equal(staffView.primaryAction.kind, 'view_shelf_stock');
  assert.equal(staffView.secondaryAction.kind, 'move_from_shelf');
  assert.deepEqual(Array.from(staffView.areaNames), ['Zone A']);

  const emptyShelfView = resolveEndpointInspection({
    endpoint,
    robots: [],
    locations: [baseLocation({ shelfSlots: [{ levelNo: 1, status: 'AVAILABLE' }] })],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: false,
      isTechnicalRole: true,
    },
  });
  assert.equal(emptyShelfView.showTechCoords, true);
  assert.equal(emptyShelfView.primaryAction.kind, 'view_shelf_stock');
  assert.equal(emptyShelfView.secondaryAction, null);
});

test('charger, park, wait, inbound, outbound, and waypoint apply restrained contextual CTAs', () => {
  const charger = baseEndpoint({ id: 'ep-chg', code: 'CHG-01', name: 'Charger 1', endpointType: 'CHARGER' });
  const nearRobot = baseRobot({ poseX: 10.3, poseY: 5.2 });
  const farRobot = baseRobot({ id: 'r-2', code: 'AMR-02', poseX: 15, poseY: 5 });

  assert.equal(findRobotAtEndpoint(charger, [farRobot, nearRobot]).code, 'AMR-01');
  assert.equal(findRobotAtEndpoint(charger, [farRobot]), null);

  const chargerOccupied = resolveEndpointInspection({
    endpoint: charger,
    robots: [nearRobot],
    locations: [],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: true,
      isTechnicalRole: true,
    },
  });
  assert.equal(chargerOccupied.primaryAction.kind, 'view_robot');
  assert.equal(chargerOccupied.primaryAction.robotCode, 'AMR-01');
  assert.equal(chargerOccupied.secondaryAction.kind, 'localize_here');

  const chargerEmptyStaff = resolveEndpointInspection({
    endpoint: charger,
    robots: [farRobot],
    locations: [],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: false,
      isTechnicalRole: false,
    },
  });
  assert.equal(chargerEmptyStaff.primaryAction, null);
  assert.equal(chargerEmptyStaff.secondaryAction, null);

  const inbound = resolveEndpointInspection({
    endpoint: baseEndpoint({ id: 'ep-in', code: 'IN-01', name: 'Inbound Dock 1', endpointType: 'WAYPOINT' }),
    robots: [],
    locations: [],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: false,
      isTechnicalRole: false,
    },
  });
  assert.equal(inbound.visualKind, 'INBOUND');
  assert.equal(inbound.primaryAction.kind, 'start_putaway');
  assert.equal(inbound.secondaryAction.kind, 'open_inbound_vouchers');

  const outbound = resolveEndpointInspection({
    endpoint: baseEndpoint({ id: 'ep-out', code: 'OUT-01', name: 'Outbound Gate 1', endpointType: 'WAYPOINT' }),
    robots: [],
    locations: [],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: false,
      canReadVouchers: true,
      canLocalize: false,
      isTechnicalRole: false,
    },
  });
  assert.equal(outbound.visualKind, 'OUTBOUND');
  assert.equal(outbound.primaryAction.kind, 'open_outbound_vouchers');
  assert.equal(outbound.secondaryAction, null);

  const idleWaypoint = resolveEndpointInspection({
    endpoint: baseEndpoint({ id: 'ep-wp', code: 'WP-01', name: 'Aisle Turn 1', endpointType: 'WAYPOINT' }),
    robots: [],
    locations: [],
    areas: [],
    permissions: {
      canReadWarehouse: true,
      canCreateTransport: true,
      canReadVouchers: true,
      canLocalize: true,
      isTechnicalRole: true,
    },
  });
  assert.equal(idleWaypoint.visualKind, 'WAYPOINT');
  assert.equal(idleWaypoint.primaryAction, null);
  assert.equal(idleWaypoint.secondaryAction, null);
});
