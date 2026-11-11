import { t } from '@/shared/i18n'
// Display formatting for API values. The API sends ISO-8601 timestamps and plain numbers; the UI formats them here.

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * The warehouses are in Vietnam (UTC+7, no daylight saving), so every time on screen is shown there, whatever the zone of
 * the browser. A fixed offset keeps it exact and the same everywhere, including in tests.
 */
export const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh'
export const APP_UTC_OFFSET_MINUTES = 7 * 60
const APP_OFFSET_MS = APP_UTC_OFFSET_MINUTES * 60_000

/**
 * A timestamp from the API as a Date. The server may send more than three fractional digits (`.1558969`), which not every
 * browser reads, and a time without a zone is the server's, which is UTC.
 */
export function parseInstant(iso: string): Date {
  let text = iso.trim().replace(/(\.\d{3})\d+/, '$1')
  if (/T\d{2}:\d{2}/.test(text) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z'
  return new Date(text)
}

/** The calendar fields of an instant as seen in Vietnam. */
function appParts(iso: string) {
  const local = new Date(parseInstant(iso).getTime() + APP_OFFSET_MS)
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    valid: !Number.isNaN(local.getTime()),
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = appParts(iso)
  return p.valid ? `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}` : '—'
}

export function formatDateTimeWithYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = appParts(iso)
  return p.valid ? `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}` : '—'
}

/** `11/11/2026 14:39:05`: the date, and the time down to the second, for values where the second matters. */
export function formatDateTimeFull(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = appParts(iso)
  return p.valid ? `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : '—'
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = appParts(iso)
  return p.valid ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : '—'
}

/** A value that is a date and time written by the server (`2026-11-11T07:39:05.1558969+00:00`), not a date alone. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i

/** The value read as people read it when it is a timestamp, otherwise null (an id, a word, a number, a date alone). */
export function formatIfDateTime(value: string): string | null {
  if (!ISO_DATE_TIME.test(value.trim())) return null
  const text = formatDateTimeFull(value)
  return text === '—' ? null : text
}

/** A value of a step, an audit entry or any other record as text; a timestamp in it is shown as the date and time in Vietnam. */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') return formatIfDateTime(value) ?? value
  if (typeof value === 'object' && value !== null) return jsonText(value)
  return String(value)
}

/** JSON as written, with every timestamp inside it read as people read it. */
export function jsonText(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => (typeof inner === 'string' ? (formatIfDateTime(inner) ?? inner) : inner)) ?? 'undefined'
}

/** Midnight at the start of a `YYYY-MM-DD` day in Vietnam, or null when it is not a date. */
export function startOfAppDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00+07:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The last millisecond of a `YYYY-MM-DD` day in Vietnam, or null when it is not a date. */
export function endOfAppDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T23:59:59.999+07:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Today's date in Vietnam as `YYYY-MM-DD`. */
export function appToday(now: Date = new Date()): string {
  const p = appParts(now.toISOString())
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** The last `days` days in Vietnam: from midnight (Vietnam) of the first one to `now`. `1` is today. */
export function windowOfDays(days: number, now: Date = new Date()): { from: Date; to: Date } {
  const [year, month, day] = appToday(now).split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, day - (days - 1))).toISOString().slice(0, 10)
  return { from: startOfAppDay(first) ?? now, to: now }
}

/** `04m 12s`; hours are folded into minutes because Jobs run for minutes, not days. */
/** `09m 05s` under an hour, then `2h 05m`, then `3d 4h`, so a long run never reads as thousands of minutes. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 3600) return `${pad(Math.floor(seconds / 60))}m ${pad(seconds % 60)}s`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m`
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`
}

export function secondsBetween(fromIso: string | null | undefined, toIso?: string | null): number | null {
  if (!fromIso) return null
  const end = toIso ? parseInstant(toIso).getTime() : Date.now()
  return Math.max(0, (end - parseInstant(fromIso).getTime()) / 1000)
}

export function formatCoordinate(value: number): string {
  return `${value.toFixed(2)} m`
}

/** `2026-09-20 09:12` (ISO-like, used by data tables). */
export function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = appParts(iso)
  return p.valid ? `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}` : '—'
}

/** `just now`, `3 min ago`, `2 h ago`; older values fall back to the date. */
export function formatRelativeTime(iso: string | null | undefined): string {
  const seconds = secondsBetween(iso)
  if (seconds === null) return '—'
  if (seconds < 45) return t('just now')
  if (seconds < 3600) return t('{minutes} min ago', { minutes: Math.round(seconds / 60) })
  if (seconds < 86_400) return t('{hours} h ago', { hours: Math.round(seconds / 3600) })
  return formatDateTime(iso)
}

/** `IN_PROGRESS` → `In progress`. Backend enum values keep their meaning, only the casing changes. */
export function humanize(value: string): string {
  if (value !== value.toUpperCase()) return t(value)
  const text = value.replaceAll('_', ' ').toLowerCase()
  return t(text.charAt(0).toUpperCase() + text.slice(1))
}

/** HW-04: a battery the robot never reported is "Unknown", never 0 %. */
export function formatBattery(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? t('Unknown') : `${Math.round(percent)}%`
}
