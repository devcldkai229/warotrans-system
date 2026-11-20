const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadOps(apiFetch, token = 'staff-token') {
  return createLoader({
    'src/shared/api/client.ts': {
      apiFetch,
      ApiError,
      getAccessToken: () => token,
    },
  })('src/shared/api/operationsApi.ts');
}

const sampleIssue = (overrides = {}) => ({
  id: 'iss-1',
  code: 'ISS-001',
  issueType: 'CONTAINER',
  severity: 'HIGH',
  status: 'OPEN',
  description: '[WRONG_CONTAINER] Wrong box on bay',
  reportedBy: 'staff-a',
  assigneeId: null,
  containerId: 'ctn-1',
  transportRequestId: null,
  jobId: 'job-1',
  jobStepId: null,
  storageLocationId: null,
  robotId: 'robot-1',
  evidence: [],
  version: 1,
  reportedAt: '2026-11-20T09:00:00Z',
  updatedAt: '2026-11-20T09:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  resolution: null,
  allowedTransitions: ['RESOLVED'],
  problemCode: 'WRONG_CONTAINER',
  ...overrides,
});

test('listIssues and getIssue query operations endpoints and reject malformed shapes', async () => {
  const calls = [];
  const ops = loadOps(async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET' });
    if (path.startsWith('/api/operations/issues?')) {
      return { total: 1, items: [sampleIssue()] };
    }
    return sampleIssue();
  });

  const listed = await ops.listIssues({ jobId: 'job-1', status: 'OPEN' });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].problemCode, 'WRONG_CONTAINER');
  assert.equal(calls[0].path, '/api/operations/issues?jobId=job-1&status=OPEN&take=50');

  const fetched = await ops.getIssue('iss-1');
  assert.equal(fetched.id, 'iss-1');
  assert.equal(calls[1].path, '/api/operations/issues/iss-1');

  const badList = loadOps(async () => ({ items: null }));
  await assert.rejects(() => badList.listIssues(), error => error.status === 502 && error.code === 'issue_list_invalid');

  const mismatchIssue = loadOps(async () => sampleIssue({ id: 'other-iss' }));
  await assert.rejects(() => mismatchIssue.getIssue('iss-1'), error => error.status === 502 && error.code === 'issue_invalid');
});

test('resolveOwnHandoverIssue and transitionIssue validate inputs, bind caller token and preserve server rejections', async () => {
  const calls = [];
  const ops = loadOps(async (path, init = {}, token) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, token });
    return sampleIssue({ status: 'RESOLVED', version: 2, allowedTransitions: ['IN_PROGRESS', 'CLOSED'] });
  }, 'staff-token');

  const resolved = await ops.resolveOwnHandoverIssue('iss-1', {
    expectedVersion: 1,
    scannedBarcode: ' CTN-0001 ',
    resolution: ' Swapped onto correct pallet ',
  });
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(calls[0].path, '/api/operations/issues/iss-1/resolve-handover');
  assert.equal(calls[0].token, 'staff-token');
  assert.deepEqual(plain(calls[0].body), {
    expectedVersion: 1,
    scannedBarcode: 'CTN-0001',
    resolution: 'Swapped onto correct pallet',
  });

  await ops.transitionIssue('iss-1', {
    status: 'CLOSED',
    expectedVersion: 2,
  });
  assert.equal(calls[1].path, '/api/operations/issues/iss-1/transition');
  assert.equal(calls[1].token, 'staff-token');
  assert.deepEqual(plain(calls[1].body), {
    status: 'CLOSED',
    expectedVersion: 2,
    resolution: null,
    scannedBarcode: null,
  });

  await assert.rejects(
    () => ops.resolveOwnHandoverIssue('iss-1', { expectedVersion: 0, scannedBarcode: 'CTN-1', resolution: 'ok' }),
    error => error.code === 'issue_resolve_invalid',
  );
  await assert.rejects(
    () => ops.resolveOwnHandoverIssue('iss-1', { expectedVersion: 1, scannedBarcode: '  ', resolution: 'ok' }),
    error => error.code === 'issue_handover_barcode_mismatch',
  );
  await assert.rejects(
    () => ops.transitionIssue('iss-1', { status: 'RESOLVED', expectedVersion: 1, resolution: ' ' }),
    error => error.code === 'issue_resolve_invalid',
  );
});

test('reportWarehouseHazard validates exactly one map location and forwards idempotent requestId', async () => {
  const requests = [];
  const ops = loadOps(async (path, init = {}, token) => {
    requests.push({ path, method: init.method || 'GET', body: JSON.parse(init.body), token });
    return sampleIssue({
      id: 'haz-1',
      code: 'ISS-099',
      issueType: 'OTHER',
      severity: 'CRITICAL',
      problemCode: null,
      hazard: {
        warehouseId: 'wh-1',
        mapVersionId: 'map-1',
        edgeId: 'edge-1',
        zoneId: null,
        endpointId: null,
        locationCode: 'AISLE-01',
        hazardType: 'LIQUID_SPILL',
      },
    });
  }, 'staff-token');

  const created = await ops.reportWarehouseHazard({
    requestId: 'req-uuid-1',
    mapVersionId: 'map-1',
    hazardType: 'LIQUID_SPILL',
    severity: 'CRITICAL',
    description: '  Oil spill near bay 2  ',
    edgeId: 'edge-1',
  });
  assert.equal(created.hazard.locationCode, 'AISLE-01');
  assert.deepEqual(plain(requests[0]), {
    path: '/api/operations/hazards',
    method: 'POST',
    body: {
      requestId: 'req-uuid-1',
      mapVersionId: 'map-1',
      hazardType: 'LIQUID_SPILL',
      severity: 'CRITICAL',
      description: 'Oil spill near bay 2',
      edgeId: 'edge-1',
      zoneId: null,
      endpointId: null,
    },
    token: 'staff-token',
  });

  await assert.rejects(
    () =>
      ops.reportWarehouseHazard({
        requestId: 'req-2',
        mapVersionId: 'map-1',
        hazardType: 'LIQUID_SPILL',
        severity: 'HIGH',
        description: 'Spill',
        edgeId: 'edge-1',
        zoneId: 'zone-1',
      }),
    error => error.code === 'hazard_location_invalid',
  );

  await assert.rejects(
    () =>
      ops.reportWarehouseHazard({
        requestId: 'req-3',
        mapVersionId: 'map-1',
        hazardType: 'LIQUID_SPILL',
        severity: 'HIGH',
        description: '   ',
        endpointId: 'ep-1',
      }),
    error => error.code === 'hazard_description_invalid',
  );
});

test('hazardReportData filters active map locations, builds payloads and keeps stable fingerprints', () => {
  const {
    buildHazardRequestBody,
    collectMapHazardLocations,
    createHazardRequestId,
    hazardPayloadFingerprint,
  } = createLoader()('src/features/safety/hazardReportData.ts');

  const id = createHazardRequestId();
  assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);

  const locs = collectMapHazardLocations({
    id: 'map-1',
    edges: [
      { id: 'e2', mapVersionId: 'map-1', code: 'E-02', direction: 'ONE_WAY', isActive: true },
      { id: 'e1', mapVersionId: 'map-1', code: 'E-01', direction: 'BIDIRECTIONAL', isActive: false },
    ],
    zones: [
      { id: 'z1', mapVersionId: 'map-1', code: 'ZONE-AREA-A', name: 'Inbound Staging', zoneType: 'JUNCTION', isActive: true },
      { id: 'z2', mapVersionId: 'map-other', code: 'ZONE-OTHER', name: 'Other', isActive: true },
    ],
    endpoints: [
      { id: 'ep1', mapVersionId: 'map-1', code: 'IN-01', name: 'Inbound Dock', endpointType: 'WAYPOINT', isEnabled: true },
    ],
  });
  assert.deepEqual(plain(locs.edges.map(x => x.code)), ['E-02']);
  assert.deepEqual(plain(locs.zones.map(x => x.code)), ['ZONE-AREA-A']);
  assert.deepEqual(plain(locs.endpoints.map(x => x.code)), ['IN-01']);

  const fp1 = hazardPayloadFingerprint({
    mapVersionId: 'map-1',
    locationKind: 'zone',
    locationId: 'z1',
    hazardType: 'FALLEN_CARGO',
    severity: 'HIGH',
    description: ' Pallet fallen ',
  });
  const fp2 = hazardPayloadFingerprint({
    mapVersionId: 'map-1',
    locationKind: 'zone',
    locationId: 'z1',
    hazardType: 'FALLEN_CARGO',
    severity: 'HIGH',
    description: 'Pallet fallen',
  });
  assert.equal(fp1, fp2);

  assert.deepEqual(
    plain(
      buildHazardRequestBody('req-1', {
        mapVersionId: 'map-1',
        locationKind: 'zone',
        locationId: 'z1',
        hazardType: 'FALLEN_CARGO',
        severity: 'HIGH',
        description: '  Pallet fallen ',
      }),
    ),
    {
      requestId: 'req-1',
      mapVersionId: 'map-1',
      hazardType: 'FALLEN_CARGO',
      severity: 'HIGH',
      description: 'Pallet fallen',
      edgeId: null,
      zoneId: 'z1',
      endpointId: null,
    },
  );
});
