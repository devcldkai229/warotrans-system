import { getLocale } from '@/shared/i18n'
import { apiDownload, apiFetch } from './client'
import type { PeriodReport } from './contracts'
import { statisticsQuery, type StatisticsWindow } from './statistics'

/** The files the statistics page can download for its period (FE-20). */
export type ReportExport = 'summary' | 'jobs' | 'requests' | 'robots' | 'all'

const EXPORT_PATH: Record<ReportExport, string> = {
  summary: '/api/reports/summary.csv',
  jobs: '/api/reports/jobs.csv',
  requests: '/api/reports/requests.csv',
  robots: '/api/reports/robots.csv',
  all: '/api/reports/report.zip',
}

/** The statistics of one window in one response, for the print view. */
export function getPeriodReport(window: StatisticsWindow) {
  return apiFetch<PeriodReport>(`/api/reports/period${statisticsQuery(window)}`)
}

/** Labels in the file follow the console's language; the codes in it are always English. */
export function downloadReport(kind: ReportExport, window: StatisticsWindow) {
  const lang = getLocale().startsWith('vi') ? 'vi' : 'en'
  const fallback = kind === 'all' ? 'warotrans-report.zip' : `warotrans-${kind}.csv`
  return apiDownload(`${EXPORT_PATH[kind]}${statisticsQuery(window)}&lang=${lang}`, fallback)
}
