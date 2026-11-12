import { APP_UTC_OFFSET_MINUTES } from '@/shared/lib/format'
import { apiFetch } from './client'
import type { JobStatistics, RequestStatistics, RobotStatistics } from './contracts'

/** The window every statistics call reports on; `utcOffsetMinutes` makes the per-day buckets follow Vietnam's days. */
export interface StatisticsWindow {
  from: Date
  to: Date
}

function query({ from, to }: StatisticsWindow) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    utcOffsetMinutes: String(APP_UTC_OFFSET_MINUTES),
  })
  return `?${params.toString()}`
}

export function getJobStatistics(window: StatisticsWindow) {
  return apiFetch<JobStatistics>(`/api/workflow-execution/statistics/jobs${query(window)}`)
}

export function getRobotStatistics(window: StatisticsWindow) {
  return apiFetch<RobotStatistics>(`/api/fleet/statistics/robots${query(window)}`)
}

export function getRequestStatistics(window: StatisticsWindow) {
  return apiFetch<RequestStatistics>(`/api/transportation/statistics/requests${query(window)}`)
}
