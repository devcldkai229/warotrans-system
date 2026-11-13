import { startOfAppDay } from './format'

/** A span of whole days in Vietnam, both ends included, as `YYYY-MM-DD`. */
export interface DayRange {
  from: string
  to: string
}

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'this-month' | 'last-month' | '90d'
export const RANGE_PRESETS: RangePreset[] = ['today', 'yesterday', '7d', '30d', 'this-month', 'last-month', '90d']

/** What the statistics endpoints accept (StatisticsRange.MaxDays on the server). */
export const MAX_RANGE_DAYS = 366

/** A range as it is chosen: one of the presets (which moves with the days), or two fixed dates. */
export type RangeChoice = { preset: RangePreset } | { range: DayRange }

const DATE = /^\d{4}-\d{2}-\d{2}$/

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function iso(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parts(date)
  return iso(year, month, day + days)
}

/** How many days the range covers, both ends included. */
export function dayCount({ from, to }: DayRange): number {
  const a = parts(from)
  const b = parts(to)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000) + 1
}

export function presetRange(preset: RangePreset, today: string): DayRange {
  const { year, month } = parts(today)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const day = addDays(today, -1)
      return { from: day, to: day }
    }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case '90d':
      return { from: addDays(today, -89), to: today }
    case 'this-month':
      return { from: iso(year, month, 1), to: today }
    case 'last-month':
      // Day 0 of this month is the last day of the one before.
      return { from: iso(year, month - 1, 1), to: iso(year, month, 0) }
  }
}

export type RangeProblem = 'incomplete' | 'backwards' | 'future' | 'too-long'

/** Why a hand-picked range cannot be shown, or null when it can. */
export function rangeProblem(range: DayRange, today: string): RangeProblem | null {
  if (!DATE.test(range.from) || !DATE.test(range.to)) return 'incomplete'
  if (range.to < range.from) return 'backwards'
  if (range.to > today) return 'future'
  if (dayCount(range) > MAX_RANGE_DAYS) return 'too-long'
  return null
}

/**
 * The instants the statistics endpoints take, `[from, to)`: from midnight (Vietnam) of the first day to midnight after
 * the last one, or to `now` when the range reaches today, so a refresh always counts up to the present.
 */
export function rangeWindow(range: DayRange, now: Date = new Date()): { from: Date; to: Date } {
  const from = startOfAppDay(range.from) ?? now
  const end = startOfAppDay(addDays(range.to, 1)) ?? now
  return { from, to: end.getTime() > now.getTime() ? now : end }
}

/**
 * The range in the address: `?range=30d` for a preset, `?from=2026-10-01&to=2026-10-31` for fixed dates. Anything
 * missing or not valid falls back to `fallback`, so an old or edited link still opens.
 */
export function readRange(
  params: URLSearchParams,
  today: string,
  fallback: RangePreset = '7d',
): { preset: RangePreset | null; range: DayRange } {
  const named = params.get('range')
  if (named && (RANGE_PRESETS as string[]).includes(named)) {
    return { preset: named as RangePreset, range: presetRange(named as RangePreset, today) }
  }
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if ((from || to) && rangeProblem({ from, to }, today) === null) return { preset: null, range: { from, to } }
  return { preset: fallback, range: presetRange(fallback, today) }
}

/** The address after a new choice. The fallback preset leaves no trace, so the plain page link stays clean. */
export function writeRange(params: URLSearchParams, choice: RangeChoice, fallback: RangePreset = '7d'): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('range')
  next.delete('from')
  next.delete('to')
  if ('preset' in choice) {
    if (choice.preset !== fallback) next.set('range', choice.preset)
  } else {
    next.set('from', choice.range.from)
    next.set('to', choice.range.to)
  }
  return next
}

/** `14/10/2026` */
export function formatDay(date: string): string {
  const { year, month, day } = parts(date)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/** `12/11/2026`, `14/10 – 12/11/2026`, or `20/12/2025 – 05/01/2026` across a new year. */
export function formatRange(range: DayRange): string {
  if (range.from === range.to) return formatDay(range.from)
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
  return `${sameYear ? formatDay(range.from).slice(0, 5) : formatDay(range.from)} – ${formatDay(range.to)}`
}
