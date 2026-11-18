/**
 * Evidence Recorder API (Transport Journal / Journey Replay). A separate backend process (docs/adr/0012) reached under
 * /api/evidence: the Vite dev proxy (and the production reverse proxy) sends that prefix to the Recorder; the same
 * access token works there.
 */
import { apiDownload, apiFetch } from './client'

export interface JournalListItem {
  id: string
  transportRequestId: string
  requestCode: string
  evidenceStatus: 'OPEN' | 'FINALIZING' | 'FINALIZED' | 'PARTIAL'
  sourceTransportStatus: string | null
  requestedContainerCount: number
  firstStartedAtUtc: string | null
  lastEndedAtUtc: string | null
  robots: string[]
  runCount: number
  incidentsBySeverity: Record<string, number>
  videoAvailability: 'READY' | 'PROCESSING' | 'MISSING' | 'PARTIAL'
}

export interface PagedJournals {
  items: JournalListItem[]
  total: number
  page: number
  pageSize: number
}

export interface JournalSearch {
  search?: string
  robot?: string
  status?: string
  severity?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface ReplayAsset {
  id: string
  status: string
  durationMs: number | null
}

export interface ReplayRecording {
  id: string
  cameraId: string
  cameraModel: string
  nominalFovDegrees: number | null
  status: string
  startedAtUtc: string
  endedAtUtc: string | null
  assets: ReplayAsset[]
  hasGaps: boolean
}

export interface ReplayRun {
  id: string
  runCorrelationKey: string
  robotCode: string
  robotSourceId: string | null
  sourceJobId: string | null
  sourceJobNo: string | null
  startReason: string | null
  evidenceStatus: string
  sourceRunStatus: string | null
  assignedContainerIds: string[]
  mapVersionId: string | null
  mapVersion: string | null
  startedAtUtc: string | null
  endedAtUtc: string | null
  timeSyncErrorBoundMs: number | null
  trajectoryAvailable: boolean
  planCount: number
  recordings: ReplayRecording[]
}

export interface ReplayManifest {
  journalId: string
  transportRequestId: string
  requestCode: string
  evidenceStatus: string
  sourceTransportStatus: string | null
  requestedContainerCount: number
  fromUtc: string
  toUtc: string
  runs: ReplayRun[]
}

export interface TrajectoryResponse {
  runId: string
  frameId: string
  mapVersion: string | null
  total: number
  downsampled: boolean
  /** [epochMs, x, y, yaw, valid(1|0)] */
  points: [number, number, number, number, number][]
}

export interface PlanResponse {
  planVersion: number
  plannerName: string | null
  generatedAtUtc: string
  validUntilUtc: string | null
  reason: string | null
  pathPoints: [number, number][]
}

export interface EvidenceEvent {
  id: string
  runId: string | null
  sourceSystem: string
  category: string
  eventType: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  occurredAtUtc: string
  x: number | null
  y: number | null
  message: string | null
  payload: unknown
}

export interface PlaybackSpan {
  mediaAssetId: string
  utcStart: string
  utcEnd: string
  mediaStartMs: number
  mediaEndMs: number
  timeErrorBoundMs: number | null
  mappingMethod: string
}

export interface RecordingSpans {
  recordingId: string
  runId: string
  cameraId: string
  cameraModel: string
  nominalFovDegrees: number | null
  status: string
  startedAtUtc: string
  endedAtUtc: string | null
  assets: { id: string; continuityGroupId: string; status: string; profileVersion: string; durationMs: number | null; readyAtUtc: string | null; failureReason: string | null }[]
  spans: PlaybackSpan[]
  gaps: { fromUtc: string; toUtc: string; reason: string }[]
}

export interface PlaybackGrant {
  mode: 'query' | 'cookie'
  masterUrl: string
  query: string | null
  expiresAtUtc: string
}

export interface Annotation {
  id: string
  runId: string | null
  authorUserId: string
  authorName: string | null
  atUtc: string
  category: 'NOTE' | 'OBSERVATION' | 'ROOT_CAUSE' | 'ACTION'
  note: string
  createdAtUtc: string
  updatedAtUtc: string | null
}

export interface AccessAuditRow {
  id: string
  action: string
  result: string
  actorName: string | null
  occurredAtUtc: string
  ipAddress: string | null
  detail: string | null
}

const BASE = '/api/evidence'

function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const evidenceApi = {
  searchJournals: (s: JournalSearch) => apiFetch<PagedJournals>(`${BASE}/journals${query({ ...s })}`),
  journalByRequest: (transportRequestId: string) =>
    apiFetch<{ id: string }>(`${BASE}/journals/by-transport-request/${transportRequestId}`),
  replay: (journalId: string) => apiFetch<ReplayManifest>(`${BASE}/journals/${journalId}/replay`),
  trajectory: (runId: string, maxPoints = 3000) => apiFetch<TrajectoryResponse>(`${BASE}/runs/${runId}/trajectory${query({ maxPoints })}`),
  plans: (runId: string) => apiFetch<PlanResponse[]>(`${BASE}/runs/${runId}/plans`),
  events: (journalId: string) => apiFetch<EvidenceEvent[]>(`${BASE}/journals/${journalId}/events`),
  spans: (recordingId: string) => apiFetch<RecordingSpans>(`${BASE}/recordings/${recordingId}/spans`),
  grant: (assetId: string) => apiFetch<PlaybackGrant>(`${BASE}/media/${assetId}/playback-grant`, { method: 'POST' }),
  annotations: (journalId: string) => apiFetch<Annotation[]>(`${BASE}/journals/${journalId}/annotations`),
  addAnnotation: (journalId: string, body: { atUtc: string; runId: string | null; category: string; note: string }) =>
    apiFetch<Annotation>(`${BASE}/journals/${journalId}/annotations`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAnnotation: (journalId: string, id: string) =>
    apiFetch<void>(`${BASE}/journals/${journalId}/annotations/${id}`, { method: 'DELETE' }),
  audit: (journalId: string) => apiFetch<AccessAuditRow[]>(`${BASE}/journals/${journalId}/audit`),
  exportPacket: (journalId: string, requestCode: string) =>
    apiDownload(`${BASE}/journals/${journalId}/export`, `evidence-${requestCode}.json`, { method: 'POST' }),
}
