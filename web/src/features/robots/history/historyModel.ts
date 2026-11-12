import type { RobotStateEventSource } from '@/shared/api/contracts'
import type { RobotHistoryItem, RobotHistoryKind, RobotHistoryQuery } from '@/shared/api/fleet'
import { t } from '@/shared/i18n'
import { endOfAppDay, formatBattery, humanize, startOfAppDay } from '@/shared/lib/format'
import type { Tone } from '@/shared/ui/statusTones'

/** The sources the backend writes. A command has none, only a state change records where it came from. */
export const HISTORY_SOURCES: readonly RobotStateEventSource[] = ['SYSTEM', 'HEARTBEAT', 'DISPATCHER', 'OPERATOR', 'ROBOT']

export interface HistoryFilters {
  kind: RobotHistoryKind | ''
  source: RobotStateEventSource | ''
  /** `YYYY-MM-DD` as a date input gives it: a day in Vietnam. */
  fromDate: string
  toDate: string
}

export const NO_FILTERS: HistoryFilters = { kind: '', source: '', fromDate: '', toDate: '' }

export function filtersAreActive(filters: HistoryFilters): boolean {
  return filters.kind !== '' || filters.source !== '' || filters.fromDate !== '' || filters.toDate !== ''
}

/** Commands carry no source, so while only commands are asked for the source box does not apply. */
export function sourceApplies(filters: HistoryFilters): boolean {
  return filters.kind !== 'COMMAND'
}

/** Midnight at the start of the day in Vietnam, as an ISO instant. Null for an empty or unreadable date. */
export function startOfDay(date: string): string | null {
  return startOfAppDay(date)?.toISOString() ?? null
}

/** The last millisecond of the day in Vietnam, so a "to" date includes that whole day. */
export function endOfDay(date: string): string | null {
  return endOfAppDay(date)?.toISOString() ?? null
}

/** A range that ends before it starts matches nothing; the screen says so instead of asking. */
export function rangeIsBackwards(filters: HistoryFilters): boolean {
  const from = startOfDay(filters.fromDate)
  const to = endOfDay(filters.toDate)
  return from !== null && to !== null && from > to
}

/** The request for one page of what the filters ask for. */
export function historyQuery(filters: HistoryFilters, skip: number, take: number): RobotHistoryQuery {
  const query: RobotHistoryQuery = { skip, take }
  if (filters.kind) query.kind = filters.kind
  if (filters.source && sourceApplies(filters)) query.source = filters.source
  const from = startOfDay(filters.fromDate)
  const to = endOfDay(filters.toDate)
  if (from) query.from = from
  if (to) query.to = to
  return query
}

export function sourceLabel(source: RobotStateEventSource | null | undefined): string {
  switch (source) {
    case 'SYSTEM':
      return t('System')
    case 'HEARTBEAT':
      return t('Heartbeat')
    case 'DISPATCHER':
      return t('Dispatcher')
    case 'OPERATOR':
      return t('Operator')
    case 'ROBOT':
      return t('Robot')
    default:
      return ''
  }
}

/** One reason code the backend writes, in words. A code this screen does not know is shown as written, readable. */
function reasonText(code: string, item: RobotHistoryItem): string {
  switch (code) {
    case 'status':
      return item.fromStatus ? t('Status changed from {from}', { from: humanize(item.fromStatus) }) : t('First status recorded')
    case 'online':
      return t('Came online')
    case 'offline':
      return t('Went offline')
    case 'motion_held':
      return t('Motion held')
    case 'motion_released':
      return t('Motion released')
    default:
      return code.replaceAll('_', ' ')
  }
}

/**
 * What happened, as one line. A change of state carries one or several reason codes (`status,offline`); the new status
 * is shown beside the line (see `historyStatus`), so the words only say what changed and from what.
 */
export function describeHistoryItem(item: RobotHistoryItem): string {
  if (item.kind === 'COMMAND') {
    const command = item.commandType ? humanize(item.commandType) : t('Command')
    return item.commandOutcome ? t('{command}: {outcome}', { command, outcome: outcomeText(item.commandOutcome) }) : command
  }
  const codes = (item.reason ?? '').split(',').map((code) => code.trim()).filter(Boolean)
  if (codes.length === 0) return t('State recorded')
  return codes.map((code) => reasonText(code, item)).join(' · ')
}

/**
 * What was true of the robot when a state was recorded, in words, or null when nothing was kept (older lines, commands).
 * A battery the robot never measured is said to be unknown: it is not 0 %.
 */
export function describeDetails(item: RobotHistoryItem): string | null {
  const details = item.details
  if (!details || typeof details !== 'object') return null
  const parts: string[] = []
  if ('batteryPercent' in details) {
    const percent = details.batteryPercent
    parts.push(typeof percent === 'number' ? t('Battery {value}', { value: formatBattery(percent) }) : t('Battery unknown'))
  }
  const error = typeof details.errorCode === 'string' ? details.errorCode.trim() : ''
  if (error) parts.push(t('Error {code}', { code: error }))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** An outcome is a word the robot or the backend wrote (`SUCCEEDED`, `robot_offline`). */
function outcomeText(outcome: string): string {
  return outcome === outcome.toUpperCase() ? humanize(outcome) : outcome.replaceAll('_', ' ')
}

export interface HistoryBadge {
  label: string
  tone: Tone
}

const COMMAND_TONE: Record<string, Tone> = {
  COMPLETED: 'green',
  RUNNING: 'blue',
  ACKED: 'blue',
  SENT: 'grey',
  CANCELED: 'amber',
  ABORTED: 'amber',
  REJECTED: 'red',
  FAILED: 'red',
  TIMEOUT: 'red',
}

const ROBOT_TONE: Record<string, Tone> = {
  OFFLINE: 'grey',
  AVAILABLE: 'green',
  RESERVED: 'purple',
  EXECUTING: 'blue',
  PAUSED: 'amber',
  CHARGING: 'teal',
  MAINTENANCE: 'rose',
  ERROR: 'red',
}

/** The badge beside a line: the status the robot is in after a change, or how a command stands. */
export function historyStatus(item: RobotHistoryItem): HistoryBadge | null {
  const status = item.kind === 'COMMAND' ? item.commandStatus : item.toStatus
  if (!status) return null
  const tones = item.kind === 'COMMAND' ? COMMAND_TONE : ROBOT_TONE
  return { label: humanize(status), tone: tones[status] ?? 'grey' }
}

/** A page boundary can repeat a line when something is written between two requests; one line is shown once. */
export function lineKey(item: RobotHistoryItem): string {
  return [item.kind, item.occurredAt, item.commandId ?? '', item.toStatus ?? '', item.reason ?? '', item.source ?? ''].join('|')
}

export function uniqueLines(items: readonly RobotHistoryItem[]): RobotHistoryItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = lineKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
