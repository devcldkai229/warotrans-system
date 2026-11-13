import type { ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { JobStatistics, RequestStatistics, RobotStatistics } from '@/shared/api/contracts'
import { getJobStatistics, getRequestStatistics, getRobotStatistics } from '@/shared/api/statistics'
import { cx } from '@/shared/lib/cx'
import { rangeWindow, readRange, writeRange, type RangeChoice } from '@/shared/lib/dateRange'
import { appToday, formatRelativeTime, humanize } from '@/shared/lib/format'
import { IconButton } from '@/shared/ui/Button'
import { DateRangePicker } from '@/shared/ui/DateRangePicker'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { JOB_STATUS_TONE, REQUEST_STATUS_TONE, ROBOT_STATUS_TONE, TONE_SOLID, type Tone } from '@/shared/ui/statusTones'

import { getLocale, t } from '@/shared/i18n'
import { explainFailureCode, failureTitle } from '@/features/jobs/failureCatalog'
const count = (value: number) => value.toLocaleString(getLocale())

/** `45s`, `12m 05s`, `2h 10m`: a Job takes minutes, a Request can take hours. */
function compactDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`
}

function shortDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
}

/** Change against the window just before this one. `neutral` for numbers where more is not better or worse. */
function Delta({ current, previous, neutral = false }: { current: number; previous: number; neutral?: boolean }) {
  if (previous === 0 && current === 0) return null
  const label = previous === 0 ? 'new' : `${current >= previous ? '+' : ''}${(((current - previous) / previous) * 100).toFixed(1)}%`
  const rising = current >= previous
  const style = neutral
    ? 'bg-container-high text-ink-2'
    : rising
      ? 'bg-green-soft text-green-ink'
      : 'bg-amber-soft text-amber-ink'
  return (
    <span
      className={cx('mb-2 inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium', style)}
      title={t('Compared with the previous period of the same length')}
    >
      {previous === 0 ? null : (
        <Icon name="arrowRight" size={12} className={rising ? '-rotate-45' : 'rotate-45'} />
      )}
      {label}
    </span>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  /** Shown at the right of the title, e.g. a chart legend. */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-14">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 className="text-xl font-book">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** Which colour is which in a chart. */
function Legend({ items }: { items: { label: string; tone: Tone }[] }) {
  return (
    <ul className="flex items-center gap-4 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <ToneDot tone={item.tone} size="sm" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function QueryState({ isLoading, error, children }: { isLoading: boolean; error: unknown; children: ReactNode }) {
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red/30 bg-red-soft/50 px-5 py-4 text-sm text-red-ink">
        {(error as Error).message}
      </div>
    )
  }
  if (isLoading) return <p className="text-sm text-muted">{t('Loading…')}</p>
  return <>{children}</>
}

function Card({ label, value, tone, hint }: { label: string; value: string; tone?: Tone; hint?: string }) {
  return (
    <div className="flex flex-col justify-between gap-6 bg-container p-6">
      <span className="flex items-center gap-2 text-sm text-ink-2">
        {tone ? <ToneDot tone={tone} /> : null}
        {label}
      </span>
      <div>
        <strong className="text-3xl font-book">{value}</strong>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  )
}

/** One column per day: completed (blue) with failed (red) stacked on top. */
function DailyBars({
  days,
  emptyText,
}: {
  days: { date: string; primary: number; secondary?: number; label: string }[]
  emptyText: string
}) {
  const max = Math.max(1, ...days.map((d) => d.primary + (d.secondary ?? 0)))
  const empty = days.every((d) => d.primary + (d.secondary ?? 0) === 0)
  const labelEvery = Math.ceil(days.length / 8)
  // A year is 366 columns: the gaps shrink so the bars keep some width.
  const gap = days.length <= 31 ? 'gap-1.5' : days.length <= 120 ? 'gap-px' : 'gap-0'
  return (
    <div className="relative rounded-lg bg-container p-6">
      {empty ? (
        <p className="absolute inset-x-0 top-[4.5rem] text-center text-sm text-muted">{emptyText}</p>
      ) : null}
      <div className={cx('flex h-40 items-end', gap)}>
        {days.map((day) => {
          const failed = day.secondary ?? 0
          const total = day.primary + failed
          return (
            <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={day.label}>
              <div
                className="mx-auto flex w-full max-w-14 flex-col justify-end"
                style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? 3 : 0 }}
              >
                {failed > 0 ? (
                  <div className={cx('rounded-t-sm', TONE_SOLID.red)} style={{ flexGrow: failed }} />
                ) : null}
                {day.primary > 0 ? (
                  <div
                    className={cx(TONE_SOLID.blue, failed === 0 && 'rounded-t-sm')}
                    style={{ flexGrow: day.primary }}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      {/* Placed by position, not one cell per day: on a long range a day is a few pixels wide. */}
      <div className="relative mt-2 h-4 text-[11px] text-muted">
        {days.map((day, index) =>
          index % labelEvery === 0 ? (
            <span
              key={day.date}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${((index + 0.5) / days.length) * 100}%` }}
            >
              {shortDate(day.date)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}

function StatusBreakdown<T extends string>({
  items,
  tones,
}: {
  items: { status: T; count: number }[]
  tones: Record<T, Tone>
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return (
    <div className="rounded-lg bg-container p-6">
      <div className="flex h-2 overflow-hidden rounded-full bg-container-higher">
        {items
          .filter((item) => item.count > 0)
          .map((item) => (
            <span
              key={item.status}
              className={TONE_SOLID[tones[item.status]]}
              style={{ width: `${(item.count / total) * 100}%` }}
              title={`${humanize(item.status)}: ${item.count}`}
            />
          ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
        {items.map((item) => (
          <li key={item.status} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-2">
              <ToneDot tone={tones[item.status]} size="sm" />
              {humanize(item.status)}
            </span>
            <span className="tabular-nums">{count(item.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function JobsSection({ stats }: { stats: JobStatistics }) {
  const finished = stats.completed + stats.failed
  const active = stats.active.reduce((sum, item) => sum + item.count, 0)
  const attention = stats.active
    .filter((item) => item.status === 'PAUSED' || item.status === 'REASSIGNING' || item.status === 'RECOVERY_REQUIRED')
    .reduce((sum, item) => sum + item.count, 0)
  const maxCompleted = Math.max(1, ...stats.byWorkflow.map((row) => row.completed))
  const secondary: { label: string; value: string; tone?: Tone; hint?: string }[] = [
    { label: t('Failed'), value: count(stats.failed), tone: 'red' },
    {
      label: t('Success rate'),
      value: finished === 0 ? '—' : `${((stats.completed / finished) * 100).toFixed(1)}%`,
      tone: 'green',
      hint: t('Completed of all finished jobs'),
    },
    { label: t('Average duration'), value: compactDuration(stats.avgDurationSeconds), hint: t('Start to finish, completed jobs') },
    { label: t('Average wait to start'), value: compactDuration(stats.avgQueueWaitSeconds), hint: t('Created until a robot started it') },
    { label: t('Active now'), value: count(active), tone: 'blue', hint: t('Queued, assigned or running') },
    { label: t('Needs attention now'), value: count(attention), tone: attention > 0 ? 'amber' : 'grey', hint: t('Paused, reassigning or recovery') },
  ]

  return (
    <>
      <div className="mt-10 grid grid-cols-[1fr_1.15fr] gap-4">
        <section className="flex min-h-72 flex-col justify-between rounded-lg bg-container p-8">
          <h2 className="text-base text-ink-2">{t('Completed jobs')}</h2>
          <div className="flex items-end gap-4">
            <strong className="text-7xl font-normal">{count(stats.completed)}</strong>
            <Delta current={stats.completed} previous={stats.previousCompleted} />
          </div>
        </section>
        <section className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-outline-soft">
          {secondary.map((item) => (
            <Card key={item.label} {...item} />
          ))}
        </section>
      </div>

      <Section
        title={t('Jobs finished per day')}
        aside={
          <Legend
            items={[
              { label: t('Completed'), tone: 'blue' },
              { label: t('Failed'), tone: 'red' },
            ]}
          />
        }
      >
        <DailyBars
          emptyText={t('No jobs finished in this period.')}
          days={stats.daily.map((day) => ({
            date: day.date,
            primary: day.completed,
            secondary: day.failed,
            label: t('{value}: {completed} completed, {failed} failed', { value: shortDate(day.date), completed: day.completed, failed: day.failed }),
          }))}
        />
      </Section>

      <div className="mt-14 grid grid-cols-[1.6fr_1fr] gap-10">
        <section>
          <h2 className="mb-4 text-xl font-book">{t('Jobs by workflow')}</h2>
          <Table>
            <thead>
              <tr>
                <Th>{t('Workflow')}</Th>
                <Th>{t('Completed')}</Th>
                <Th align="right">{t('Failed')}</Th>
                <Th align="right">{t('Avg duration')}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.byWorkflow.length === 0 ? (
                <Tr>
                  <Td colSpan={4} tone="faint">{t('No finished jobs in this period.')}</Td>
                </Tr>
              ) : (
                stats.byWorkflow.map((row) => (
                  <Tr key={row.workflowId}>
                    <Td tone="strong">
                      {row.workflowName}
                      <span className="ml-2 font-mono text-xs text-muted">{row.workflowCode}</span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="w-14 text-ink tabular-nums">{count(row.completed)}</span>
                        <Meter percent={(row.completed / maxCompleted) * 100} tone="blue" className="w-40" />
                      </span>
                    </Td>
                    <Td align="right">{row.failed}</Td>
                    <Td align="right">{compactDuration(row.avgDurationSeconds)}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-book">{t('Top failure reasons')}</h2>
          <Table>
            <thead>
              <tr>
                <Th>{t('Failure code')}</Th>
                <Th align="right">{t('Jobs')}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.topFailureCodes.length === 0 ? (
                <Tr>
                  <Td colSpan={2} tone="faint">{t('No failed jobs in this period.')}</Td>
                </Tr>
              ) : (
                stats.topFailureCodes.map((row) => (
                  <Tr key={row.code}>
                    <Td tone="strong">
                      {failureTitle(row.code)}
                      {explainFailureCode(row.code)?.known ? <span className="ml-2 font-mono text-xs font-normal text-muted">{row.code}</span> : null}
                    </Td>
                    <Td align="right">{row.count}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
          <div className="mt-6">
            <h3 className="mb-3 text-sm text-ink-2">{t('Jobs in progress right now')}</h3>
            <ul className="flex flex-wrap gap-2">
              {stats.active.map((item) => (
                <li key={item.status}>
                  <StatusBadge tone={JOB_STATUS_TONE[item.status]} withDot>
                    {`${humanize(item.status)} · ${item.count}`}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}

function RobotsSection({ stats }: { stats: RobotStatistics }) {
  const outcomes: { label: string; value: number; tone: Tone }[] = [
    { label: t('Completed'), value: stats.assignments.completed, tone: 'green' },
    { label: t('Reassigned'), value: stats.assignments.reassigned, tone: 'amber' },
    { label: t('Ack timeouts'), value: stats.assignments.ackTimeouts, tone: 'red' },
    { label: t('Went offline'), value: stats.assignments.robotOffline, tone: 'red' },
    { label: t('Rejected by robot'), value: stats.assignments.robotRejected, tone: 'amber' },
  ]
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-outline-soft">
        <Card label={t('Robots online')} value={`${stats.online} / ${stats.total}`} tone={stats.online === stats.total ? 'green' : 'amber'} />
        <Card label={t('Enabled')} value={`${stats.enabled} / ${stats.total}`} />
        <Card
          label={t('Average battery')}
          value={stats.averageBatteryPercent === null ? '—' : `${Math.round(stats.averageBatteryPercent)}%`}
          hint={t('Enabled robots')}
        />
        <Card label={t('Low battery')} value={String(stats.lowBattery)} tone={stats.lowBattery > 0 ? 'red' : 'grey'} hint={t('At or below 20%')} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatusBreakdown items={stats.byStatus} tones={ROBOT_STATUS_TONE} />
        <div className="rounded-lg bg-container p-6">
          <h3 className="text-sm text-ink-2">{t('How robot assignments ended in this period')}</h3>
          <ul className="mt-5 grid gap-2.5 text-sm">
            {outcomes.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-2">
                  <ToneDot tone={item.tone} size="sm" />
                  {item.label}
                </span>
                <span className="tabular-nums">{count(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8">
        <Table>
          <thead>
            <tr>
              <Th>{t('Robot')}</Th>
              <Th>{t('Status')}</Th>
              <Th>{t('Battery')}</Th>
              <Th align="right">{t('Jobs completed')}</Th>
              <Th align="right">{t('Interrupted')}</Th>
            </tr>
          </thead>
          <tbody>
            {stats.robots.length === 0 ? (
              <Tr>
                <Td colSpan={5} tone="faint">{t('No robots registered yet.')}</Td>
              </Tr>
            ) : (
              stats.robots.map((robot) => (
                <Tr key={robot.id}>
                  <Td tone="strong">
                    {robot.name}
                    <span className="ml-2 font-mono text-xs text-muted">{robot.code}</span>
                  </Td>
                  <Td>
                    <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
                      {humanize(robot.status)}
                    </StatusBadge>
                    {!robot.isEnabled ? <span className="ml-2 text-xs text-muted">{t('disabled')}</span> : null}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className="w-10 tabular-nums">{Math.round(robot.batteryPercent)}%</span>
                      <Meter
                        percent={robot.batteryPercent}
                        tone={robot.batteryPercent <= 20 ? 'red' : robot.batteryPercent <= 40 ? 'amber' : 'green'}
                        className="w-28"
                      />
                    </span>
                  </Td>
                  <Td align="right">{robot.jobsCompleted}</Td>
                  <Td align="right">{robot.interrupted}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </>
  )
}

function RequestsSection({ stats }: { stats: RequestStatistics }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-outline-soft">
        <div className="flex flex-col justify-between gap-6 bg-container p-6">
          <span className="text-sm text-ink-2">{t('Submitted')}</span>
          <div className="flex items-end gap-3">
            <strong className="text-3xl font-book">{count(stats.submitted)}</strong>
            <Delta current={stats.submitted} previous={stats.previousSubmitted} neutral />
          </div>
        </div>
        <Card label={t('Open now')} value={count(stats.open)} tone="blue" hint={t('Submitted, queued or in progress')} />
        <Card label={t('Average lead time')} value={compactDuration(stats.avgLeadTimeSeconds)} hint={t('Submitted to completed')} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatusBreakdown items={stats.byStatus} tones={REQUEST_STATUS_TONE} />
        <DailyBars
          emptyText={t('No requests submitted in this period.')}
          days={stats.daily.map((day) => ({
            date: day.date,
            primary: day.submitted,
            label: t('{value}: {submitted} submitted, {completed} completed', { value: shortDate(day.date), submitted: day.submitted, completed: day.completed }),
          }))}
        />
      </div>
    </>
  )
}

export function DashboardPage() {
  // The range lives in the address (`?range=last-month`, `?from=…&to=…`), so a report can be shared as a link.
  const [params, setParams] = useSearchParams()
  const today = appToday()
  const { preset, range } = readRange(params, today)
  const choose = (choice: RangeChoice) => setParams((current) => writeRange(current, choice), { replace: true })

  // The window is built when the request is sent, so every refresh of a range that reaches today counts up to "now".
  const key = [range.from, range.to]
  const jobs = useQuery({
    queryKey: ['statistics', 'jobs', ...key],
    queryFn: () => getJobStatistics(rangeWindow(range)),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const robots = useQuery({
    queryKey: ['statistics', 'robots', ...key],
    queryFn: () => getRobotStatistics(rangeWindow(range)),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const requests = useQuery({
    queryKey: ['statistics', 'requests', ...key],
    queryFn: () => getRequestStatistics(rangeWindow(range)),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })

  const refreshing = jobs.isFetching || robots.isFetching || requests.isFetching
  const updatedAt = Math.min(
    ...[jobs, robots, requests].map((query) => query.dataUpdatedAt).filter((time) => time > 0),
  )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <header className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-book">{t('Statistics')}</h1>
            <p className="mt-3 text-base text-ink-2">
              {t('All warehouses')}
              {Number.isFinite(updatedAt) ? t(', updated {value}', { value: formatRelativeTime(new Date(updatedAt).toISOString()) }) : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker preset={preset} range={range} today={today} onChange={choose} />
            <IconButton
              aria-label={t('Refresh')}
              disabled={refreshing}
              onClick={() => void Promise.all([jobs.refetch(), robots.refetch(), requests.refetch()])}
            >
              <Icon name="refresh" size={16} className={refreshing ? 'animate-spin' : undefined} />
            </IconButton>
          </div>
        </header>

        <QueryState isLoading={jobs.isLoading} error={jobs.error}>
          {jobs.data ? <JobsSection stats={jobs.data} /> : null}
        </QueryState>

        <Section title={t('Robot fleet')}>
          <QueryState isLoading={robots.isLoading} error={robots.error}>
            {robots.data ? <RobotsSection stats={robots.data} /> : null}
          </QueryState>
        </Section>

        <Section title={t('Transport requests')}>
          <QueryState isLoading={requests.isLoading} error={requests.error}>
            {requests.data ? <RequestsSection stats={requests.data} /> : null}
          </QueryState>
        </Section>
      </div>
    </div>
  )
}
