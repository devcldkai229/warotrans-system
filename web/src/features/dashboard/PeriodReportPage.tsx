import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import type { PeriodReport } from '@/shared/api/contracts'
import { getPeriodReport } from '@/shared/api/reports'
import { getLocale, t } from '@/shared/i18n'
import { formatDay, formatRange, rangeWindow, readRange } from '@/shared/lib/dateRange'
import { appToday, formatDateTimeFull, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { failureTitle } from '@/features/jobs/failureCatalog'
import { compactDuration, percent } from './format'
import './report.css'

const count = (value: number) => value.toLocaleString(getLocale())

/** What a number is counted on: the same words as the `Basis` column of the CSV, for a reader. */
const BASIS = {
  finished: t('Jobs that finished in the period'),
  created: t('Jobs created in the period'),
  started: t('Jobs that started in the period'),
  previous: t('Jobs that finished in the period just before, of the same length'),
  submitted: t('Requests submitted in the period'),
  submittedPrevious: t('Requests submitted in the period just before, of the same length'),
  completed: t('Requests completed in the period'),
}

/** `13/11/2026` for a `YYYY-MM-DD` day. */
const day = (date: string) => formatDay(date)

function Table({ head, rows, numeric = [], empty }: { head: string[]; rows: ReactNode[][]; numeric?: number[]; empty: string }) {
  return (
    <table className="text-sm">
      <thead>
        <tr>
          {head.map((label, index) => (
            <th key={label} className={numeric.includes(index) ? 'num' : undefined}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="text-muted">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((cells, row) => (
            <tr key={row}>
              {cells.map((cell, index) => (
                <td key={index} className={numeric.includes(index) ? 'num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

/** Metric · value · what it is counted on. */
function Figures({ rows }: { rows: [string, string, string][] }) {
  return (
    <Table
      head={[t('Figure'), t('Value'), t('Counted on')]}
      numeric={[1]}
      rows={rows.map(([label, value, basis]) => [
        label,
        value,
        <span key="basis" className="text-ink-2">
          {basis}
        </span>,
      ])}
      empty=""
    />
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-md font-medium">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="keep-together rounded-md border border-outline-soft px-4 py-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-book tabular-nums">{value}</p>
    </div>
  )
}

function Report({ report, range }: { report: PeriodReport; range: string }) {
  const { jobs, requests, robots, availability } = report
  const finished = jobs.completed + jobs.failed
  const successRate = finished === 0 ? '—' : `${((jobs.completed / finished) * 100).toFixed(1)}%`
  const availabilityOf = new Map(availability.robots.map((row) => [row.id, row.figures]))
  const fleetCoverage = availability.fleet.coveragePercent
  const assignments: [string, number][] = [
    [t('Completed'), robots.assignments.completed],
    [t('Reassigned'), robots.assignments.reassigned],
    [t('Ack timeouts'), robots.assignments.ackTimeouts],
    [t('Went offline'), robots.assignments.robotOffline],
    [t('Rejected by robot'), robots.assignments.robotRejected],
    [t('Cancelled'), robots.assignments.cancelled],
    [t('Failed'), robots.assignments.failed],
  ]

  return (
    <>
      <header className="border-b border-outline-soft pb-5">
        <p className="text-xs font-medium tracking-wide text-ink-2 uppercase">WaroTrans</p>
        <h1 className="mt-1 text-3xl font-book">{t('Period report')}</h1>
        <p className="mt-2 text-base tabular-nums">{range}</p>
        <p className="mt-1 text-xs text-ink-2">
          {t('All warehouses')} · {t('Exported {value}', { value: formatDateTimeFull(report.generatedAt) })}
        </p>
      </header>

      <div className="keep-together mt-6 grid grid-cols-3 gap-3">
        <Highlight label={t('Jobs completed')} value={count(jobs.completed)} />
        <Highlight label={t('Jobs failed')} value={count(jobs.failed)} />
        <Highlight label={t('Success rate')} value={successRate} />
        <Highlight label={t('Requests submitted')} value={count(requests.submitted)} />
        <Highlight label={t('Average lead time')} value={compactDuration(requests.avgLeadTimeSeconds)} />
        <Highlight label={t('Fleet available')} value={percent(availability.fleet.availablePercent)} />
      </div>

      <Part title={t('Jobs')}>
        <Figures
          rows={[
            [t('Created'), count(jobs.created), BASIS.created],
            [t('Completed'), count(jobs.completed), BASIS.finished],
            [t('Failed'), count(jobs.failed), BASIS.finished],
            [t('Completed, previous period'), count(jobs.previousCompleted), BASIS.previous],
            [t('Success rate'), successRate, BASIS.finished],
            [t('Average duration'), compactDuration(jobs.avgDurationSeconds), BASIS.finished],
            [t('Average wait to start'), compactDuration(jobs.avgQueueWaitSeconds), BASIS.started],
          ]}
        />
        <div className="grid grid-cols-2 items-start gap-6">
          <Table
            head={[t('Workflow'), t('Completed'), t('Failed'), t('Avg duration')]}
            numeric={[1, 2, 3]}
            rows={jobs.byWorkflow.map((row) => [
              <>
                {row.workflowName} <span className="font-mono text-xs text-muted">{row.workflowCode}</span>
              </>,
              count(row.completed),
              count(row.failed),
              compactDuration(row.avgDurationSeconds),
            ])}
            empty={t('No finished jobs in this period.')}
          />
          <Table
            head={[t('Failure reason'), t('Jobs')]}
            numeric={[1]}
            rows={jobs.topFailureCodes.map((row) => [failureTitle(row.code), count(row.count)])}
            empty={t('No failed jobs in this period.')}
          />
        </div>
        <Table
          head={[t('Day with finished jobs'), t('Completed'), t('Failed')]}
          numeric={[1, 2]}
          rows={jobs.daily
            .filter((row) => row.completed + row.failed > 0)
            .map((row) => [day(row.date), count(row.completed), count(row.failed)])}
          empty={t('No jobs finished in this period.')}
        />
      </Part>

      <Part title={t('Transport requests')}>
        <Figures
          rows={[
            [t('Submitted'), count(requests.submitted), BASIS.submitted],
            [t('Submitted, previous period'), count(requests.previousSubmitted), BASIS.submittedPrevious],
            [t('Average lead time'), compactDuration(requests.avgLeadTimeSeconds), BASIS.completed],
          ]}
        />
        <div className="grid grid-cols-2 items-start gap-6">
          <Table
            head={[t('Status'), t('Requests')]}
            numeric={[1]}
            rows={requests.byStatus.map((row) => [humanize(row.status), count(row.count)])}
            empty=""
          />
          <Table
            head={[t('Day with requests'), t('Submitted'), t('Completed')]}
            numeric={[1, 2]}
            rows={requests.daily
              .filter((row) => row.submitted + row.completed > 0)
              .map((row) => [day(row.date), count(row.submitted), count(row.completed)])}
            empty={t('No requests submitted in this period.')}
          />
        </div>
      </Part>

      <Part title={t('Robot fleet')}>
        <p className="text-xs text-ink-2">
          {t('Availability is online and neither in maintenance nor in error; busy is reserved for, running or pausing a job.')}{' '}
          {fleetCoverage !== null && fleetCoverage < 99.95
            ? t('Robot history is kept since {value}, so it covers {share} of the period.', {
                value: formatDateTimeFull(availability.historyKeptSince),
                share: percent(fleetCoverage, 0),
              })
            : null}
        </p>
        <Table
          head={[t('Robot'), t('Jobs completed'), t('Interrupted'), t('Online'), t('Available'), t('Busy'), t('Covered')]}
          numeric={[1, 2, 3, 4, 5, 6]}
          rows={robots.robots.map((robot) => {
            const figures = availabilityOf.get(robot.id)
            return [
              <>
                {robot.name} <span className="font-mono text-xs text-muted">{robot.code}</span>
                {!robot.isEnabled ? <span className="ml-1 text-xs text-muted">({t('disabled')})</span> : null}
              </>,
              count(robot.jobsCompleted),
              count(robot.interrupted),
              percent(figures?.onlinePercent ?? null),
              percent(figures?.availablePercent ?? null),
              percent(figures?.busyPercent ?? null),
              percent(figures?.coveragePercent ?? null, 0),
            ]
          })}
          empty={t('No robots registered yet.')}
        />
        <div className="grid grid-cols-2 items-start gap-6">
          <Table
            head={[t('How robot assignments ended in this period'), t('Assignments')]}
            numeric={[1]}
            rows={assignments.map(([label, value]) => [label, count(value)])}
            empty=""
          />
          <Table
            head={[t('Status'), t('Share of the fleet’s time')]}
            numeric={[1]}
            rows={availability.fleet.byStatus.map((row) => [humanize(row.status), percent(row.percent)])}
            empty=""
          />
        </div>
      </Part>

      <Part title={t('Status at export time')}>
        <p className="text-xs text-ink-2">
          {t('These are how things stood when the report was exported ({value}), not figures of the period.', {
            value: formatDateTimeFull(report.generatedAt),
          })}
        </p>
        <div className="grid grid-cols-2 items-start gap-6">
          <Table
            head={[t('Jobs in progress'), t('Jobs')]}
            numeric={[1]}
            rows={jobs.active.map((row) => [humanize(row.status), count(row.count)])}
            empty=""
          />
          <Table
            head={[t('Figure'), t('Value')]}
            numeric={[1]}
            rows={[
              [t('Requests still open'), count(requests.open)],
              [t('Robots online'), `${robots.online} / ${robots.total}`],
              [t('Robots enabled'), `${robots.enabled} / ${robots.total}`],
              [t('Low battery'), count(robots.lowBattery)],
              [t('Average battery'), robots.averageBatteryPercent === null ? '—' : `${Math.round(robots.averageBatteryPercent)}%`],
            ]}
            empty=""
          />
        </div>
      </Part>

      <footer className="mt-10 border-t border-outline-soft pt-3 text-xs text-muted">
        {t('The period includes its first day and its last day, in Vietnam time. The numbers match the Statistics page for the same days.')}{' '}
        {t('Days without activity are left out here; the summary CSV has every day.')}
      </footer>
    </>
  )
}

/**
 * FE-20 print view: the period chosen on the statistics page as a plain A4 document, light whatever the console's
 * theme, without the app shell. Opened with `print=1` it opens the print dialog, where "Save as PDF" makes the PDF.
 */
export function PeriodReportPage() {
  const [params] = useSearchParams()
  const today = appToday()
  const { range } = readRange(params, today)
  const autoPrint = params.get('print') === '1'
  const printed = useRef(false)

  const report = useQuery({
    queryKey: ['report', 'period', range.from, range.to],
    queryFn: () => getPeriodReport(rangeWindow(range)),
    refetchOnWindowFocus: false,
  })

  // Paper is white: the light tokens for as long as this page is open, without changing the saved choice.
  useLayoutEffect(() => {
    const root = document.documentElement
    const before = root.dataset.theme
    root.dataset.theme = 'light'
    return () => {
      if (before) root.dataset.theme = before
    }
  }, [])

  const rangeText = formatRange(range)
  useEffect(() => {
    const before = document.title
    // The browser offers the title as the PDF's file name.
    document.title = `WaroTrans – ${t('Period report')} ${rangeText}`
    return () => {
      document.title = before
    }
  }, [rangeText])

  useEffect(() => {
    if (!autoPrint || !report.data || printed.current) return
    printed.current = true
    // After the tables have been laid out.
    const timer = window.setTimeout(() => window.print(), 300)
    return () => window.clearTimeout(timer)
  }, [autoPrint, report.data])

  const dashboard = new URLSearchParams(params)
  dashboard.delete('print')
  const query = dashboard.toString()
  const back = query ? `/dashboard?${query}` : '/dashboard'

  return (
    <div className="period-report min-h-screen bg-container">
      <div className="report-toolbar sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-outline-soft bg-surface px-6 py-3">
        <Link to={back} className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
          <Icon name="arrowLeft" size={16} />
          {t('Back to statistics')}
        </Link>
        <Button variant="primary" disabled={!report.data} onClick={() => window.print()}>
          <Icon name="download" size={16} />
          {t('Print or save as PDF')}
        </Button>
      </div>

      <main className="report-sheet mx-auto my-6 max-w-[210mm] bg-surface px-[14mm] py-[12mm] text-ink shadow-float">
        {report.error ? (
          <p role="alert" className="text-sm text-red-ink">
            {(report.error as Error).message}
          </p>
        ) : report.data ? (
          <Report report={report.data} range={rangeText} />
        ) : (
          <p className="text-sm text-muted">{t('Loading…')}</p>
        )}
      </main>
    </div>
  )
}
