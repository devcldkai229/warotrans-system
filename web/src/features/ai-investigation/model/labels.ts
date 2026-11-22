import type { Tone } from '@/shared/ui/statusTones'
import type { CaseStatus, LoopStage } from '@/shared/api/ai'
import { t } from '@/shared/i18n'

export const STAGE_LABEL: Record<LoopStage, string> = {
  DETECT: t('Detect'),
  INVESTIGATE: t('Investigate'),
  DIAGNOSE: t('Diagnose'),
  TICKET: t('Ticket'),
  RESOLVE: t('Resolve'),
  VERIFY: t('Verify'),
  CLOSED: t('Closed'),
}

export const STAGE_HINT: Record<LoopStage, string> = {
  DETECT: t('An anomaly was detected by a rule'),
  INVESTIGATE: t('AI is collecting and ordering the evidence'),
  DIAGNOSE: t('Hypotheses ready: review them'),
  TICKET: t('A structured ticket was created'),
  RESOLVE: t('Technician / Developer is fixing it'),
  VERIFY: t('Prove the fix with a test or a lab run'),
  CLOSED: t('Verified and closed'),
}

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  DETECTED: 'amber',
  INVESTIGATING: 'blue',
  NEEDS_MORE_EVIDENCE: 'amber',
  ANALYSIS_INCOMPLETE: 'rose',
  DIAGNOSED: 'purple',
  TICKETED: 'teal',
  IN_RESOLUTION: 'blue',
  VERIFYING: 'teal',
  CLOSED: 'green',
  REOPENED: 'red',
  DISMISSED: 'grey',
}

export const SEVERITY_TONE: Record<string, Tone> = {
  S1_SAFETY: 'red',
  S2_BUSINESS: 'rose',
  S3_FUNCTIONAL: 'amber',
  S4_DEGRADATION: 'grey',
}

export const GROUP_LABEL: Record<string, string> = {
  A_WORKFLOW: t('A · Workflow / business'),
  B_NAVIGATION_TRAFFIC: t('B · Navigation / traffic'),
  C_HARDWARE: t('C · Robot hardware'),
  D_CONNECTIVITY_INFRA: t('D · Connectivity / infrastructure'),
  E_HUMAN_OPERATIONS: t('E · Human operations'),
}

export const OWNER_LABEL: Record<string, string> = {
  TECHNICIAN: t('Technician'),
  DEVELOPER: t('Developer'),
  OPERATIONS_STAFF: t('Operations staff'),
}

export const MARKER_STYLE: Record<string, { label: string; className: string }> = {
  ONSET: { label: t('Onset'), className: 'text-amber' },
  CAUSE: { label: t('Cause'), className: 'text-red' },
  EFFECT: { label: t('Effect'), className: 'text-purple' },
  CONTEXT: { label: t('Context'), className: 'text-muted' },
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
