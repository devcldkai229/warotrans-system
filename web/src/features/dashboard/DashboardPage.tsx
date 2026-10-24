import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { JobStatistics, RequestStatistics, RobotStatistics } from '@/shared/api/contracts'
import { getJobStatistics, getRequestStatistics, getRobotStatistics } from '@/shared/api/statistics'
import { cx } from '@/shared/lib/cx'
import { formatRelativeTime, humanize } from '@/shared/lib/format'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { JOB_STATUS_TONE, REQUEST_STATUS_TONE, ROBOT_STATUS_TONE, TONE_SOLID, type Tone } from '@/shared/ui/statusTones'

type RangeId = 'today' | '7d' | '30d'

const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
]

/** From local midnight of the first day to now, so the per-day buckets line up with the viewer's calendar days. */
function windowFor(days: number) {
  const to = new Date()
  const from = new Date(to)
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - (days - 1))
  return { from, to }
}

const count = (value: number) => value.toLocaleString('en-US')

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
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
      title="Compared with the previous period of the same length"
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
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="mt-14">
      <header className="mb-4">
        <h2 className="text-xl font-book">{title}</h2>
        {note ? <p className="mt-1 text-sm text-ink-2">{note}</p> : null}
      </header>
      {children}
    </section>
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
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>
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
  return (
    <div className="relative rounded-lg bg-container p-6">
      {empty ? (
        <p className="absolute inset-x-0 top-[4.5rem] text-center text-sm text-muted">{emptyText}</p>
      ) : null}
      <div className="flex h-40 items-end gap-1.5">
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
      <div className="mt-2 flex gap-1.5 text-[11px] text-muted">
        {days.map((day, index) => (
          <span key={day.date} className="min-w-0 flex-1 truncate text-center">
            {index % labelEvery === 0 ? shortDate(day.date) : ''}
          </span>
        ))}
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
    { label: 'Failed', value: count(stats.failed), tone: 'red' },
    {
      label: 'Success rate',
      value: finished === 0 ? '—' : `${((stats.completed / finished) * 100).toFixed(1)}%`,
      tone: 'green',
      hint: 'Completed of all finished jobs',
    },
    { label: 'Average duration', value: compactDuration(stats.avgDurationSeconds), hint: 'Start to finish, completed jobs' },
    { label: 'Average wait to start', value: compactDuration(stats.avgQueueWaitSeconds), hint: 'Created until a robot started it' },
    { label: 'Active now', value: count(active), tone: 'blue', hint: 'Queued, assigned or running' },
    { label: 'Needs attention now', value: count(attention), tone: attention > 0 ? 'amber' : 'grey', hint: 'Paused, reassigning or recovery' },
  ]

  return (
    <>
      <div className="mt-10 grid grid-cols-[1fr_1.15fr] gap-4">
        <section className="flex min-h-72 flex-col justify-between rounded-lg bg-container p-8">
          <h2 className="text-base text-ink-2">Completed jobs</h2>
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

      <Section title="Jobs finished per day" note="Completed jobs, with failed jobs stacked in red.">
        <DailyBars
          emptyText="No jobs finished in this period."
          days={stats.daily.map((day) => ({
            date: day.date,
            primary: day.completed,
            secondary: day.failed,
            label: `${shortDate(day.date)}: ${day.completed} completed, ${day.failed} failed`,
          }))}
        />
      </Section>

      <div className="mt-14 grid grid-cols-[1.6fr_1fr] gap-10">
        <section>
          <h2 className="mb-4 text-xl font-book">Jobs by workflow</h2>
          <Table>
            <thead>
              <tr>
                <Th>Workflow</Th>
                <Th>Completed</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Avg duration</Th>
              </tr>
            </thead>
            <tbody>
              {stats.byWorkflow.length === 0 ? (
                <Tr>
                  <Td colSpan={4} tone="faint">
                    No finished jobs in this period.
                  </Td>
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
          <h2 className="mb-4 text-xl font-book">Top failure reasons</h2>
          <Table>
            <thead>
              <tr>
                <Th>Failure code</Th>
                <Th align="right">Jobs</Th>
              </tr>
            </thead>
            <tbody>
              {stats.topFailureCodes.length === 0 ? (
                <Tr>
                  <Td colSpan={2} tone="faint">
                    No failed jobs in this period.
                  </Td>
                </Tr>
              ) : (
                stats.topFailureCodes.map((row) => (
                  <Tr key={row.code}>
                    <Td tone="strong">{humanize(row.code)}</Td>
                    <Td align="right">{row.count}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
          <div className="mt-6">
            <h3 className="mb-3 text-sm text-ink-2">Jobs in progress right now</h3>
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
    { label: 'Completed', value: stats.assignments.completed, tone: 'green' },
    { label: 'Reassigned', value: stats.assignments.reassigned, tone: 'amber' },
    { label: 'Ack timeouts', value: stats.assignments.ackTimeouts, tone: 'red' },
    { label: 'Went offline', value: stats.assignments.robotOffline, tone: 'red' },
    { label: 'Rejected by robot', value: stats.assignments.robotRejected, tone: 'amber' },
  ]
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-outline-soft">
        <Card label="Robots online" value={`${stats.online} / ${stats.total}`} tone={stats.online === stats.total ? 'green' : 'amber'} />
        <Card label="Enabled" value={`${stats.enabled} / ${stats.total}`} />
        <Card
          label="Average battery"
          value={stats.averageBatteryPercent === null ? '—' : `${Math.round(stats.averageBatteryPercent)}%`}
          hint="Enabled robots"
        />
        <Card label="Low battery" value={String(stats.lowBattery)} tone={stats.lowBattery > 0 ? 'red' : 'grey'} hint="At or below 20%" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatusBreakdown items={stats.byStatus} tones={ROBOT_STATUS_TONE} />
        <div className="rounded-lg bg-container p-6">
          <h3 className="text-sm text-ink-2">How robot assignments ended in this period</h3>
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
              <Th>Robot</Th>
              <Th>Status</Th>
              <Th>Battery</Th>
              <Th align="right">Jobs completed</Th>
              <Th align="right">Interrupted</Th>
            </tr>
          </thead>
          <tbody>
            {stats.robots.length === 0 ? (
              <Tr>
                <Td colSpan={5} tone="faint">
                  No robots registered yet.
                </Td>
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
                    {!robot.isEnabled ? <span className="ml-2 text-xs text-muted">disabled</span> : null}
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
          <span className="text-sm text-ink-2">Submitted</span>
          <div className="flex items-end gap-3">
            <strong className="text-3xl font-book">{count(stats.submitted)}</strong>
            <Delta current={stats.submitted} previous={stats.previousSubmitted} neutral />
          </div>
        </div>
        <Card label="Open now" value={count(stats.open)} tone="blue" hint="Submitted, queued or in progress" />
        <Card label="Average lead time" value={compactDuration(stats.avgLeadTimeSeconds)} hint="Submitted to completed" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatusBreakdown items={stats.byStatus} tones={REQUEST_STATUS_TONE} />
        <DailyBars
          emptyText="No requests submitted in this period."
          days={stats.daily.map((day) => ({
            date: day.date,
            primary: day.submitted,
            label: `${shortDate(day.date)}: ${day.submitted} submitted, ${day.completed} completed`,
          }))}
        />
      </div>
    </>
  )
}

export function DashboardPage() {
  const [rangeId, setRangeId] = useState<RangeId>('7d')
  const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[1]

  // The window is built when the request is sent, so every refresh reaches up to "now".
  const jobs = useQuery({
    queryKey: ['statistics', 'jobs', rangeId],
    queryFn: () => getJobStatistics(windowFor(range.days)),
    refetchInterval: 60_000,
  })
  const robots = useQuery({
    queryKey: ['statistics', 'robots', rangeId],
    queryFn: () => getRobotStatistics(windowFor(range.days)),
    refetchInterval: 60_000,
  })
  const requests = useQuery({
    queryKey: ['statistics', 'requests', rangeId],
    queryFn: () => getRequestStatistics(windowFor(range.days)),
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
            <h1 className="text-4xl font-book">Statistics</h1>
            <p className="mt-3 text-base text-ink-2">
              All warehouses, {range.id === 'today' ? 'today' : `last ${range.days} days`}
              {Number.isFinite(updatedAt) ? `, updated ${formatRelativeTime(new Date(updatedAt).toISOString())}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {RANGES.map((item) => (
              <Button
                key={item.id}
                variant={item.id === rangeId ? 'primary' : 'tonal'}
                aria-pressed={item.id === rangeId}
                onClick={() => setRangeId(item.id)}
              >
                {item.label}
              </Button>
            ))}
            <IconButton
              aria-label="Refresh"
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

        <Section title="Robot fleet" note="Robots and their status right now; assignment outcomes cover the selected period.">
          <QueryState isLoading={robots.isLoading} error={robots.error}>
            {robots.data ? <RobotsSection stats={robots.data} /> : null}
          </QueryState>
        </Section>

        <Section title="Transport requests" note="Requests submitted in the selected period.">
          <QueryState isLoading={requests.isLoading} error={requests.error}>
            {requests.data ? <RequestsSection stats={requests.data} /> : null}
          </QueryState>
        </Section>
      </div>
    </div>
  )
}
