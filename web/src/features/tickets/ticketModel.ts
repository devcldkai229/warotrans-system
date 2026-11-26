import type { TechnicalTicket, TicketChecklistItem, TicketResult, TicketStatus, TicketType } from '@/shared/api/tickets'
import { t } from '@/shared/i18n'
import type { Tone } from '@/shared/ui/statusTones'

export const TYPE_LABEL: Record<TicketType, string> = {
  INSPECTION: t('Inspection'),
  DIAGNOSTIC: t('Diagnosis'),
  REPAIR: t('Repair'),
  MAINTENANCE: t('Maintenance'),
  TECHNICAL_REPORT: t('Technical report'),
}

export const TYPE_HINT: Record<TicketType, string> = {
  INSPECTION: t('A routine check of the robot: what was looked at and in what state.'),
  DIAGNOSTIC: t('Find the cause of a fault: symptoms, measurements, conclusion.'),
  REPAIR: t('A part was fixed or replaced: what, why, and the test after.'),
  MAINTENANCE: t('Planned maintenance (a maintenance session opens one by itself).'),
  TECHNICAL_REPORT: t('A report for the team: an incident, a finding, a recommendation.'),
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: t('Open'),
  COMPLETED: t('Completed'),
  CANCELLED: t('Cancelled'),
}

export const STATUS_TONE: Record<TicketStatus, Tone> = { OPEN: 'amber', COMPLETED: 'green', CANCELLED: 'grey' }

export const RESULT_LABEL: Record<TicketResult, string> = {
  PASSED: t('Passed'),
  FIXED: t('Fixed'),
  NEEDS_FOLLOW_UP: t('Needs follow-up'),
  FAILED: t('Failed'),
}

export const RESULT_TONE: Record<TicketResult, Tone> = { PASSED: 'green', FIXED: 'teal', NEEDS_FOLLOW_UP: 'amber', FAILED: 'red' }

/** A starting checklist for each kind of ticket; the technician ticks, edits and adds items. */
export function defaultChecklist(type: TicketType): TicketChecklistItem[] {
  const items: Record<TicketType, string[]> = {
    INSPECTION: [
      t('Lidar clean, data fresh'),
      t('Camera image clear'),
      t('Wheels and motors run smoothly'),
      t('Battery and charger contacts'),
      t('Localization matches the map'),
      t('Stop test passed'),
    ],
    DIAGNOSTIC: [t('Fault reproduced'), t('Logs and evidence checked'), t('Cause found'), t('Fix verified')],
    REPAIR: [t('Faulty part identified'), t('Part repaired or replaced'), t('Test drive passed'), t('Stop test passed')],
    MAINTENANCE: [t('Sensors checked'), t('Localization checked'), t('Stop test passed'), t('Traffic area clear')],
    TECHNICAL_REPORT: [],
  }
  return items[type].map((item) => ({ item, ok: false }))
}

/** One line about the robot when the ticket was opened, from its snapshot. */
export function snapshotSummary(ticket: Pick<TechnicalTicket, 'snapshot'>): string | null {
  const snap = ticket.snapshot
  if (!snap) return null
  const parts: string[] = []
  if (typeof snap.status === 'string') parts.push(snap.status)
  if (snap.isOnline === false) parts.push(t('offline'))
  if (snap.motionHeld === true) parts.push(t('motion held'))
  if (typeof snap.batteryPercent === 'number') parts.push(t('battery {value}%', { value: Math.round(snap.batteryPercent) }))
  if (typeof snap.localizationStatus === 'string') parts.push(t('localization {value}', { value: snap.localizationStatus }))
  if (typeof snap.lastErrorCode === 'string' && snap.lastErrorCode) parts.push(t('error {value}', { value: snap.lastErrorCode }))
  const health = snap.health as { overall?: string } | null | undefined
  if (health && typeof health.overall === 'string') parts.push(t('health {value}', { value: health.overall }))
  return parts.length > 0 ? parts.join(' · ') : null
}
