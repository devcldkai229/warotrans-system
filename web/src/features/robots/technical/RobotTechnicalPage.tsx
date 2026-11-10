import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { explainJobProblem } from '@/features/jobs/failureCatalog'
import { useAuth } from '@/features/auth/authContext'
import { getRobot, getRobotHealth, listRobots, type RobotHealth } from '@/shared/api/fleet'
import { listJobs } from '@/shared/api/jobs'
import { listIssues } from '@/shared/api/operations'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatDateTimeWithYear } from '@/shared/lib/format'
import { useNotificationsHub, type RobotHealthUpdatedMessage } from '@/shared/realtime/useNotificationsHub'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE, type Tone } from '@/shared/ui/statusTones'
import {
  buildHealthGroups,
  countHealth,
  formatAge,
  freshnessOfTime,
  HEARTBEAT_STALE_SECONDS,
  readBattery,
  TELEMETRY_STALE_SECONDS,
  type Freshness,
  type HealthLevel,
  type HealthRow,
} from './healthModel'

const ACTIVE_JOB_STATUSES = ['ASSIGNED', 'RUNNING', 'PAUSED', 'REASSIGNING', 'RECOVERY_REQUIRED']
const LEVEL_TONE: Record<HealthLevel, Tone> = { OK: 'green', WARN: 'amber', ERROR: 'red', STALE: 'amber', UNKNOWN: 'grey' }
const CARD = 'rounded-lg border border-outline-soft bg-container p-5'

/** Re-renders every second so "5 s ago" keeps counting between refetches. */
function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/**
 * A health row shows the robot's own level when it is live. Anything else (a battery reading, a heartbeat) has no
 * level, so it only says whether it is live; the other states say why there is nothing current to show.
 */
function StateChip({ freshness, level = null }: { freshness: Freshness; level?: HealthLevel | null }) {
  if (freshness === 'stale') return <StatusBadge tone="amber">{t('Stale')}</StatusBadge>
  if (freshness === 'not_measured') return <StatusBadge tone="grey">{t('Not measured')}</StatusBadge>
  if (freshness === 'not_reported') return <StatusBadge tone="grey">{t('Not reported')}</StatusBadge>
  if (level === null) return <StatusBadge tone="green">{t('Live')}</StatusBadge>
  return <StatusBadge tone={LEVEL_TONE[level]}>{level}</StatusBadge>
}

function Card({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className={CARD}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">{title}</h2>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </header>
      {children}
    </section>
  )
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-outline-soft py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 text-right">
        {children}
        {hint ? <span className="basis-full text-xs text-muted">{hint}</span> : null}
      </dd>
    </div>
  )
}

const dash = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '—' : String(value))

function HealthRowView({ row, now }: { row: HealthRow; now: Date }) {
  const empty = row.freshness === 'not_measured' || row.freshness === 'not_reported'
  return (
    <Row
      label={row.label}
      hint={
        row.message ? row.message : row.measuredAt ? t('Measured {age}', { age: formatAge(row.measuredAt, now) }) : undefined
      }
    >
      {/* A value the robot did not measure is left out, not shown as 0 or as a made-up number. */}
      {row.value !== null ? <span className={empty ? 'text-muted' : 'font-medium tabular-nums'}>{row.value}</span> : null}
      <StateChip freshness={row.freshness} level={row.level} />
    </Row>
  )
}

/** BOTH-09 / RB-02: one robot's technical state from its own reports (health snapshot, telemetry, battery, control). */
export function RobotTechnicalPage() {
  const { robotCode = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { capabilities } = useAuth()
  const now = useNow()

  const found = useQuery({
    queryKey: ['robot-by-code', robotCode],
    queryFn: async () => (await listRobots({ search: robotCode, take: 20 })).items.find((robot) => robot.code === robotCode) ?? null,
  })
  const robotId = found.data?.id ?? null
  const robotQuery = useQuery({
    queryKey: ['robot', robotId],
    queryFn: () => getRobot(robotId!),
    enabled: robotId !== null,
    refetchInterval: 5_000,
  })
  const robot = robotQuery.data ?? found.data ?? null

  const mayDiagnose = robotId !== null && canActOnRobot(capabilities, PERMISSIONS.robotDiagnostics, robotId)
  const healthQuery = useQuery({
    queryKey: ['robot-health', robotId],
    queryFn: () => getRobotHealth(robotId!),
    enabled: mayDiagnose,
    // The hub pushes each snapshot; the poll covers a dropped connection.
    refetchInterval: 5_000,
  })
  const health: RobotHealth | undefined = healthQuery.data
  const onHealth = useCallback(
    (message: RobotHealthUpdatedMessage) => {
      if (message.robotId === robotId) void queryClient.invalidateQueries({ queryKey: ['robot-health', robotId] })
    },
    [queryClient, robotId],
  )
  useNotificationsHub({ robotHealthUpdated: onHealth })

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'list', 'robot-technical', robotId],
    queryFn: () => listJobs({ robotId: robotId!, take: 10 }),
    enabled: robotId !== null,
    refetchInterval: 10_000,
  })
  const activeJob = jobsQuery.data?.items.find((job) => ACTIVE_JOB_STATUSES.includes(job.status)) ?? null

  const issuesQuery = useQuery({
    queryKey: ['issues', 'robot', robotId],
    queryFn: () => listIssues({ robotId: robotId!, take: 20 }),
    enabled: robotId !== null,
    refetchInterval: 30_000,
    retry: false,
  })
  const openIssues = (issuesQuery.data?.items ?? []).filter((issue) => issue.status !== 'CLOSED' && issue.status !== 'RESOLVED')

  const groups = useMemo(() => buildHealthGroups(health), [health])
  const counts = useMemo(() => countHealth(groups), [groups])

  if (found.isLoading) return <p className="px-10 py-8 text-sm text-muted">{t('Loading robots…')}</p>
  if (!robot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-book">{t('That robot was not found. It may have been removed, or you may not have access to it.')}</h1>
        <Button variant="primary" onClick={() => navigate('/monitor/fleet')}>
          {t('Fleet')}
        </Button>
      </div>
    )
  }

  const battery = readBattery(robot, now)
  const telemetryFreshness = freshnessOfTime(robot.lastTelemetryAt, TELEMETRY_STALE_SECONDS, now)
  const heartbeatFreshness = freshnessOfTime(robot.lastHeartbeatAt, HEARTBEAT_STALE_SECONDS, now)

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1300px] px-10 pt-4 pb-16">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate(`/monitor/fleet/${robot.code}`)}>
          <Icon name="arrowLeft" size={14} />{' '}{t('Back to robot')}
        </Button>

        <header className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-book">{robot.code}</h1>
          <span className="text-lg text-ink-2">{t('Technical dashboard')}</span>
          <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
            {robot.status}
          </StatusBadge>
          <StatusBadge tone={robot.isOnline ? 'green' : 'grey'}>{robot.isOnline ? t('Online') : t('Offline')}</StatusBadge>
          {!robot.isEnabled ? <StatusBadge tone="grey">{t('Disabled')}</StatusBadge> : null}
          <span className="ml-auto text-sm text-muted">{robot.name}</span>
        </header>

        {/* The state of the diagnostics as a whole: live, stale, or never reported. */}
        {mayDiagnose ? (
          <section className="mt-6 rounded-lg bg-container p-4" aria-live="polite">
            {health && health.receivedAt ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <StatusBadge tone={LEVEL_TONE[health.overall]} withDot>
                  {health.overall}
                </StatusBadge>
                <span className="text-ink-2">{t('Diagnostics received {age}', { age: formatAge(health.receivedAt, now) })}</span>
                <span className="flex flex-wrap gap-1.5">
                  {counts.error > 0 ? <StatusBadge tone="red">{t('{count} error', { count: counts.error })}</StatusBadge> : null}
                  {counts.warn > 0 ? <StatusBadge tone="amber">{t('{count} warning', { count: counts.warn })}</StatusBadge> : null}
                  {counts.stale > 0 ? <StatusBadge tone="amber">{t('{count} stale', { count: counts.stale })}</StatusBadge> : null}
                  {counts.notMeasured > 0 ? <StatusBadge tone="grey">{t('{count} not measured', { count: counts.notMeasured })}</StatusBadge> : null}
                  {counts.notReported > 0 ? <StatusBadge tone="grey">{t('{count} not reported', { count: counts.notReported })}</StatusBadge> : null}
                  <StatusBadge tone="green">{t('{count} live', { count: counts.live })}</StatusBadge>
                </span>
              </div>
            ) : (
              <p className="text-sm text-ink-2">{t('This robot has not reported diagnostics yet. It sends a snapshot every few seconds once it is running.')}</p>
            )}
            {health?.stale ? (
              <p role="alert" className="mt-3 rounded-sm bg-amber-soft px-3 py-2 text-sm text-amber-ink">
                {t('No new diagnostics since the one received {age}: every value below is the last one the robot reported, shown stale.', { age: formatAge(health.receivedAt, now) })}
              </p>
            ) : null}
            {healthQuery.isError ? <p role="alert" className="mt-3 text-sm text-red-ink">{t('Could not load the diagnostics.')}</p> : null}
          </section>
        ) : (
          <p className="mt-6 rounded-lg bg-container p-4 text-sm text-ink-2">{t('You do not have access to the diagnostics of this robot.')}</p>
        )}

        <div className="mt-6 grid grid-cols-2 items-start gap-6">
          <div className="flex flex-col gap-6">
            {mayDiagnose
              ? groups.map((group) => (
                  <Card key={group.id} title={group.title}>
                    <dl>
                      {group.rows.map((row) => (
                        <HealthRowView key={row.key} row={row} now={now} />
                      ))}
                    </dl>
                  </Card>
                ))
              : null}

            <Card title={t('State history')}>
              <p className="text-sm text-muted">{t('State changes of this robot are not recorded yet.')}</p>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title={t('Battery')} hint={battery.measuredAt ? t('Measured {age}', { age: formatAge(battery.measuredAt, now) }) : undefined}>
              <dl>
                <Row label={t('Charge')}>
                  {battery.percent === null ? (
                    <span className="text-muted">{t('Unknown')}</span>
                  ) : (
                    <>
                      <Meter percent={battery.percent} tone={battery.percent <= 20 ? 'red' : 'green'} className="w-24" />
                      <span className="font-medium tabular-nums">{Math.round(battery.percent)}%</span>
                    </>
                  )}
                  <StateChip freshness={battery.freshness} />
                </Row>
                <Row label={t('Voltage')}>{battery.voltage ?? <span className="text-muted">{t('Not reported')}</span>}</Row>
                <Row label={t('Estimated by')}>{battery.mode ? battery.mode : <span className="text-muted">{t('Not reported')}</span>}</Row>
                <Row label={t('Confidence')}>{battery.confidence ? battery.confidence : <span className="text-muted">{t('Not reported')}</span>}</Row>
                <Row label={t('Charging')}>{battery.charging ? t('Charging') : t('Not charging')}</Row>
              </dl>
            </Card>

            <Card title={t('Connection')}>
              <dl>
                <Row label={t('Last heartbeat')} hint={robot.lastHeartbeatAt ? formatDateTimeWithYear(robot.lastHeartbeatAt) : undefined}>
                  {formatAge(robot.lastHeartbeatAt, now)}
                  <StateChip freshness={heartbeatFreshness} />
                </Row>
                <Row label={t('Last telemetry')} hint={robot.lastTelemetryAt ? formatDateTimeWithYear(robot.lastTelemetryAt) : undefined}>
                  {formatAge(robot.lastTelemetryAt, now)}
                  <StateChip freshness={telemetryFreshness} />
                </Row>
                <Row label={t('Map version code')}>{dash(robot.mapVersionCode)}</Row>
                <Row label={t('Error code')}>{robot.errorCode ? <span className="font-mono text-red-ink">{robot.errorCode}</span> : '—'}</Row>
              </dl>
            </Card>

            <Card title={t('Navigation')}>
              <dl>
                {/* The robot's Nav2 and localization state is only as good as its last telemetry. */}
                <Row label={t('Navigation status')}>
                  {dash(robot.navigationStatus)}
                  <StateChip freshness={robot.navigationStatus ? telemetryFreshness : 'not_reported'} />
                </Row>
                <Row label={t('Localization status')}>
                  {dash(robot.localizationStatus)}
                  <StateChip freshness={robot.localizationStatus ? telemetryFreshness : 'not_reported'} />
                </Row>
                <Row label={t('Position')}>
                  <span className="font-mono tabular-nums">
                    {telemetryFreshness === 'not_reported'
                      ? '—'
                      : `${robot.poseX.toFixed(2)}, ${robot.poseY.toFixed(2)} · ${robot.poseYaw.toFixed(2)} rad`}
                  </span>
                </Row>
                <Row label={t('Current command')}>
                  {robot.currentCommandId ? <span className="font-mono text-xs">{robot.currentCommandId.slice(0, 8)}</span> : '—'}
                </Row>
              </dl>
            </Card>

            <Card title={t('Control')}>
              <dl>
                <Row label={t('Motion')}>{robot.motionHeld ? t('Held after a stop') : t('Free to move')}</Row>
                <Row
                  label={t('Manual drive')}
                  hint={robot.manualLeaseUntil ? t('until {time}', { time: formatDateTimeWithYear(robot.manualLeaseUntil) }) : undefined}
                >
                  {robot.manualLeaseHolderName ? robot.manualLeaseHolderName : <span className="text-muted">{t('Nobody')}</span>}
                </Row>
                <Row label={t('Maintenance')} hint={robot.maintenanceSince ? formatDateTimeWithYear(robot.maintenanceSince) : undefined}>
                  {robot.status === 'MAINTENANCE' ? robot.maintenanceReason || t('In maintenance') : <span className="text-muted">{t('Not in maintenance')}</span>}
                </Row>
                <Row label={t('System actions')}>
                  {robot.capabilities && robot.capabilities.length > 0 ? robot.capabilities.join(', ') : <span className="text-muted">{t('None announced')}</span>}
                </Row>
              </dl>
            </Card>

            <Card title={t('Current job')}>
              {jobsQuery.isError ? (
                <p className="text-sm text-muted">{t('The jobs of this robot could not be loaded.')}</p>
              ) : activeJob ? (
                <JobLine job={activeJob} />
              ) : (
                <p className="text-sm text-muted">{t('No active job')}</p>
              )}
            </Card>

            <Card title={t('Open issues')}>
              {issuesQuery.isError ? (
                <p className="text-sm text-muted">{t('Issues are not available to you.')}</p>
              ) : openIssues.length === 0 ? (
                <p className="text-sm text-muted">{t('No open issues for this robot.')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {openIssues.slice(0, 5).map((issue) => (
                    <li key={issue.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <Link to={`/operations/issues/${issue.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                        <span className="font-medium">{issue.code}</span>
                        <span className="text-ink-2">{' · '}{issue.description}</span>
                      </Link>
                      <StatusBadge tone={issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? 'red' : 'amber'}>{issue.severity}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function JobLine({ job }: { job: { id: string; jobNo: string; status: keyof typeof JOB_STATUS_TONE; failureCode: string | null; completedSteps: number; totalSteps: number } }) {
  const problem = explainJobProblem(job)
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-3">
        <Link to={`/monitor/jobs/${job.id}`} className="font-medium underline-offset-2 hover:underline">
          {job.jobNo}
        </Link>
        <StatusBadge tone={JOB_STATUS_TONE[job.status]} withDot>
          {job.status}
        </StatusBadge>
        <span className="text-xs text-muted tabular-nums">
          {job.completedSteps}/{job.totalSteps}
        </span>
      </div>
      {problem ? <p className="text-ink-2">{problem.title}</p> : null}
    </div>
  )
}
