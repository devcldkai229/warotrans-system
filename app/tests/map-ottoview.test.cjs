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
    { x: 268, y: 118, endpoint: { id: 'ep-wp2', mapVersionId: 'map-1', code: 'WP-02', name: 'Waypoint 02', endpointType: 'WAYPOINT', x: 5.2, y: 1.1, yaw: 0, isEnabled: true } },
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

  // Obstacle avoidance: robot below charger flips label above; blocked both sides suppresses lower-priority waypoint
  const chgOnly = [
    { x: 250, y: 100, endpoint: items[3].endpoint },
    { x: 350, y: 100, endpoint: items[4].endpoint },
  ];
  const withObstacles = selectVisibleEndpointLabels(
    chgOnly,
    1,
    null,
    undefined,
    false,
    [
      { x: 250, y: 114 }, // blocks below ep-chg -> flips above
      { x: 350, y: 114 }, // blocks below ep-wp2
      { x: 350, y: 84 },  // blocks above ep-wp2 -> suppresses ep-wp2
    ],
  );
  assert.equal(withObstacles.find(l => l.endpoint.id === 'ep-chg')?.placement, 'above');
  assert.equal(withObstacles.some(l => l.endpoint.id === 'ep-wp2'), false);

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

  // Zone floor label suppresses when a robot/station obstacle overlaps centroid, unless selected
  const blockedZones = visibleZoneLabels(map, frame, 1, null, [{ x: zLabels1x[0].x, y: zLabels1x[0].y }]);
  assert.equal(blockedZones.length, 0);
  const selectedOverObstacle = visibleZoneLabels(map, frame, 1, 'z-big', [{ x: zLabels1x[0].x, y: zLabels1x[0].y }]);
  assert.equal(selectedOverObstacle.length, 1);

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

test('Vietnamese i18n translates new OTTO map legend and quick-inspect strings without em-dashes', () => {
  const load = createLoader();
  const { ZONE_DESCRIPTION } = load('src/shared/maps/mapStyle.ts');
  const { setLanguage, t, translateText } = load('src/shared/i18n.ts');
  setLanguage('vi');

  for (const desc of Object.values(ZONE_DESCRIPTION)) {
    assert.equal(desc.includes('—'), false);
    assert.equal(desc.includes('–'), false);
  }

  assert.equal(t('Map Legend'), 'Chú giải bản đồ');
  assert.equal(t('Live'), 'Trực tiếp');
  assert.equal(t('No Entry'), 'Cấm vào');
  assert.equal(t('1 AMR'), 'Tối đa 1 xe');
  assert.equal(t('Inbound Gate'), 'Cổng nhập kho');
  assert.equal(t('Outbound Gate'), 'Cổng xuất kho');
  assert.equal(t('Shelf / Rack'), 'Kệ hàng');
  assert.equal(t('Inspection'), 'Kiểm tra');
  assert.equal(t('Wait / Buffer'), 'Điểm chờ');
  assert.equal(t('Recessed Shelf Bay'), 'Kệ âm tường');
  assert.equal(t('Docking Bay'), 'Ô đỗ robot đúng tỉ lệ');
  assert.equal(t('Job Route & Paths'), 'Lộ trình & đường đi');
  assert.equal(
    t('Job route, travelled trail & live Nav2 paths'),
    'Tuyến giao nhận, vệt đã đi & lộ trình Nav2',
  );
  assert.equal(
    t('Job route & travelled robot trail'),
    'Tuyến giao nhận & vệt di chuyển của robot',
  );
  assert.equal(t('Job Route (Pickup to Destination)'), 'Tuyến nhiệm vụ (Nhận đến Giao)');
  assert.equal(t('Travelled Trail'), 'Vệt đường robot đã đi');
  assert.equal(t('One-way lane'), 'Làn đường 1 chiều');
  assert.equal(t('Two-way lane'), 'Làn đường 2 chiều');
  assert.equal(t('Live Nav2 Path (Authorized)'), 'Đường đi Nav2 trực tiếp (Đã cấp phép)');
  assert.equal(
    t(ZONE_DESCRIPTION.NO_STOP),
    'Giữ thông thoáng: robot đi qua không dừng lại',
  );
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

test('endpointVisualKind classifies all 8 OTTO functional station types including Parking B waypoints', () => {
  const load = createLoader({
    react: { memo: fn => fn },
    'react-native': { View: 'View' },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    'lucide-react-native': {
      ArrowDownToLine: 'ArrowDownToLine',
      ArrowUpFromLine: 'ArrowUpFromLine',
      CircleDot: 'CircleDot',
      CircleParking: 'CircleParking',
      Clock: 'Clock',
      Rows3: 'Rows3',
      ScanSearch: 'ScanSearch',
      Zap: 'Zap',
    },
  });
  const { endpointVisualKind, visualKindColor } = load('src/shared/maps/EndpointGlyph.tsx');

  assert.equal(endpointVisualKind('WAYPOINT', 'EP-SHELF-A-1', 'Shelf A 1'), 'SHELF');
  assert.equal(endpointVisualKind('WAYPOINT', 'INBOUND-01', 'Receiving'), 'INBOUND');
  assert.equal(endpointVisualKind('WAYPOINT', 'EP-02', 'Outbound Gate'), 'OUTBOUND');
  assert.equal(endpointVisualKind('CHARGER', 'CHG-01', 'Charger'), 'CHARGER');
  assert.equal(endpointVisualKind('PARKING', 'PK-01', 'Parking A'), 'PARK');
  assert.equal(endpointVisualKind('WAYPOINT', 'EP-PARKING-B', 'Parking B'), 'PARK');
  assert.equal(endpointVisualKind('WAYPOINT', 'EP-INSPECTION', 'Inspection'), 'INSPECTION');
  assert.equal(endpointVisualKind('WAYPOINT', 'EP-WAIT', 'Wait'), 'WAIT');
  assert.equal(endpointVisualKind('WAYPOINT', 'WP-09', 'Aisle Point'), 'WAYPOINT');

  assert.equal(visualKindColor('CHARGER', 'CHARGER', false), '#059669');
  assert.equal(visualKindColor('CHARGER', 'CHARGER', true), '#34d399');
  assert.equal(visualKindColor('INBOUND', 'WAYPOINT', false), '#059669');
  assert.equal(visualKindColor('INBOUND', 'WAYPOINT', true), '#34d399');
  assert.equal(visualKindColor('OUTBOUND', 'WAYPOINT', false), '#d97706');
  assert.equal(visualKindColor('OUTBOUND', 'WAYPOINT', true), '#fbbf24');
  assert.equal(visualKindColor('SHELF', 'WAYPOINT', true), '#e6ecf5');
  assert.equal(visualKindColor('SHELF', 'WAYPOINT', false), '#1f2937');
  assert.equal(visualKindColor('PARK', 'WAYPOINT', false), '#1f2937');
});

test('laneGlyphs renders calm OTTO directional arrows along compact MAP-ONE-V013 corridors', () => {
  const load = createLoader();
  const { laneGlyphs, LANE_ARROW_PATH } = load('src/shared/maps/laneGlyphs.ts');

  assert.ok(LANE_ARROW_PATH.includes('0.16'));

  // Simulate MAP-ONE-V013 scale (~75 px/m) for stub (0.70 m), medium (1.18 m), and long (1.78 m) lanes
  const widthPx = 0.65 * 75;
  const shortLane = laneGlyphs([{ x: 0, y: 0 }, { x: 0, y: 0.70 * 75 }], widthPx, 'ONE_WAY');
  const midLane = laneGlyphs([{ x: 0, y: 0 }, { x: 0, y: 1.18 * 75 }], widthPx, 'ONE_WAY');
  const longLane = laneGlyphs([{ x: 0, y: 0 }, { x: 0, y: 1.78 * 75 }], widthPx, 'ONE_WAY');
  const twoWayLane = laneGlyphs([{ x: 0, y: 0 }, { x: 1.18 * 75, y: 0 }], widthPx, 'BIDIRECTIONAL');

  assert.equal(shortLane.chevrons.length, 1);
  assert.equal(midLane.chevrons.length, 2);
  assert.equal(longLane.chevrons.length, 3);
  assert.equal(twoWayLane.chevrons.length, 4);
});

test('robotFootprintPx preserves real meter scale and computeStationArchitecture places 0.35m x 0.70m recessed shelf bays on MAP-ONE-V013', () => {
  const models = require('../src/shared/maps/rosMapModels.json');
  const load = createLoader({ './rosMapModels.json': models });
  const { createMapFrame, worldToBase } = load('src/shared/maps/mapTransform.ts');
  const { robotFootprintPx, computeStationArchitecture } = load('src/shared/maps/mapArchitecture.ts');
  const snapshot = require('../../samples/maps/MAP-ONE-V013/snapshot.json');

  const mv = snapshot.mapVersion;
  const map = {
    ...BASE_MAP,
    id: mv.id,
    code: mv.code,
    versionNo: mv.version_no,
    name: mv.name,
    imageWidthPixels: mv.image_width_pixels,
    imageHeightPixels: mv.image_height_pixels,
    resolution: mv.resolution,
    originX: mv.origin_x,
    originY: mv.origin_y,
    originYaw: mv.origin_yaw,
    frameId: mv.frame_id,
    endpoints: snapshot.endpoints.map(e => ({
      id: e.id,
      mapVersionId: e.map_version_id,
      code: e.code,
      name: e.name,
      endpointType: e.endpoint_type,
      x: e.x,
      y: e.y,
      yaw: e.yaw,
      isEnabled: e.is_enabled,
    })),
  };

  const compactFrame = createMapFrame(map, 390, 680, { top: 56, right: 34, bottom: 52, left: 34 });
  assert.ok(compactFrame);
  const compactFootprint = robotFootprintPx(map, compactFrame);
  assert.ok(Math.abs(compactFootprint.length / compactFootprint.width - 0.32 / 0.26) < 1e-6);
  assert.ok(compactFootprint.length > 20);

  // Large 50m warehouse enforces >= 16px readable robot length while preserving ratio
  const largeMap = { ...BASE_MAP, imageWidthPixels: 1000, imageHeightPixels: 1000, resolution: 0.05 };
  const largeFrame = createMapFrame(largeMap, 360, 360);
  const largeFootprint = robotFootprintPx(largeMap, largeFrame);
  assert.equal(largeFootprint.length, 16);
  assert.ok(Math.abs(largeFootprint.length / largeFootprint.width - 0.32 / 0.26) < 1e-6);

  const items = map.endpoints.flatMap(ep => {
    const p = worldToBase(ep, map, compactFrame);
    return p ? [{ ...p, endpoint: ep }] : [];
  });
  const arch = computeStationArchitecture(map, compactFrame, items);

  // Functional bays: 4 shelves + 2 parking + charger + inbound + outbound + inspection = 10 (Wait stays bracket-free)
  assert.equal(arch.dockBays.length, 10);
  assert.equal(arch.shelfBays.length, 4);

  const wallByName = Object.fromEntries(arch.shelfBays.map(b => [b.name, b.wall]));
  assert.equal(wallByName['Shelf A 2'], 'left');
  assert.equal(wallByName['Shelf A 1'], 'top');
  assert.equal(wallByName['Shelf B 01 02'], 'top');
  assert.equal(wallByName['Shelf C 1'], 'bottom');

  for (const bay of arch.shelfBays) {
    const isHoriz = bay.wall === 'top' || bay.wall === 'bottom';
    const lengthPx = isHoriz ? bay.width : bay.height;
    const depthPx = isHoriz ? bay.height : bay.width;
    assert.ok(
      Math.abs(lengthPx / depthPx - 0.70 / 0.35) < 1e-3,
      `Expected 2:1 ratio (0.70m x 0.35m) for ${bay.name}, got ${lengthPx.toFixed(2)}/${depthPx.toFixed(2)}`,
    );
  }
});

test('selectVisibleEndpointLabels with maxPriority=1 hides routine labels while preserving job/selected and key area watermarks', () => {
  const load = createLoader();
  const { selectVisibleEndpointLabels, selectKeyAreaWatermarks } = load('src/shared/maps/mapLabels.ts');

  const items = [
    { x: 60, y: 80, endpoint: { id: 'ep-shelf', mapVersionId: 'map-1', code: 'EP-SHELF-A-1', name: 'Shelf A 1', endpointType: 'WAYPOINT', x: 1, y: 1, yaw: 0, isEnabled: true } },
    { x: 160, y: 80, endpoint: { id: 'ep-park', mapVersionId: 'map-1', code: 'EP-PARKING-A', name: 'Parking A', endpointType: 'PARK', x: 2, y: 1, yaw: 0, isEnabled: true } },
    { x: 260, y: 80, endpoint: { id: 'ep-in', mapVersionId: 'map-1', code: 'EP-INBOUND', name: 'Inbound', endpointType: 'WAYPOINT', x: 3, y: 1, yaw: 0, isEnabled: true } },
    { x: 260, y: 220, endpoint: { id: 'ep-out', mapVersionId: 'map-1', code: 'EP-OUTBOUND', name: 'Outbound', endpointType: 'WAYPOINT', x: 3, y: 3, yaw: 0, isEnabled: true } },
  ];

  const labels = selectVisibleEndpointLabels(
    items,
    1,
    'ep-park',
    { pickupCode: 'EP-SHELF-A-1' },
    false,
    [],
    1,
  );
  assert.deepEqual(
    [...labels.map(l => l.endpoint.id)].sort(),
    ['ep-park', 'ep-shelf'],
  );

  const watermarks = selectKeyAreaWatermarks(items, [], new Set(labels.map(l => l.endpoint.id)));
  assert.deepEqual(
    [...watermarks.map(w => w.label)].sort(),
    ['Inbound', 'Outbound'],
  );
});

test('dark-mode OTTO map style helpers provide calm desaturated steel lanes and zones without altering fixed palette tokens', () => {
  const load = createLoader();
  const {
    LANE_BLUE,
    ZONE_COLOR,
    laneBandColor,
    laneEdgeColor,
    laneArrowColor,
    laneBandOpacity,
    zoneStrokeColor,
  } = load('src/shared/maps/mapStyle.ts');

  assert.equal(LANE_BLUE, '#3279f9');
  assert.equal(ZONE_COLOR.JUNCTION, '#5c6bc0');

  assert.equal(laneBandColor(false), LANE_BLUE);
  assert.equal(laneBandColor(true), '#1a74e2');
  assert.equal(laneEdgeColor(false), LANE_BLUE);
  assert.equal(laneEdgeColor(true), '#38bdf8');
  assert.equal(laneArrowColor(false), '#1d4ed8');
  assert.equal(laneArrowColor(true), '#e0f2fe');
  assert.equal(laneBandOpacity(false), 0.13);
  assert.equal(laneBandOpacity(true), 0.14);

  assert.equal(zoneStrokeColor('KEEP_OUT', false), ZONE_COLOR.KEEP_OUT);
  assert.equal(zoneStrokeColor('KEEP_OUT', true), '#e06c75');
  assert.equal(zoneStrokeColor('SPEED', true), '#d4b14b');
  assert.equal(zoneStrokeColor('NO_STOP', true), '#6ba3be');
  assert.equal(zoneStrokeColor('SINGLE_OCCUPANCY', true), '#a78bfa');
  assert.equal(zoneStrokeColor('JUNCTION', true), '#8b95b5');
});

test('screenToWorld and baseToWorld produce accurate metric orientation-box readouts across 1x and 4x zoom', () => {
  const models = require('../src/shared/maps/rosMapModels.json');
  const load = createLoader({ './rosMapModels.json': models });
  const { createMapFrame, baseToWorld, screenToWorld, worldToBase, zoomAtPoint, FIT_CAMERA } = load(
    'src/shared/maps/mapTransform.ts',
  );
  const snapshot = require('../../samples/maps/MAP-ONE-V013/snapshot.json');
  const mv = snapshot.mapVersion;
  const map = {
    ...BASE_MAP,
    id: mv.id,
    imageWidthPixels: mv.image_width_pixels,
    imageHeightPixels: mv.image_height_pixels,
    resolution: mv.resolution,
    originX: mv.origin_x,
    originY: mv.origin_y,
    originYaw: mv.origin_yaw,
    frameId: mv.frame_id,
  };
  const frame = createMapFrame(map, 390, 680, { top: 56, right: 34, bottom: 52, left: 34 });
  assert.ok(frame);

  const probeWorld = { x: 1.05, y: -0.81 };
  const basePt = worldToBase(probeWorld, map, frame);
  assert.ok(basePt);

  const fromBase = baseToWorld(basePt, map, frame);
  const fromScreen1x = screenToWorld(basePt, map, frame, FIT_CAMERA);
  const cam4x = zoomAtPoint(FIT_CAMERA, 4, { x: 195, y: 340 });
  const screenAt4x = { x: basePt.x * cam4x.zoom + cam4x.x, y: basePt.y * cam4x.zoom + cam4x.y };
  const fromScreen4x = screenToWorld(screenAt4x, map, frame, cam4x);

  for (const pt of [fromBase, fromScreen1x, fromScreen4x]) {
    assert.ok(pt);
    assert.ok(Math.abs(pt.x - probeWorld.x) < 1e-4);
    assert.ok(Math.abs(pt.y - probeWorld.y) < 1e-4);
  }
});

test('mapTrails filters points by map code, splits telemetry gaps, and builds real job routes', () => {
  const load = createLoader();
  const {
    filterTrailPointsForMap,
    buildTrailSegments,
    buildJobMovement,
    isJobTrailLive,
  } = load('src/shared/maps/mapTrails.ts');

  const points = [
    { at: '2026-11-22T09:00:00Z', x: 0.0, y: 0.0, yaw: 0, mapVersionCode: 'MAP-ONE-V013' },
    { at: '2026-11-22T09:00:02Z', x: 0.2, y: 0.0, yaw: 0, mapVersionCode: 'MAP-ONE-V013' },
    { at: '2026-11-22T09:00:04Z', x: 9.0, y: 9.0, yaw: 0, mapVersionCode: 'MAP-OTHER-V001' },
    { at: '2026-11-22T09:00:45Z', x: 1.5, y: 1.0, yaw: 0, mapVersionCode: null },
    { at: '2026-11-22T09:00:47Z', x: 1.8, y: 1.0, yaw: 0, mapVersionCode: 'MAP-ONE-V013' },
  ];

  const onMap = filterTrailPointsForMap(points, 'MAP-ONE-V013');
  assert.equal(onMap.length, 4);

  const segments = buildTrailSegments(onMap);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].length, 2);
  assert.equal(segments[1].length, 2);

  const map = {
    ...BASE_MAP,
    endpoints: [
      { id: 'ep-1', mapVersionId: 'map-1', code: 'EP-INBOUND', name: 'Inbound', endpointType: 'WAYPOINT', x: 1.0, y: 2.0, yaw: 0, isEnabled: true },
      { id: 'ep-2', mapVersionId: 'map-1', code: 'EP-SHELF-C-1', name: 'Shelf C 1', endpointType: 'WAYPOINT', x: 3.0, y: 0.5, yaw: 0, isEnabled: true },
      { id: 'ep-off', mapVersionId: 'map-1', code: 'EP-DISABLED', name: 'Disabled', endpointType: 'WAYPOINT', x: 4.0, y: 1.0, yaw: 0, isEnabled: false },
    ],
  };

  const movement = buildJobMovement(map, { pickupCode: 'EP-INBOUND', dropoffCode: 'Shelf C 1' });
  assert.ok(movement);
  assert.equal(movement.pickupId, 'ep-1');
  assert.equal(movement.dropoffId, 'ep-2');
  assert.deepEqual({ x: movement.from.x, y: movement.from.y }, { x: 1.0, y: 2.0 });
  assert.deepEqual({ x: movement.to.x, y: movement.to.y }, { x: 3.0, y: 0.5 });

  assert.equal(buildJobMovement(map, { pickupCode: 'EP-INBOUND', dropoffCode: 'EP-INBOUND' }), null);
  assert.equal(buildJobMovement(map, { pickupCode: 'EP-INBOUND', dropoffCode: 'EP-DISABLED' }), null);
  assert.equal(buildJobMovement(map, undefined), null);

  assert.equal(isJobTrailLive('RUNNING'), true);
  assert.equal(isJobTrailLive('PAUSED'), true);
  assert.equal(isJobTrailLive('CREATED'), false);
  assert.equal(isJobTrailLive('COMPLETED'), false);
  assert.equal(isJobTrailLive('CANCELLED'), false);
});

test('detectPerimeterShelfWalls expands 1:1 map framing when opposite wall has no recessed shelves', () => {
  const models = require('../src/shared/maps/rosMapModels.json');
  const load = createLoader({ './rosMapModels.json': models });
  const { createMapFrame, shouldRotateMap, worldToBase } = load('src/shared/maps/mapTransform.ts');
  const { computeStationArchitecture, detectPerimeterShelfWalls } = load(
    'src/shared/maps/mapArchitecture.ts',
  );
  const snapshot = require('../../samples/maps/MAP-ONE-V013/snapshot.json');
  const mv = snapshot.mapVersion;

  const map = {
    ...BASE_MAP,
    id: mv.id,
    code: mv.code,
    versionNo: mv.version_no,
    name: mv.name,
    imageWidthPixels: mv.image_width_pixels,
    imageHeightPixels: mv.image_height_pixels,
    resolution: mv.resolution,
    originX: mv.origin_x,
    originY: mv.origin_y,
    originYaw: mv.origin_yaw,
    frameId: mv.frame_id,
    endpoints: snapshot.endpoints.map(e => ({
      id: e.id,
      mapVersionId: e.map_version_id,
      code: e.code,
      name: e.name,
      endpointType: e.endpoint_type,
      x: e.x,
      y: e.y,
      yaw: e.yaw,
      isEnabled: e.is_enabled,
    })),
  };

  const rotated = shouldRotateMap(map.imageWidthPixels, map.imageHeightPixels, 390, 680);
  assert.equal(rotated, false);

  const walls = detectPerimeterShelfWalls(map, rotated);
  assert.deepEqual({ ...walls }, { top: true, bottom: true, left: true, right: false });

  const emptyWalls = detectPerimeterShelfWalls({ ...map, endpoints: [] }, rotated);
  assert.deepEqual({ ...emptyWalls }, { top: false, bottom: false, left: false, right: false });

  const sideShelfPad = Math.max(35, Math.ceil(390 * 0.088));
  const frame = createMapFrame(map, 390, 680, {
    top: 56,
    right: walls.right ? sideShelfPad : 8,
    bottom: 56,
    left: walls.left ? sideShelfPad : 8,
  });
  assert.ok(frame);
  assert.equal(frame.mapWidth, 347);
  const pxPerMetre = frame.scale / map.resolution;
  assert.ok(pxPerMetre > 80);

  const items = map.endpoints.flatMap(ep => {
    const p = worldToBase(ep, map, frame);
    return p ? [{ ...p, endpoint: ep }] : [];
  });
  const arch = computeStationArchitecture(map, frame, items);
  assert.equal(arch.shelfBays.length, 4);

  for (const bay of arch.shelfBays) {
    const isHoriz = bay.wall === 'top' || bay.wall === 'bottom';
    const lengthPx = isHoriz ? bay.width : bay.height;
    const depthPx = isHoriz ? bay.height : bay.width;
    assert.ok(Math.abs(lengthPx / depthPx - 0.70 / 0.35) < 1e-3);
    assert.ok(bay.x >= 2 && bay.y >= 2);
  }
});
