import type { EvidenceEvent } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { humanize } from '@/shared/lib/format'

type Bag = Record<string, unknown>

/** The core's own event: the Recorder returns the whole envelope, the source event sits under `payload`. */
function inner(e: EvidenceEvent): { top: Bag; core: Bag } {
  const top = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Bag
  const core = (top.payload && typeof top.payload === 'object' ? top.payload : top) as Bag
  return { top, core }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

const STEP_STATUS: Record<string, string> = {
  EXECUTING: 'started',
  WAITING: 'waiting for staff',
  COMPLETED: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
}

const CONTAINER_STATUS: Record<string, string> = {
  ASSIGNED: 'assigned to the robot',
  ONBOARD: 'on the robot',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
}

const COMMAND_PHASE: Record<string, string> = {
  ISSUED: 'sent to the robot',
  ACK_ACCEPTED: 'accepted by the robot',
  ACK_REJECTED: 'refused by the robot',
  ACK_TIMEOUT: 'not answered by the robot',
  OFFLINE_ABORT: 'aborted: robot offline',
}

const COMMAND_NAME: Record<string, string> = {
  NAVIGATE_TO_POSE: 'Drive command',
  CANCEL: 'Cancel command',
  STOP: 'Stop command',
  RESUME: 'Resume command',
  LOCALIZE: 'Localize command',
}

/**
 * One line for the event feed under the video, in the viewer's language: what happened, without ids. Events the feed
 * has no wording for keep the Recorder's own message.
 */
export function describeEvent(e: EvidenceEvent): string {
  const { top, core } = inner(e)
  switch (e.eventType) {
    case 'job.step-status-changed': {
      const name = str(core.stepName) ?? str(core.stepKey) ?? t('Step')
      const position = typeof core.stepPosition === 'number' && typeof core.stepCount === 'number' ? `${core.stepPosition}/${core.stepCount} ` : ''
      const target = str(core.targetEndpointName) ?? str(core.targetEndpointCode)
      const status = str(core.status) ?? str(top.sourceStatusCode) ?? ''
      return `${t('Step')} ${position}· ${name}${target ? ` → ${target}` : ''} — ${t(STEP_STATUS[status] ?? humanize(status))}`
    }
    case 'robot.command-lifecycle': {
      const type = str(core.type) ?? ''
      const phase = str(core.phase) ?? str(top.sourceStatusCode) ?? ''
      const outcome = str(core.outcome)
      const what = t(COMMAND_NAME[type] ?? humanize(type))
      if (phase === 'RESULT') {
        const error = str(core.errorCode)
        return outcome === 'SUCCEEDED'
          ? `${what}: ${t('target reached')}`
          : `${what}: ${t(outcome === 'CANCELED' ? 'cancelled' : 'failed')}${error ? ` (${error})` : ''}`
      }
      return `${what} ${t(COMMAND_PHASE[phase] ?? humanize(phase))}`
    }
    case 'job.container-status-changed': {
      const status = str(core.status) ?? str(top.sourceStatusCode) ?? ''
      return `${t('Container')} ${t(CONTAINER_STATUS[status] ?? humanize(status))}`
    }
    case 'nav2.goal.succeeded':
      return t('Navigation finished on the robot')
    case 'recording.gap':
      return t('Short gap in the video ({reason})', { reason: str(core.reason) ?? '' })
    default:
      return e.message ?? humanize(e.eventType)
  }
}
