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
  /** A container problem code (see containerProblems.ts), when the issue is about a container. */
  problemCode?: string | null
  /** An open WRONG / MISSING container issue: the handover of that container cannot be confirmed. */
  blocksHandover?: boolean
  /** Every problem found (an inspection may find several); the first is `problemCode`. */
  defects?: string[]
  /** The container was taken off its Job ("Container failed", a failed inspection). */
  removedFromJob?: boolean
  /** Detail only: the container as Warehouse has it now (held by this issue when `holdIssueId` is this issue). */
  containerHold?: ContainerHold | null
  /** The outcomes its problem allows when it is resolved (a wrong product inside: SCRAP only). */
  containerOutcomes?: ContainerOutcome[]
  /** What resolving it did with the package, once resolved. */
  containerOutcome?: ContainerOutcome | null
}

/** A container as Warehouse holds it (GET issue detail). */
export interface ContainerHold {
  containerId: string
  barcode: string
  status: string
  /** A container problem code, OFF_SHELF (set down where no shelf is), or null. */
  holdReasonCode: string | null
  holdIssueId: string | null
  heldAt: string | null
  storageLocationId: string | null
  levelNo: number | null
  /** Where it stands when it is on no shelf (a gate, the inspection point). */
  holdEndpointId: string | null
  contentsQuantity: number | null
}

/** What resolving an issue does with the package it holds (a container is a packed box of goods, not a tote). */
export type ContainerOutcome = 'RELEASE' | 'ADJUST_QUANTITY' | 'REPACK' | 'RELABEL' | 'RESTACK' | 'FOUND' | 'SCRAP' | 'LOST'

export interface IssueListResponse {
  total: number
  items: Issue[]
  /** Issues per type under every other filter, for the type tabs (every type present, 0 when none). */
  countsByType?: Partial<Record<IssueType, number>>
}

export interface IssueQuery {
  status?: IssueStatus | ''
  issueType?: IssueType | ''
  severity?: IssueSeverity | ''
  /** Reported in `[reportedFrom, reportedTo)`. */
  reportedFrom?: Date
  reportedTo?: Date
  mine?: boolean
  /** Only the issues about this robot. */
  robotId?: string
  /** Only the issues of this Job. */
  jobId?: string
  problemCode?: string
  skip?: number
  take?: number
}

export function listIssues(params: IssueQuery = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.issueType) query.set('issueType', params.issueType)
  if (params.severity) query.set('severity', params.severity)
  if (params.reportedFrom) query.set('reportedFrom', params.reportedFrom.toISOString())
  if (params.reportedTo) query.set('reportedTo', params.reportedTo.toISOString())
  if (params.mine) query.set('mine', 'true')
  if (params.robotId) query.set('robotId', params.robotId)
  if (params.jobId) query.set('jobId', params.jobId)
  if (params.problemCode) query.set('problemCode', params.problemCode)
  query.set('take', String(params.take ?? 50))
  if (params.skip) query.set('skip', String(params.skip))
  return apiRequest<IssueListResponse>(`/api/operations/issues?${query}`)
}

export function getIssue(id: string) {
  return apiRequest<Issue>(`/api/operations/issues/${id}`)
}

/**
 * Rejects with `issue_transition_not_allowed` or `issue_version_conflict` (409). Resolving an issue that holds a
 * container needs `containerOutcome` (and `contentsQuantity` with ADJUST_QUANTITY): `issue_container_outcome_required`.
 */
export function transitionIssue(
  issue: Issue,
  status: IssueStatus,
  resolution?: string,
  container?: { containerOutcome?: ContainerOutcome; contentsQuantity?: number | null; scannedBarcode?: string },
) {
  return apiRequest<Issue>(`/api/operations/issues/${issue.id}/transition`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      expectedVersion: issue.version,
      resolution,
      containerOutcome: container?.containerOutcome ?? null,
      contentsQuantity: container?.contentsQuantity ?? null,
      scannedBarcode: container?.scannedBarcode ?? null,
    }),
  })
}

export interface CreateIssueBody {
  issueType: IssueType
  severity: IssueSeverity
  description: string
  robotId?: string
  evidence?: { kind: string; note?: string }[]
  /** A container problem: a CONTAINER issue with its code, about that container of that Job. */
  containerId?: string
  jobId?: string
  jobStepId?: string
  transportRequestId?: string
  problemCode?: string
}

export function createIssue(body: CreateIssueBody) {
  return apiRequest<Issue>('/api/operations/issues', { method: 'POST', body: JSON.stringify(body) })
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
