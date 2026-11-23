import type { IssueSeverity, IssueStatus, IssueType } from '@/shared/api/operations'
import { CONTAINER_PROBLEMS } from './containerProblems'
import { RANGE_PRESETS, presetRange, rangeProblem, type DayRange, type RangeChoice, type RangePreset } from '@/shared/lib/dateRange'

export const ISSUE_TYPES: IssueType[] = ['CONTAINER', 'ROBOT', 'JOB', 'TRANSPORT', 'STORAGE', 'OTHER']
export const ISSUE_SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

/** The reported days, or null for any time. */
export type IssueReportedRange = { preset: RangePreset | null; range: DayRange } | null

export interface IssueFilters {
  type: IssueType | ''
  severity: IssueSeverity | ''
  status: IssueStatus | ''
  /** A container problem code. */
  problem: string
  reported: IssueReportedRange
}

/** The address keys the filters own: changing any of them starts again from page 1. */
export const FILTER_KEYS = ['type', 'severity', 'status', 'problem', 'range', 'from', 'to'] as const

function oneOf<T extends string>(values: readonly T[], value: string | null): T | '' {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : ''
}

/**
 * The filters in the address: `?type=JOB&severity=HIGH&status=OPEN&range=7d` or `…&from=2026-11-01&to=2026-11-20`.
 * Anything missing or not valid means "all", so an old or edited link still opens (and never hides issues by a
 * range it cannot read).
 */
export function readIssueFilters(params: URLSearchParams, today: string): IssueFilters {
  const named = params.get('range')
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  let reported: IssueReportedRange = null
  if (named && (RANGE_PRESETS as string[]).includes(named)) {
    reported = { preset: named as RangePreset, range: presetRange(named as RangePreset, today) }
  } else if (from && to && rangeProblem({ from, to }, today) === null) {
    reported = { preset: null, range: { from, to } }
  }

  return {
    type: oneOf(ISSUE_TYPES, params.get('type')),
    severity: oneOf(ISSUE_SEVERITIES, params.get('severity')),
    status: oneOf(ISSUE_STATUSES, params.get('status')),
    problem: oneOf(CONTAINER_PROBLEMS.map((p) => p.code), params.get('problem')),
    reported,
  }
}

/** The address with a new reported range (null: any time). Every preset is written, since "no range" means any time. */
export function writeReportedRange(params: URLSearchParams, choice: RangeChoice | null): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('range')
  next.delete('from')
  next.delete('to')
  next.delete('page')
  if (choice && 'preset' in choice) next.set('range', choice.preset)
  else if (choice) {
    next.set('from', choice.range.from)
    next.set('to', choice.range.to)
  }
  return next
}

/** The address with every filter cleared; anything else in it (the page aside) is kept. */
export function clearIssueFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of FILTER_KEYS) next.delete(key)
  next.delete('page')
  return next
}

/** Whether a filter other than the type tab is set (the tab has its own "All"). */
export function hasIssueFilters(filters: IssueFilters): boolean {
  return filters.severity !== '' || filters.status !== '' || filters.problem !== '' || filters.reported !== null
}
