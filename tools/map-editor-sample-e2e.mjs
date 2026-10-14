/**
 * Live Map Editor sample-map API E2E (throwaway / local verification).
 * Measures pixel round-trip error after create → GET detail → worldToPixel.
 *
 * Usage:
 *   node tools/map-editor-sample-e2e.mjs
 *   node tools/map-editor-sample-e2e.mjs --detail <mapId>
 * Env: API_URL (default http://localhost:5090)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API = (process.env.API_URL ?? 'http://localhost:5090').replace(/\/+$/, '')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SAMPLE_DIR = path.join(ROOT, 'web', 'public', 'test-maps', 'sample')

const EPS_LOG = []

function pixelToWorld(params, pixel) {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const localX = pixel.u * resolution
  const localY = (imageHeightPixels - pixel.v) * resolution
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  return {
    x: originX + cos * localX - sin * localY,
    y: originY + sin * localX + cos * localY,
  }
}

function worldToPixel(params, world) {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const dx = world.x - originX
  const dy = world.y - originY
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  const localX = cos * dx + sin * dy
  const localY = -sin * dx + cos * dy
  return {
    u: localX / resolution,
    v: imageHeightPixels - localY / resolution,
  }
}

async function api(pathname, { method = 'GET', token, body, formData, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (formData) {
    init.body = formData
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${API}${pathname}`, init)
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
  return { status: res.status, json, headers: res.headers }
}

function log(msg) {
  console.log(msg)
  EPS_LOG.push(msg)
}

async function login() {
  const result = await api('/api/identity/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123', useCookie: false },
  })
  return result.json.accessToken
}

/** Print map detail + world→pixel for browser verification. */
async function detailMode(mapId) {
  const token = await login()
  const detail = await api(`/api/navigation/maps/${mapId}/detail`, { token })
  const m = detail.json
  const transform = {
    resolution: m.resolution,
    originX: m.originX,
    originY: m.originY,
    originYaw: m.originYaw,
    imageHeightPixels: m.imageHeightPixels,
  }
  console.log(JSON.stringify({
    id: m.id,
    code: m.code,
    status: m.status,
    resolution: m.resolution,
    origin: [m.originX, m.originY, m.originYaw],
    size: [m.imageWidthPixels, m.imageHeightPixels],
    endpoints: m.endpoints.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      x: e.x,
      y: e.y,
      yaw: e.yaw,
      pixel: worldToPixel(transform, { x: e.x, y: e.y }),
    })),
    edges: m.edges.map((e) => ({
      id: e.id,
      code: e.code,
      widthMeters: e.widthMeters,
      direction: e.direction,
      capacity: e.capacity,
      maxSpeed: e.maxSpeed,
      isActive: e.isActive,
      geometry: e.geometry,
      pixels: e.geometry.coordinates.map(([x, y]) => worldToPixel(transform, { x, y })),
    })),
    zones: m.zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      zoneType: z.zoneType,
      capacity: z.capacity,
      maxSpeed: z.maxSpeed,
      policy: z.policy,
      geometry: z.geometry,
      pixels: (z.geometry.coordinates[0] ?? []).map(([x, y]) => worldToPixel(transform, { x, y })),
    })),
  }, null, 2))
}

async function fullImportRoundTrip() {
  log(`API = ${API}`)
  const token = await login()
  log(`Login OK as admin`)

  const warehouses = await api('/api/warehouse/warehouses?isActive=true&take=50', { token })
  const warehouse = warehouses.json.items?.[0] ?? warehouses.json[0]
  if (!warehouse?.id) throw new Error('No warehouse found')
  log(`Warehouse ${warehouse.code} (${warehouse.id})`)

  const yamlPath = path.join(SAMPLE_DIR, 'map.yaml')
  const pgmPath = path.join(SAMPLE_DIR, 'map.pgm')
  if (!fs.existsSync(yamlPath) || !fs.existsSync(pgmPath)) {
    throw new Error(`Sample fixture missing under ${SAMPLE_DIR}`)
  }

  const form = new FormData()
  form.append('name', 'E2E Sample Map')
  form.append('yaml', new Blob([fs.readFileSync(yamlPath)]), 'map.yaml')
  form.append('pgm', new Blob([fs.readFileSync(pgmPath)]), 'map.pgm')

  const imported = await api(`/api/navigation/warehouses/${warehouse.id}/maps/import`, {
    method: 'POST',
    token,
    formData: form,
  })
  const map = imported.json
  log(
    `Import OK ${map.code} status=${map.status} ${map.imageWidthPixels}x${map.imageHeightPixels} res=${map.resolution} origin=(${map.originX},${map.originY},${map.originYaw})`,
  )

  const preview = await fetch(`${API}${map.previewImageUri}`)
  log(`Preview GET ${map.previewImageUri} → ${preview.status} ${preview.headers.get('content-type')}`)
  if (!preview.ok) throw new Error('Preview PNG not reachable')

  const transform = {
    resolution: map.resolution,
    originX: map.originX,
    originY: map.originY,
    originYaw: map.originYaw,
    imageHeightPixels: map.imageHeightPixels,
  }

  const click = { u: 412.37, v: 501.82 }
  const world = pixelToWorld(transform, click)
  log(`Click pixel (u,v)=(${click.u}, ${click.v}) → world (x,y)=(${world.x}, ${world.y})`)

  const ep = await api(`/api/navigation/maps/${map.id}/endpoints`, {
    method: 'POST',
    token,
    body: {
      name: 'E2E Endpoint',
      endpointType: 'TRANSIT',
      x: world.x,
      y: world.y,
      yaw: 0.5,
      positionTolerance: 0.1,
      yawTolerance: (5 * Math.PI) / 180,
    },
  })
  log(`Endpoint created ${ep.json.code} id=${ep.json.id}`)

  const edgePixels = [
    { u: 300.25, v: 400.5 },
    { u: 350.75, v: 420.25 },
    { u: 410.0, v: 450.125 },
  ]
  const edgeWorld = edgePixels.map((p) => pixelToWorld(transform, p))
  const edge = await api(`/api/navigation/maps/${map.id}/edges`, {
    method: 'POST',
    token,
    body: {
      geometry: {
        type: 'LineString',
        coordinates: edgeWorld.map((p) => [p.x, p.y]),
      },
      widthMeters: 1.2,
      direction: 'ONE_WAY',
      capacity: 1,
      isActive: true,
    },
  })
  log(`Edge created ${edge.json.code}`)

  const zonePixels = [
    { u: 500.1, v: 300.2 },
    { u: 560.4, v: 300.2 },
    { u: 560.4, v: 360.8 },
    { u: 500.1, v: 360.8 },
  ]
  const zoneWorld = zonePixels.map((p) => pixelToWorld(transform, p))
  const ring = [...zoneWorld.map((p) => [p.x, p.y]), [zoneWorld[0].x, zoneWorld[0].y]]
  const zone = await api(`/api/navigation/maps/${map.id}/zones`, {
    method: 'POST',
    token,
    body: {
      name: 'E2E Zone',
      zoneType: 'RESTRICTED_AREA',
      geometry: { type: 'Polygon', coordinates: [ring] },
      capacity: 2,
      isActive: true,
    },
  })
  log(`Zone created ${zone.json.code}`)

  const detail = await api(`/api/navigation/maps/${map.id}/detail`, { token })
  const dEp = detail.json.endpoints.find((e) => e.id === ep.json.id)
  const dEdge = detail.json.edges.find((e) => e.id === edge.json.id)
  const dZone = detail.json.zones.find((z) => z.id === zone.json.id)

  const epBack = worldToPixel(transform, { x: dEp.x, y: dEp.y })
  const epErr = Math.hypot(epBack.u - click.u, epBack.v - click.v)
  log(`Endpoint round-trip pixel error = ${epErr.toExponential(3)} px (u=${epBack.u}, v=${epBack.v})`)

  const edgeErrs = dEdge.geometry.coordinates.map(([x, y], i) => {
    const back = worldToPixel(transform, { x, y })
    const err = Math.hypot(back.u - edgePixels[i].u, back.v - edgePixels[i].v)
    return err
  })
  log(`Edge vertex pixel errors = [${edgeErrs.map((e) => e.toExponential(3)).join(', ')}] max=${Math.max(...edgeErrs).toExponential(3)}`)

  const zoneRing = dZone.geometry.coordinates[0]
  const zoneErrs = zonePixels.map((p, i) => {
    const [x, y] = zoneRing[i]
    const back = worldToPixel(transform, { x, y })
    return Math.hypot(back.u - p.u, back.v - p.v)
  })
  log(`Zone vertex pixel errors = [${zoneErrs.map((e) => e.toExponential(3)).join(', ')}] max=${Math.max(...zoneErrs).toExponential(3)}`)

  await api(`/api/navigation/endpoints/${ep.json.id}`, {
    method: 'PUT',
    token,
    body: {
      name: 'E2E Endpoint Updated',
      endpointType: 'TRANSIT',
      x: dEp.x,
      y: dEp.y,
      yaw: 1.0,
      positionTolerance: 0.15,
      yawTolerance: 0.2,
      isEnabled: true,
    },
  })
  await api(`/api/navigation/edges/${edge.json.id}`, {
    method: 'PUT',
    token,
    body: {
      geometry: dEdge.geometry,
      widthMeters: 1.5,
      direction: 'BIDIRECTIONAL',
      capacity: 2,
      isActive: true,
    },
  })
  await api(`/api/navigation/zones/${zone.json.id}`, {
    method: 'PUT',
    token,
    body: {
      name: 'E2E Zone Updated',
      zoneType: 'RESTRICTED_AREA',
      geometry: dZone.geometry,
      capacity: 3,
      isActive: true,
    },
  })
  log('Update OK for endpoint/edge/zone')

  await api(`/api/navigation/endpoints/${ep.json.id}`, { method: 'DELETE', token })
  await api(`/api/navigation/edges/${edge.json.id}`, { method: 'DELETE', token })
  await api(`/api/navigation/zones/${zone.json.id}`, { method: 'DELETE', token })
  const after = await api(`/api/navigation/maps/${map.id}/detail`, { token })
  const gone =
    !after.json.endpoints.some((e) => e.id === ep.json.id) &&
    !after.json.edges.some((e) => e.id === edge.json.id) &&
    !after.json.zones.some((z) => z.id === zone.json.id)
  log(`Delete OK confirmed=${gone}`)
  log('LIVE API VERIFIED')
  return map.id
}

async function main() {
  const args = process.argv.slice(2)
  const detailIdx = args.indexOf('--detail')
  if (detailIdx >= 0) {
    const mapId = args[detailIdx + 1]
    if (!mapId) throw new Error('--detail requires a mapId')
    await detailMode(mapId)
    return
  }
  await fullImportRoundTrip()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
