/**
 * Idempotent E2E setup for Transport Request create.
 *
 * - HTTP: login, ensure map endpoints, publish map, create/publish workflows
 * - SQL (docker exec psql): warehouse master data (category/product/locations/containers)
 *
 * Usage:
 *   node tools/e2e/transport-request-setup.mjs
 *
 * Env:
 *   API_URL (default http://localhost:5090)
 *   PG_CONTAINER (default warotrans-postgres)
 *   PG_USER / PG_DB (default warotrans)
 *
 * Writes tools/e2e/transport-request-setup.state.json for follow-up cases.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const API = (process.env.API_URL ?? 'http://localhost:5090').replace(/\/+$/, '')
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'warotrans-postgres'
const PG_USER = process.env.PG_USER ?? 'warotrans'
const PG_DB = process.env.PG_DB ?? 'warotrans'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(__dirname, 'transport-request-setup.state.json')

const MARKER = 'TR-E2E'
const WAREHOUSE_CODE = `${MARKER}-WH`
const MAP_NAME = `${MARKER} Map`
const WF_PLAIN = `${MARKER}_PLAIN`
const WF_STAFF = `${MARKER}_STAFF`

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${pathname}`, { method, headers, body: payload })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }
  return json
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function psqlJson(sql) {
  const raw = psql(sql)
  if (!raw) return null
  return JSON.parse(raw)
}

async function login() {
  const session = await api('/api/identity/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123', useCookie: false },
  })
  return session.accessToken
}

function ensureWarehouse() {
  const existing = psqlJson(`
    SELECT json_build_object('id', id::text, 'code', code)
    FROM warehouse.warehouses
    WHERE code = '${WAREHOUSE_CODE}'
    LIMIT 1;
  `)
  if (existing) return existing

  const id = randomUUID()
  psql(`
    INSERT INTO warehouse.warehouses (id, code, name, timezone, is_active, created_at)
    VALUES ('${id}', '${WAREHOUSE_CODE}', 'Transport Request E2E', 'Asia/Ho_Chi_Minh', true, NOW());
  `)
  return { id, code: WAREHOUSE_CODE }
}

async function ensureMap(token, warehouseId) {
  const maps = await api(`/api/navigation/warehouses/${warehouseId}/maps`, { token })
  let map = (Array.isArray(maps) ? maps : maps.items ?? []).find((m) => m.name === MAP_NAME)
  if (!map) {
    map = await api(`/api/navigation/warehouses/${warehouseId}/maps`, {
      method: 'POST',
      token,
      body: {
        name: MAP_NAME,
        mapUri: 'http://storage/tr-e2e-map.yaml',
        resolution: 0.05,
        originX: 0,
        originY: 0,
        originYaw: 0,
        imageWidthPixels: 400,
        imageHeightPixels: 300,
      },
    })
  }

  if (map.status === 'PUBLISHED') {
    const detail = await api(`/api/navigation/maps/${map.id}/detail`, { token })
    return detail
  }

  // Draft: ensure endpoints, then publish (archives previous published for warehouse if any).
  const detail = await api(`/api/navigation/maps/${map.id}/detail`, { token })
  const wanted = [
    { name: 'Inbound Dock', endpointType: 'INBOUND', x: 1, y: 1 },
    { name: 'Shelf A1', endpointType: 'STORAGE', x: 3, y: 1 },
    { name: 'Shelf A2', endpointType: 'STORAGE', x: 4, y: 1 },
    { name: 'Shelf B1', endpointType: 'STORAGE', x: 3, y: 2 },
    { name: 'Shelf B2', endpointType: 'STORAGE', x: 4, y: 2 },
    { name: 'Shelf C1', endpointType: 'STORAGE', x: 3, y: 3 },
    { name: 'Shelf C2', endpointType: 'STORAGE', x: 4, y: 3 },
    { name: 'Outbound Dock', endpointType: 'OUTBOUND', x: 6, y: 1 },
    { name: 'Buffer Bay', endpointType: 'TRANSIT', x: 2, y: 2 },
  ]

  const existingNames = new Set((detail.endpoints ?? []).map((e) => e.name))
  for (const ep of wanted) {
    if (existingNames.has(ep.name)) continue
    await api(`/api/navigation/maps/${map.id}/endpoints`, {
      method: 'POST',
      token,
      body: {
        name: ep.name,
        endpointType: ep.endpointType,
        x: ep.x,
        y: ep.y,
        yaw: 0,
        positionTolerance: 0.1,
        yawTolerance: 0.2,
        isEnabled: true,
      },
    })
  }

  await api(`/api/navigation/maps/${map.id}/publish`, { method: 'POST', token })
  return api(`/api/navigation/maps/${map.id}/detail`, { token })
}

function workflowBody(code, name, withStaffInput) {
  const variables = [
    {
      key: 'minBatteryPercent',
      name: 'minBatteryPercent',
      dataType: 'DECIMAL',
      source: 'ADMIN_INPUT',
      isRequired: true,
      sequenceNo: 0,
      configuredValue: 25,
    },
    {
      key: 'assignedRobotId',
      name: 'assignedRobotId',
      dataType: 'UUID',
      source: 'SYSTEM_VALUE',
      isRequired: true,
      sequenceNo: 1,
    },
    {
      key: 'transportRequestId',
      name: 'transportRequestId',
      dataType: 'UUID',
      source: 'SYSTEM_VALUE',
      isRequired: true,
      sequenceNo: 2,
    },
  ]
  if (withStaffInput) {
    variables.push({
      key: 'handlingInstruction',
      name: 'Handling instruction',
      dataType: 'STRING',
      source: 'STAFF_INPUT',
      isRequired: true,
      sequenceNo: 3,
      description: 'Staff note for this request',
    })
  }

  return {
    code,
    name,
    variables,
    tasks: [
      {
        taskKey: 'PICKUP',
        name: 'Pickup',
        sequenceNo: 1,
        steps: [
          {
            stepKey: 'MOVE_PICKUP',
            name: 'MOVE_PICKUP',
            stepType: 'MOVE',
            operationCode: 'PICKUP',
            sequenceNo: 1,
            inputBindings: {
              robotId: { sourceType: 'WORKFLOW_VAR', sourceReference: 'assignedRobotId' },
              targetEndpointId: { sourceType: 'CURRENT_MOVEMENT', sourceReference: 'source.endpointId' },
              purpose: { sourceType: 'CONSTANT', constantValue: 'PICKUP' },
            },
          },
        ],
      },
      {
        taskKey: 'DELIVERY',
        name: 'Delivery',
        sequenceNo: 2,
        steps: [
          {
            stepKey: 'MOVE_DROPOFF',
            name: 'MOVE_DROPOFF',
            stepType: 'MOVE',
            operationCode: 'DROPOFF',
            sequenceNo: 1,
            inputBindings: {
              robotId: { sourceType: 'WORKFLOW_VAR', sourceReference: 'assignedRobotId' },
              targetEndpointId: { sourceType: 'CURRENT_MOVEMENT', sourceReference: 'destination.endpointId' },
              purpose: { sourceType: 'CONSTANT', constantValue: 'DROPOFF' },
            },
          },
        ],
      },
    ],
  }
}

async function ensureWorkflow(token, code, name, withStaffInput) {
  const listed = await api(`/api/workflow-execution/workflows?code=${encodeURIComponent(code)}`, { token })
  let workflow = (listed.items ?? []).find((w) => w.code === code)
  if (!workflow) {
    workflow = await api('/api/workflow-execution/workflows', {
      method: 'POST',
      token,
      body: workflowBody(code, name, withStaffInput),
    })
  }
  if (workflow.status !== 'PUBLISHED') {
    workflow = await api(`/api/workflow-execution/workflows/${workflow.id}/publish`, {
      method: 'POST',
      token,
    })
  }
  return workflow
}

function ensureMasterData(warehouseId, endpointsByName) {
  const categoryId = randomUUID()
  const productId = randomUUID()
  const now = new Date().toISOString()

  const category = psqlJson(`
    SELECT json_build_object('id', id::text)
    FROM warehouse.product_categories
    WHERE code = '${MARKER}-CAT'
    LIMIT 1;
  `)
  const finalCategoryId = category?.id ?? categoryId
  if (!category) {
    psql(`
      INSERT INTO warehouse.product_categories (id, code, name)
      VALUES ('${finalCategoryId}', '${MARKER}-CAT', 'E2E Category');
    `)
  }

  const product = psqlJson(`
    SELECT json_build_object('id', id::text, 'sku', sku)
    FROM warehouse.products
    WHERE sku = '${MARKER}-SKU-001'
    LIMIT 1;
  `)
  const finalProductId = product?.id ?? productId
  if (!product) {
    psql(`
      INSERT INTO warehouse.products (id, category_id, sku, name, is_active, created_at, updated_at)
      VALUES ('${finalProductId}', '${finalCategoryId}', '${MARKER}-SKU-001', 'E2E Widget', true, '${now}', '${now}');
    `)
  }

  const locationDefs = [
    { code: 'LOC-A1', name: 'Location A1', endpointName: 'Shelf A1' },
    { code: 'LOC-A2', name: 'Location A2', endpointName: 'Shelf A2' },
    { code: 'LOC-B1', name: 'Location B1', endpointName: 'Shelf B1' },
    { code: 'LOC-B2', name: 'Location B2', endpointName: 'Shelf B2' },
    { code: 'LOC-C1', name: 'Location C1', endpointName: 'Shelf C1' },
    { code: 'LOC-C2', name: 'Location C2', endpointName: 'Shelf C2' },
  ]

  const locations = {}
  for (const def of locationDefs) {
    const endpoint = endpointsByName[def.endpointName]
    if (!endpoint) throw new Error(`Missing endpoint ${def.endpointName}`)
    const existing = psqlJson(`
      SELECT json_build_object('id', id::text, 'code', code, 'endpointId', endpoint_id::text)
      FROM warehouse.storage_locations
      WHERE warehouse_id = '${warehouseId}' AND code = '${def.code}'
      LIMIT 1;
    `)
    if (existing) {
      locations[def.code] = existing
      continue
    }
    const id = randomUUID()
    psql(`
      INSERT INTO warehouse.storage_locations (id, warehouse_id, endpoint_id, code, name, is_active, created_at)
      VALUES ('${id}', '${warehouseId}', '${endpoint.id}', '${def.code}', '${def.name}', true, '${now}');
    `)
    locations[def.code] = { id, code: def.code, endpointId: endpoint.id }
  }

  const containerDefs = [
    { barcode: 'CTN-E2E-IN-001', status: 'CREATED', locationCode: null, level: null },
    { barcode: 'CTN-E2E-OUT-001', status: 'STORED', locationCode: 'LOC-A1', level: 1 },
    { barcode: 'CTN-E2E-REL-001', status: 'STORED', locationCode: 'LOC-B1', level: 2 },
    { barcode: 'CTN-E2E-REL-002', status: 'PACKED', locationCode: 'LOC-B2', level: 1 },
  ]

  const accountId = psql(`SELECT id::text FROM identity.accounts ORDER BY created_at LIMIT 1;`) || randomUUID()
  const containers = {}
  for (const def of containerDefs) {
    const existing = psqlJson(`
      SELECT json_build_object(
        'id', id::text,
        'barcode', barcode,
        'status', status::text,
        'currentStorageLocationId', current_storage_location_id::text,
        'currentLevelNo', current_level_no
      )
      FROM warehouse.containers
      WHERE barcode = '${def.barcode}'
      LIMIT 1;
    `)
    if (existing) {
      containers[def.barcode] = existing
      continue
    }
    const id = randomUUID()
    const locId = def.locationCode ? locations[def.locationCode].id : null
    const locSql = locId ? `'${locId}'` : 'NULL'
    const levelSql = def.level == null ? 'NULL' : String(def.level)
    psql(`
      INSERT INTO warehouse.containers (
        id, product_id, barcode, status, current_storage_location_id, current_level_no, created_by, created_at, updated_at
      ) VALUES (
        '${id}', '${finalProductId}', '${def.barcode}', '${def.status}', ${locSql}, ${levelSql}, '${accountId}', '${now}', '${now}'
      );
    `)
    containers[def.barcode] = {
      id,
      barcode: def.barcode,
      status: def.status,
      currentStorageLocationId: locId,
      currentLevelNo: def.level,
    }
  }

  return { productId: finalProductId, locations, containers }
}

async function main() {
  console.log(`API ${API}`)
  const token = await login()
  console.log('Logged in as admin')

  const warehouse = ensureWarehouse()
  console.log(`Warehouse ${warehouse.code} (${warehouse.id})`)

  const map = await ensureMap(token, warehouse.id)
  console.log(`Map ${map.name} ${map.status} endpoints=${map.endpoints.length}`)

  const endpointsByName = Object.fromEntries(map.endpoints.map((e) => [e.name, e]))
  const plain = await ensureWorkflow(token, WF_PLAIN, 'E2E Plain Transport', false)
  const staff = await ensureWorkflow(token, WF_STAFF, 'E2E Staff Input Transport', true)
  console.log(`Workflows plain=${plain.id} staff=${staff.id}`)

  const master = ensureMasterData(warehouse.id, endpointsByName)
  console.log(`Containers ${Object.keys(master.containers).join(', ')}`)

  const state = {
    generatedAt: new Date().toISOString(),
    api: API,
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    mapVersionId: map.id,
    mapName: map.name,
    endpoints: Object.fromEntries(
      Object.entries(endpointsByName).map(([name, e]) => [
        name,
        { id: e.id, code: e.code, endpointType: e.endpointType, x: e.x, y: e.y },
      ]),
    ),
    workflows: {
      plain: { id: plain.id, code: plain.code },
      staff: { id: staff.id, code: staff.code },
    },
    locations: master.locations,
    containers: master.containers,
  }

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  console.log(`Wrote ${STATE_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
