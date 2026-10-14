/**
 * Runs Transport Request create cases B (outbound) and C (relocation) via API.
 * Case A is intended for browser UI; this script can also run A via API with --include-a.
 *
 * Usage:
 *   node tools/e2e/transport-request-cases.mjs
 *   node tools/e2e/transport-request-cases.mjs --include-a
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(__dirname, 'transport-request-setup.state.json')
const RESULT_PATH = path.join(__dirname, 'transport-request-cases.result.json')
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'warotrans-postgres'
const PG_USER = process.env.PG_USER ?? 'warotrans'
const PG_DB = process.env.PG_DB ?? 'warotrans'
const includeA = process.argv.includes('--include-a')

const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const API = (process.env.API_URL ?? state.api ?? 'http://localhost:5090').replace(/\/+$/, '')

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
  return { status: res.status, json }
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

async function login() {
  const { json } = await api('/api/identity/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123', useCookie: false },
  })
  return { token: json.accessToken, accountId: json.account.id }
}

function jobsCount() {
  return Number(psql('SELECT count(*) FROM execution.jobs;'))
}

function verifyRequest(id) {
  const row = JSON.parse(
    psql(`
      SELECT json_build_object(
        'id', r.id::text,
        'requestCode', r.request_code,
        'status', r.status::text,
        'requestedBy', r.requested_by::text,
        'workflowInputs', r.workflow_inputs,
        'detailCount', (SELECT count(*) FROM transportation.transport_request_details d WHERE d.transport_request_id = r.id),
        'detailStatuses', (
          SELECT json_agg(d.status::text ORDER BY d.sequence_no)
          FROM transportation.transport_request_details d
          WHERE d.transport_request_id = r.id
        )
      )
      FROM transportation.transport_requests r
      WHERE r.id = '${id}';
    `),
  )
  return row
}

async function createCase(token, name, body) {
  const beforeJobs = jobsCount()
  const { status, json } = await api('/api/transportation/transport-requests', {
    method: 'POST',
    token,
    body,
  })
  const afterJobs = jobsCount()
  const db = verifyRequest(json.id)
  const result = {
    name,
    httpStatus: status,
    id: json.id,
    requestCode: json.requestCode,
    apiStatus: json.status,
    dbStatus: db.status,
    requestedBy: db.requestedBy,
    detailCount: db.detailCount,
    detailStatuses: db.detailStatuses,
    workflowInputs: db.workflowInputs,
    jobsBefore: beforeJobs,
    jobsAfter: afterJobs,
    noJobSideEffect: beforeJobs === afterJobs,
    pass:
      status === 201 &&
      json.status === 'SUBMITTED' &&
      db.status === 'SUBMITTED' &&
      db.detailCount >= 1 &&
      (db.detailStatuses ?? []).every((s) => s === 'PENDING') &&
      beforeJobs === afterJobs,
  }
  console.log(
    `${result.pass ? 'PASS' : 'FAIL'} ${name}: ${result.requestCode} status=${result.dbStatus} details=${result.detailCount} jobs=${result.jobsBefore}->${result.jobsAfter}`,
  )
  return result
}

async function main() {
  const { token, accountId } = await login()
  const results = []

  if (includeA) {
    results.push(
      await createCase(token, 'A_inbound', {
        warehouseId: state.warehouseId,
        mapVersionId: state.mapVersionId,
        workflowId: state.workflows.plain.id,
        workflowInputs: {},
        note: 'E2E case A inbound',
        details: [
          {
            sequenceNo: 1,
            containerId: state.containers['CTN-E2E-IN-001'].id,
            sourceStorageLocationId: null,
            sourceEndpointId: state.endpoints['Inbound Dock'].id,
            sourceLevelNo: null,
            destinationStorageLocationId: state.locations['LOC-A2'].id,
            destinationEndpointId: state.locations['LOC-A2'].endpointId,
            destinationLevelNo: 1,
          },
        ],
      }),
    )
  }

  results.push(
    await createCase(token, 'B_outbound', {
      warehouseId: state.warehouseId,
      mapVersionId: state.mapVersionId,
      workflowId: state.workflows.staff.id,
      workflowInputs: { handlingInstruction: 'ship today' },
      note: 'E2E case B outbound',
      details: [
        {
          sequenceNo: 1,
          containerId: state.containers['CTN-E2E-OUT-001'].id,
          sourceStorageLocationId: state.locations['LOC-A1'].id,
          sourceEndpointId: state.locations['LOC-A1'].endpointId,
          sourceLevelNo: 1,
          destinationStorageLocationId: null,
          destinationEndpointId: state.endpoints['Outbound Dock'].id,
          destinationLevelNo: null,
        },
      ],
    }),
  )

  results.push(
    await createCase(token, 'C_relocation', {
      warehouseId: state.warehouseId,
      mapVersionId: state.mapVersionId,
      workflowId: state.workflows.plain.id,
      workflowInputs: {},
      note: 'E2E case C relocation',
      details: [
        {
          sequenceNo: 1,
          containerId: state.containers['CTN-E2E-REL-001'].id,
          sourceStorageLocationId: state.locations['LOC-B1'].id,
          sourceEndpointId: state.locations['LOC-B1'].endpointId,
          sourceLevelNo: 2,
          destinationStorageLocationId: state.locations['LOC-C1'].id,
          destinationEndpointId: state.locations['LOC-C1'].endpointId,
          destinationLevelNo: 1,
        },
        {
          sequenceNo: 2,
          containerId: state.containers['CTN-E2E-REL-002'].id,
          sourceStorageLocationId: state.locations['LOC-B2'].id,
          sourceEndpointId: state.locations['LOC-B2'].endpointId,
          sourceLevelNo: 1,
          destinationStorageLocationId: state.locations['LOC-C2'].id,
          destinationEndpointId: state.locations['LOC-C2'].endpointId,
          destinationLevelNo: 2,
        },
      ],
    }),
  )

  const list = await api(
    `/api/transportation/transport-requests?warehouseId=${state.warehouseId}&take=50`,
    { token },
  )

  const out = {
    generatedAt: new Date().toISOString(),
    accountId,
    results,
    listTotal: list.json.total,
    allPass: results.every((r) => r.pass),
  }
  fs.writeFileSync(RESULT_PATH, JSON.stringify(out, null, 2))
  console.log(`Wrote ${RESULT_PATH}`)
  if (!out.allPass) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
