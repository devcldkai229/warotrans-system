import { APP_UTC_OFFSET_MINUTES } from '@/shared/lib/format'
import { apiFetch } from './client'
import type { JobStatistics, RequestStatistics, RobotAvailability, RobotStatistics } from './contracts'

/** The window every statistics call reports on; `utcOffsetMinutes` makes the per-day buckets follow Vietnam's days. */
export interface StatisticsWindow {
  from: Date
  to: Date
}

/** `?from=…&to=…&utcOffsetMinutes=420`, shared with the report downloads so a file covers exactly what is on screen. */
export function statisticsQuery({ from, to }: StatisticsWindow) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    utcOffsetMinutes: String(APP_UTC_OFFSET_MINUTES),
  })
  return `?${params.toString()}`
}

export function getJobStatistics(window: StatisticsWindow) {
  return apiFetch<JobStatistics>(`/api/workflow-execution/statistics/jobs${statisticsQuery(window)}`)
}

export function getRobotStatistics(window: StatisticsWindow) {
  return apiFetch<RobotStatistics>(`/api/fleet/statistics/robots${statisticsQuery(window)}`)
}

export function getRequestStatistics(window: StatisticsWindow) {
  return apiFetch<RequestStatistics>(`/api/transportation/statistics/requests${statisticsQuery(window)}`)
}

/** How much of the window each robot was online and able to take work (from its state history). */
export function getRobotAvailability(window: StatisticsWindow) {
  return apiFetch<RobotAvailability>(`/api/fleet/statistics/availability${statisticsQuery(window)}`)
}
