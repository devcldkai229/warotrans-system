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
  if (item.kind === 'TICKET') {
    return t('Ticket {no}: {title}', { no: item.ticketNo ?? '', title: item.ticketTitle ?? '' })
  }
  if (item.kind === 'COMMAND') {
    const command = commandText(item)
    return item.commandOutcome ? t('{command}: {outcome}', { command, outcome: outcomeText(item.commandOutcome) }) : command
  }
  const codes = (item.reason ?? '').split(',').map((code) => code.trim()).filter(Boolean)
  if (codes.length === 0) return t('State recorded')
  return codes.map((code) => reasonText(code, item)).join(' · ')
}

const SYSTEM_ACTION_TEXT: Record<string, string> = {
  RESTART_NAV: t('Restart Nav2'),
  RESTART_LOCALIZATION: t('Restart localization'),
  RESTART_CAMERA: t('Restart camera'),
  RESTART_STACK: t('Restart whole stack'),
  REBOOT: t('Reboot robot'),
  SHUTDOWN: t('Power off'),
}

/** A command in words: where a MOVE went, which stop, which restart. Older lines without details read as before. */
export function commandText(item: RobotHistoryItem): string {
  const target = item.target ?? null
  switch (item.commandType) {
    case 'NAVIGATE_TO_POSE':
      return target ? t('Move to {target}', { target }) : humanize(item.commandType)
    case 'LOCALIZE':
      return target ? t('Localize at {target}', { target }) : t('Localize')
    case 'AUTO_LOCALIZE':
      return t('Auto-localize')
    case 'STOP':
      return target === 'PAUSE' ? t('Stop (pause of a Job)') : t('Stop')
    case 'RESUME':
      return t('Resume')
    case 'CANCEL':
      return t('Cancel the running move')
    case 'SYSTEM_ACTION':
      return target ? (SYSTEM_ACTION_TEXT[target] ?? humanize(target)) : t('System action')
    case 'START_MAPPING':
      return t('Start map building')
    case 'STOP_MAPPING':
      return t('Stop map building')
    default:
      return item.commandType ? humanize(item.commandType) : t('Command')
  }
}

/** The second line of a command or ticket: why it was refused or failed, the operator's reason, how long it took. */
export function describeCommandDetails(item: RobotHistoryItem): string | null {
  const parts: string[] = []
  if (item.kind === 'TICKET') {
    if (item.byName) parts.push(t('by {who}', { who: item.byName }))
    if (item.ticketResult) parts.push(t('result {value}', { value: humanize(item.ticketResult) }))
    return parts.length > 0 ? parts.join(' · ') : null
  }
  if (item.kind !== 'COMMAND') return null
  if (item.jobNo) parts.push(t('Job {job}', { job: item.jobNo }))
  if (item.errorCode) {
    parts.push(
      item.errorCode === 'EMERGENCY_STOP'
        ? t('cleared by an emergency stop')
        : item.commandStatus === 'REJECTED'
          ? t('refused: {code}', { code: item.errorCode })
          : t('error {code}', { code: item.errorCode }),
    )
  }
  if (item.note) parts.push(t('reason: {text}', { text: item.note }))
  if (item.completedAt) {
    const seconds = Math.round((Date.parse(item.completedAt) - Date.parse(item.occurredAt)) / 1000)
    if (Number.isFinite(seconds) && seconds >= 0) parts.push(t('took {seconds} s', { seconds }))
  }
  return parts.length > 0 ? parts.join(' · ') : null
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
  if (item.kind === 'TICKET') {
    const status = item.commandStatus
    if (!status) return null
    return { label: humanize(status), tone: status === 'OPEN' ? 'amber' : status === 'COMPLETED' ? 'green' : 'grey' }
  }
  const status = item.kind === 'COMMAND' ? item.commandStatus : item.toStatus
  if (!status) return null
  const tones = item.kind === 'COMMAND' ? COMMAND_TONE : ROBOT_TONE
  return { label: humanize(status), tone: tones[status] ?? 'grey' }
}

/** A page boundary can repeat a line when something is written between two requests; one line is shown once. */
export function lineKey(item: RobotHistoryItem): string {
  return [item.kind, item.occurredAt, item.commandId ?? item.ticketId ?? '', item.toStatus ?? '', item.reason ?? '', item.source ?? ''].join('|')
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
