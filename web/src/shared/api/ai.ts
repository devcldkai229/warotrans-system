/**
 * WaroTrans.AI client (/api/ai → ai-api, see vite.config.ts). Only used when VITE_AI_ENABLED=true.
 * Types mirror warotrans_ai.domain / application models; the server decides permissions (availableActions).
 */
import { apiFetch } from './client'

const BASE = '/api/ai/v1'

export type CaseStatus =
  | 'DETECTED' | 'INVESTIGATING' | 'NEEDS_MORE_EVIDENCE' | 'ANALYSIS_INCOMPLETE' | 'DIAGNOSED' | 'TICKETED'
  | 'IN_RESOLUTION' | 'VERIFYING' | 'CLOSED' | 'REOPENED' | 'DISMISSED'
export type LoopStage = 'DETECT' | 'INVESTIGATE' | 'DIAGNOSE' | 'TICKET' | 'RESOLVE' | 'VERIFY' | 'CLOSED'
export type CaseAction = 'INVESTIGATE' | 'ASK' | 'CREATE_TICKET' | 'PUSH_JIRA' | 'START_RESOLUTION' | 'VERIFY' | 'DISMISS' | 'REOPEN'

export interface AuditEntry { at: string; actor: string; action: string; detail: string }

export interface AiCase {
  id: string
  fingerprint: string
  title: string
  group: string
  severity: string
  status: CaseStatus
  loopStage: LoopStage
  robots: string[]
  subjects: string[]
  detector_codes: string[]
  occurrences: number
  issue_report_id: string | null
  /** Jira ticket made from the IssueReport (code faults only). */
  jira_key?: string | null
  jira_url?: string | null
  version: number
  created_at: string
  updated_at: string
  window_from: string | null
  window_to: string | null
  audit?: AuditEntry[]
}

export interface EvidenceItem {
  id: string
  kind: string
  at: string
  source: string
  summary: string
  robot: string | null
  subject: string | null
  attributes: Record<string, unknown>
  untrusted_text: string | null
}

export interface SeriesPoint { t: string; v: number }
export interface Series { id: string; label: string; unit: string; robot: string | null; points: SeriesPoint[] }

export interface Marker { at: string; role: 'ONSET' | 'CAUSE' | 'EFFECT' | 'CONTEXT'; label: string; evidence_ids: string[]; series_id: string | null }
export interface TimeSeriesSpec { kind: 'TIME_SERIES'; title: string; series_ids: string[]; window_from: string; window_to: string; markers: Marker[]; highlight_from: string | null; highlight_to: string | null }
export interface LaneSegment { start: string; end: string; state: string; evidence_ids: string[] }
export interface StateTimelineSpec { kind: 'STATE_TIMELINE'; title: string; lanes: { name: string; segments: LaneSegment[] }[]; markers: Marker[] }
export interface Transition { source: string; target: string; observed: boolean; expected: boolean; evidence_ids: string[] }
export interface StateDiagramSpec { kind: 'STATE_DIAGRAM'; title: string; entity: string; states: string[]; transitions: Transition[]; current_state: string | null }
export interface CausalGraphSpec { kind: 'CAUSAL_GRAPH'; title: string; edges: { hypothesis_id: string; evidence_id: string; relation: 'SUPPORTS' | 'REFUTES' }[] }
export interface MapMomentSpec { kind: 'MAP_MOMENT'; title: string; at: string; robots: string[]; evidence_ids: string[] }
export type VisualizationSpec = TimeSeriesSpec | StateTimelineSpec | StateDiagramSpec | CausalGraphSpec | MapMomentSpec

export interface Hypothesis {
  id: string; rank: number; title: string; group: string; subsystem: string; mechanism: string
  supports: string[]; refutes: string[]; unknowns: string[]; test_to_confirm: string
}
export interface DetectorHit { code: string; title: string; group: string; subsystem: string; severity: string; start: string; end: string; robots: string[]; evidence_ids: string[]; detail: string }
export interface InvestigationResult {
  run_id: string
  status: string
  detectors: DetectorHit[]
  investigation: {
    is_anomalous: boolean; anomaly: string; onset_at: string; onset_evidence_ids: string[]; onset_description: string
    facts: { claim: string; evidence_ids: string[] }[]; missing_evidence: string[]; ordering_notes: string
  } | null
  diagnosis: { hypotheses: Hypothesis[]; severity: string; owner: string; needs_more_evidence: boolean; reasoning_summary: string } | null
  resolution: {
    owner: string; severity: string; summary: string
    technician: { title: string; robot: string; checklist: { order: number; instruction: string; safety_precondition: string; expected_observation: string }[]; escalate_if: string } | null
    engineering: { title: string; suspected_module: string; expected_behaviour: string; observed_behaviour: string; reproduction: string[]; regression_test: string; evidence_ids: string[] } | null
    verification: { method: string; pass_criteria: string[]; monitoring_window: string }
  } | null
  visualizations: VisualizationSpec[]
  issues: string[]
  cost_usd: number
  tokens: number
  seconds: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  at: string
  text?: string
  actor?: string
  answer?: string
  sentences?: { text: string; evidence_ids: string[] }[]
  insufficient?: boolean
  dropped?: number
}

export interface CaseView {
  case: AiCase
  loopStages: LoopStage[]
  availableActions: CaseAction[]
  result: InvestigationResult | null
  runs: { id: string; status: string; cost_usd: number; created_at: string }[]
  chat: ChatMessage[]
  evidence: { items: EvidenceItem[]; series: Series[]; windowFrom: string; windowTo: string; robots: string[]; missing: string[]; clockQuality: string; manifestSha256: string }
}

export interface IssueProposal { action: 'CREATE_ISSUE_REPORT' | 'EXPORT_TO_JIRA'; payload: Record<string, unknown>; caseVersion: number }

export interface JournalDetection { journalId: string; requestCode: string | null; detectors: { code: string; title: string; detail: string }[]; items: number; missing: string[]; caseId: string | null; status: string }

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

export const aiApi = {
  cases: (status?: string) => apiFetch<{ items: AiCase[] }>(`${BASE}/cases${status ? `?status=${status}` : ''}`),
  case: (id: string) => apiFetch<CaseView>(`${BASE}/cases/${id}`),
  scenarios: () => apiFetch<{ items: { id: string; title: string; category: string }[] }>(`${BASE}/scenarios`),
  open: (scenarioId: string) => apiFetch<{ caseId: string; status: string }>(`${BASE}/cases`, json({ scenario_id: scenarioId, investigate: true })),
  investigate: (id: string) => apiFetch<{ caseId: string; status: string }>(`${BASE}/cases/${id}/investigate`, json({})),
  ask: (id: string, question: string) => apiFetch<ChatMessage>(`${BASE}/cases/${id}/chat`, json({ question })),
  propose: (id: string, action: IssueProposal['action'] = 'CREATE_ISSUE_REPORT') =>
    apiFetch<IssueProposal>(`${BASE}/cases/${id}/actions/propose?action=${action}`, json({})),
  /** Rules on a real journal (the caller's robot scope); opens a case and starts the AI. force: open one even without a finding. */
  fromJournal: (journalId: string, force = true) =>
    apiFetch<JournalDetection>(`${BASE}/cases/from-journal/${journalId}`, json({ investigate: true, force })),
  approve: (id: string, p: IssueProposal) => apiFetch<{ approvalId: string; expiresAt: string }>(`${BASE}/cases/${id}/actions/approve`, json({ action: p.action, payload: p.payload, case_version: p.caseVersion })),
  execute: (id: string, approvalId: string, payload: Record<string, unknown>) => apiFetch<{ caseId: string; status: string; issueReportId: string; jiraKey?: string | null; jiraUrl?: string | null }>(`${BASE}/cases/${id}/actions/${approvalId}/execute`, json({ payload })),
  startResolution: (id: string) => apiFetch<CaseView>(`${BASE}/cases/${id}/resolution`, json({})),
  verify: (id: string, body: { method: string; passed: boolean; notes: string; evidence: string[] }) => apiFetch<CaseView>(`${BASE}/cases/${id}/verify`, json(body)),
  dismiss: (id: string, reason: string) => apiFetch<CaseView>(`${BASE}/cases/${id}/dismiss`, json({ reason })),
  reopen: (id: string, reason: string) => apiFetch<CaseView>(`${BASE}/cases/${id}/reopen`, json({ reason })),
}

/** The AI features show only when the build enables them. */
export const AI_ENABLED = import.meta.env.VITE_AI_ENABLED === 'true'
