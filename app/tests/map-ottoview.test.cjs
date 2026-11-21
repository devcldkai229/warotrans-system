const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

const BASE_MAP = {
  id: 'map-1',
  warehouseId: 'wh-1',
  code: 'MAP-01',
  versionNo: 1,
  name: 'Main Floor',
  status: 'PUBLISHED',
  mapUri: '',
  imageWidthPixels: 200,
  imageHeightPixels: 100,
  resolution: 0.05,
  originX: 0,
  originY: 0,
  originYaw: 0,
  frameId: 'map',
  createdAt: '2026-01-01T00:00:00Z',
  publishedAt: '2026-01-01T00:00:00Z',
  endpoints: [],
  zones: [],
  edges: [],
};

test('mapHitTest respects polygon holes, picks smallest nested zone, and hits nearest lane across zoom', () => {
  const load = createLoader();
  const { createMapFrame, worldToBase } = load('src/shared/maps/mapTransform.ts');
  const { pointInPolygon, hitTestInfrastructure } = load('src/shared/maps/mapHitTest.ts');

  // Polygon with a central hole
  const outer = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const hole = [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }];
  assert.equal(pointInPolygon({ x: 15, y: 15 }, [outer, hole]), true);
  assert.equal(pointInPolygon({ x: 50, y: 50 }, [outer, hole]), false);

  const map = {
    ...BASE_MAP,
    zones: [
      {
        id: 'z-large',
        mapVersionId: 'map-1',
        code: 'SPD-BIG',
        name: 'Main Speed Zone',
        zoneType: 'SPEED',
        capacity: 4,
        maxSpeed: 0.8,
        isActive: true,
        geometry: { type: 'Polygon', coordinates: [[[0.5, 0.5], [8.5, 0.5], [8.5, 4.5], [0.5, 4.5], [0.5, 0.5]]] },
      },
      {
        id: 'z-small',
        mapVersionId: 'map-1',
        code: 'KO-INNER',
        name: 'Inner Hazard',
        zoneType: 'KEEP_OUT',
        capacity: 0,
        maxSpeed: null,
        isActive: true,
        geometry: { type: 'Polygon', coordinates: [[[2, 1.5], [4, 1.5], [4, 3.5], [2, 3.5], [2, 1.5]]] },
      },
      {
        id: 'z-other-map',
        mapVersionId: 'map-old',
        code: 'OLD',
        name: 'Old Zone',
        zoneType: 'KEEP_OUT',
        capacity: 0,
        maxSpeed: null,
        isActive: true,
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [9, 0], [9, 4], [0, 4], [0, 0]]] },
      },
    ],
    edges: [
      {
        id: 'e-1',
        mapVersionId: 'map-1',
        code: 'LANE-1',
        name: 'North Corridor',
        direction: 'ONE_WAY',
        widthMeters: 1.2,
        capacity: 2,
        maxSpeed: 1.0,
        isActive: true,
        geometry: { type: 'LineString', coordinates: [[1, 4.7], [9, 4.7]] },
      },
    ],
  };

  const frame = createMapFrame(map, 400, 200);
  const insideSmall = worldToBase({ x: 3, y: 2.5 }, map, frame);
  const insideLargeOnly = worldToBase({ x: 6, y: 2.5 }, map, frame);
  const onLane = worldToBase({ x: 5, y: 4.7 }, map, frame);
  const emptyFloor = worldToBase({ x: 9.6, y: 0.2 }, map, frame);

  assert.equal(hitTestInfrastructure(insideSmall, map, frame, 1, { zones: true, lanes: true })?.zone.id, 'z-small');
  assert.equal(hitTestInfrastructure(insideLargeOnly, map, frame, 1, { zones: true, lanes: true })?.zone.id, 'z-large');
  assert.equal(hitTestInfrastructure(onLane, map, frame, 1, { zones: true, lanes: true })?.edge.id, 'e-1');
  assert.equal(hitTestInfrastructure(onLane, map, frame, 2.5, { zones: false, lanes: true })?.edge.id, 'e-1');
  assert.equal(hitTestInfrastructure(onLane, map, frame, 1, { zones: false, lanes: false }), null);
  assert.equal(hitTestInfrastructure(emptyFloor, map, frame, 1, { zones: true, lanes: true }), null);
});

test('mapLabels prioritizes job and landmark endpoints, suppresses overlaps at 1x, and scales zone visibility', () => {
  const load = createLoader();
  const { createMapFrame } = load('src/shared/maps/mapTransform.ts');
  const { selectVisibleEndpointLabels, visibleZoneLabels, zoneShortBadge } = load('src/shared/maps/mapLabels.ts');

  const items = [
    { x: 100, y: 100, endpoint: { id: 'ep-wp1', mapVersionId: 'map-1', code: 'WP-01', name: 'Aisle Waypoint 01', endpointType: 'WAYPOINT', x: 1, y: 1, yaw: 0, isEnabled: true } },
    { x: 110, y: 105, endpoint: { id: 'ep-in', mapVersionId: 'map-1', code: 'INBOUND-01', name: 'Inbound Dock 01', endpointType: 'WAYPOINT', x: 1.2, y: 1.1, yaw: 0, isEnabled: true } },
    { x: 118, y: 108, endpoint: { id: 'ep-out', mapVersionId: 'map-1', code: 'OUTBOUND-01', name: 'Outbound Gate 01', endpointType: 'WAYPOINT', x: 1.4, y: 1.2, yaw: 0, isEnabled: true } },
    { x: 250, y: 100, endpoint: { id: 'ep-chg', mapVersionId: 'map-1', code: 'CHG-01', name: 'Main Charger Station 01', endpointType: 'CHARGER', x: 5, y: 1, yaw: 0, isEnabled: true } },
    { x: 268, y: 108, endpoint: { id: 'ep-wp2', mapVersionId: 'map-1', code: 'WP-02', name: 'Waypoint 02', endpointType: 'WAYPOINT', x: 5.2, y: 1.1, yaw: 0, isEnabled: true } },
  ];

  const labels1x = selectVisibleEndpointLabels(
    items,
    1,
    null,
    { pickupCode: 'INBOUND-01', dropoffCode: 'OUTBOUND-01' },
    false,
  );

  const ids1x = labels1x.map(l => l.endpoint.id);
  // Active job pickup + dropoff are always kept even when adjacent
  assert.ok(ids1x.includes('ep-in'));
  assert.ok(ids1x.includes('ep-out'));
  // Landmark charger beats overlapping WP-02, and overlapping WP-01 is suppressed by job endpoints
  assert.ok(ids1x.includes('ep-chg'));
  assert.ok(!ids1x.includes('ep-wp1'));
  assert.ok(!ids1x.includes('ep-wp2'));

  const chargerLabel1x = labels1x.find(l => l.endpoint.id === 'ep-chg');
  assert.equal(chargerLabel1x.displayText, 'CHG-01');

  // Detailed zoom reveals full names and clears overlap for separated waypoints
  const labelsZoomed = selectVisibleEndpointLabels(items, 4, 'ep-wp2', { pickupCode: 'INBOUND-01' }, true);
  assert.equal(labelsZoomed.find(l => l.endpoint.id === 'ep-chg').displayText, 'Main Charger Station 01');
  assert.ok(labelsZoomed.some(l => l.endpoint.id === 'ep-wp2'));

  // Zone visibility & badges
  const map = {
    ...BASE_MAP,
    zones: [
      {
        id: 'z-tiny',
        mapVersionId: 'map-1',
        code: 'TINY',
        name: 'Tiny Junction',
        zoneType: 'JUNCTION',
        capacity: 1,
        maxSpeed: null,
        isActive: true,
        geometry: { type: 'Polygon', coordinates: [[[1, 1], [1.4, 1], [1.4, 1.4], [1, 1.4], [1, 1]]] },
      },
      {
        id: 'z-big',
        mapVersionId: 'map-1',
        code: 'SPD',
        name: 'Packing Speed',
        zoneType: 'SPEED',
        capacity: 3,
        maxSpeed: 0.5,
        isActive: true,
        geometry: { type: 'Polygon', coordinates: [[[2, 1], [6, 1], [6, 3], [2, 3], [2, 1]]] },
      },
    ],
  };
  const frame = createMapFrame(map, 400, 200);
  const zLabels1x = visibleZoneLabels(map, frame, 1, null);
  assert.deepEqual([...zLabels1x.map(z => z.id)], ['z-big']);
  assert.equal(zLabels1x[0].badge, '≤ 0.5 m/s');

  const zLabelsSelected = visibleZoneLabels(map, frame, 1, 'z-tiny');
  assert.equal(zLabelsSelected.length, 2);

  assert.equal(zoneShortBadge({ zoneType: 'KEEP_OUT', maxSpeed: null }), 'No Entry');
  assert.equal(zoneShortBadge({ zoneType: 'NO_STOP', maxSpeed: null }), 'No Stop');
  assert.equal(zoneShortBadge({ zoneType: 'SINGLE_OCCUPANCY', maxSpeed: null }), '1 AMR');
});

test('mapTraffic builds live Nav2 paths only for online robots on the active map', () => {
  const load = createLoader();
  const { buildPlannedPaths } = load('src/shared/maps/mapTraffic.ts');

  const robots = [
    { id: 'r2', code: 'AMR-02', isOnline: true, currentMapVersionId: 'map-1' },
    { id: 'r1', code: 'AMR-01', isOnline: true, currentMapVersionId: 'map-1' },
    { id: 'r3', code: 'AMR-03', isOnline: false, currentMapVersionId: 'map-1' },
    { id: 'r4', code: 'AMR-04', isOnline: true, currentMapVersionId: 'map-other' },
  ];

  const snapshot = {
    epoch: 1,
    stateVersion: 4,
    phase: 'Active',
    resources: [],
    waits: [],
    recentEvents: [],
    robots: [
      {
        robotId: 'r1',
        phase: 'Granted',
        x: 1,
        y: 1,
        localizationOk: true,
        occupiedResourceIds: [],
        proposedPath: [{ x: 2, y: 1, yaw: 0 }, { x: 3, y: 1, yaw: 0 }],
        grantedPathPoints: 1,
        waitingReason: '',
      },
      {
        robotId: 'r2',
        phase: 'Waiting',
        x: 4,
        y: 2,
        localizationOk: true,
        occupiedResourceIds: [],
        proposedPath: [{ x: 5, y: 2, yaw: 1.57 }],
        grantedPathPoints: 0,
        waitingReason: 'zone:J1',
      },
      {
        robotId: 'r3',
        phase: 'Offline',
        x: 0,
        y: 0,
        localizationOk: false,
        occupiedResourceIds: [],
        proposedPath: [{ x: 1, y: 0, yaw: 0 }],
        grantedPathPoints: 1,
        waitingReason: '',
      },
      {
        robotId: 'r4',
        phase: 'Granted',
        x: 2,
        y: 2,
        localizationOk: true,
        occupiedResourceIds: [],
        proposedPath: [{ x: 3, y: 2, yaw: 0 }],
        grantedPathPoints: 1,
        waitingReason: '',
      },
    ],
  };

  const paths = buildPlannedPaths(snapshot, robots, 'map-1');
  assert.equal(paths.length, 2);

  const p1 = paths.find(p => p.robotCode === 'AMR-01');
  assert.equal(p1.color, '#00d2ff');
  assert.equal(p1.points.length, 3);
  assert.equal(p1.grantedCount, 2);
  assert.equal(p1.waiting, false);

  const p2 = paths.find(p => p.robotCode === 'AMR-02');
  assert.equal(p2.color, '#ec5b9a');
  assert.equal(p2.points.length, 2);
  assert.equal(p2.grantedCount, 0);
  assert.equal(p2.waiting, true);
});

test('interactiveMapEnabled defaults to true on native and web, opting out only when EXPO_PUBLIC_INTERACTIVE_MAP=false', () => {
  const defaultLoad = createLoader(
    { 'react-native': { Platform: { OS: 'ios' } } },
    { process: { env: {} } },
  );
  assert.equal(defaultLoad('src/shared/maps/mapFeatures.ts').interactiveMapEnabled, true);

  const disabledLoad = createLoader(
    { 'react-native': { Platform: { OS: 'ios' } } },
    { process: { env: { EXPO_PUBLIC_INTERACTIVE_MAP: 'false' } } },
  );
  assert.equal(disabledLoad('src/shared/maps/mapFeatures.ts').interactiveMapEnabled, false);
});

test('Vietnamese i18n translates new OTTO map legend and quick-inspect strings', () => {
  const load = createLoader();
  const { setLanguage, t, translateText } = load('src/shared/i18n.ts');
  setLanguage('vi');

  assert.equal(t('Map Legend'), 'Chú giải bản đồ');
  assert.equal(t('Live'), 'Trực tiếp');
  assert.equal(t('No Entry'), 'Cấm vào');
  assert.equal(t('1 AMR'), 'Tối đa 1 xe');
  assert.equal(t('One-way lane'), 'Làn đường 1 chiều');
  assert.equal(t('Two-way lane'), 'Làn đường 2 chiều');
  assert.equal(t('Live Nav2 Path (Authorized)'), 'Đường đi Nav2 trực tiếp (Đã cấp phép)');
  assert.equal(
    translateText('Reduced robot speed area · Max 0.5 m/s'),
    'Khu vực robot giảm tốc độ di chuyển · Tối đa 0.5 m/s',
  );
  assert.equal(
    translateText('Width 1.2 m · Max 0.8 m/s'),
    'Rộng 1.2 m · Tối đa 0.8 m/s',
  );
  assert.equal(translateText('2 m · 1.0×'), '2 m · 1.0×');
});
