import { apiRequest } from './client'

export type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IssueType = 'CONTAINER' | 'TRANSPORT' | 'JOB' | 'ROBOT' | 'STORAGE' | 'OTHER'

export interface IssueEvidence {
  kind: string
  uri: string | null
  mimeType: string | null
  note: string | null
  addedBy: string | null
  addedAt: string | null
}

/** GET /api/operations/issues/{id} (OPS-01). `allowedTransitions` comes from the server's lifecycle. */
export interface Issue {
  id: string
  code: string
  issueType: IssueType
  severity: IssueSeverity
  status: IssueStatus
  description: string
  reportedBy: string
  assigneeId: string | null
  containerId: string | null
  transportRequestId: string | null
  jobId: string | null
  jobStepId: string | null
  storageLocationId: string | null
  robotId: string | null
  evidence: IssueEvidence[]
  version: number
  reportedAt: string
  updatedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolution: string | null
  allowedTransitions: IssueStatus[]
}

export interface IssueListResponse {
  total: number
  items: Issue[]
}

export interface IssueQuery {
  status?: IssueStatus | ''
  severity?: IssueSeverity | ''
  mine?: boolean
  skip?: number
  take?: number
}

export function listIssues(params: IssueQuery = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.severity) query.set('severity', params.severity)
  if (params.mine) query.set('mine', 'true')
  query.set('take', String(params.take ?? 50))
  if (params.skip) query.set('skip', String(params.skip))
  return apiRequest<IssueListResponse>(`/api/operations/issues?${query}`)
}

export function getIssue(id: string) {
  return apiRequest<Issue>(`/api/operations/issues/${id}`)
}

/** Rejects with `issue_transition_not_allowed` or `issue_version_conflict` (409). */
export function transitionIssue(issue: Issue, status: IssueStatus, resolution?: string) {
  return apiRequest<Issue>(`/api/operations/issues/${issue.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status, expectedVersion: issue.version, resolution }),
  })
}

export function assignIssue(issue: Issue, assigneeId: string | null) {
  return apiRequest<Issue>(`/api/operations/issues/${issue.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assigneeId, expectedVersion: issue.version }),
  })
}

/** One entry of the audit trail (SY-05 / OPS-02). */
export interface AuditLogEntry {
  id: string
  occurredAt: string
  actorAccountId: string | null
  actorUsername: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  reason: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  context: Record<string, unknown> | null
  correlationId: string | null
  sourceIp: string | null
}

export interface AuditLogQuery {
  action?: string
  entityType?: string
  entityId?: string
  skip?: number
  take?: number
}

export function listAuditLogs(params: AuditLogQuery = {}) {
  const query = new URLSearchParams()
  if (params.action) query.set('action', params.action)
  if (params.entityType) query.set('entityType', params.entityType)
  if (params.entityId) query.set('entityId', params.entityId)
  query.set('take', String(params.take ?? 100))
  if (params.skip) query.set('skip', String(params.skip))
  return apiRequest<{ total: number; items: AuditLogEntry[] }>(`/api/operations/audit-logs?${query}`)
}
