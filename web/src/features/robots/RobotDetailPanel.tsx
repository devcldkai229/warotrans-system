import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { RobotView } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import { disableRobot, enableRobot, getRobotHealth, localizeRobot } from '@/shared/api/fleet'
import { listEndpoints } from '@/shared/api/navigation'
import { listJobs, type JobSummaryDto } from '@/shared/api/jobs'
import { useAuth } from '@/features/auth/authContext'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { RobotControlCard } from './RobotControlCard'
import { RobotFaultCard } from './fault/RobotFaultCard'
import { RobotHistoryCard } from './history/RobotHistoryCard'
import { RobotCapacityCard } from './RobotCapacityCard'
import { TrafficClearanceCard } from './TrafficClearanceCard'
import { formatBattery, formatDateTimeWithYear, formatDuration, formatRelativeTime, humanize, secondsBetween } from '@/shared/lib/format'
import { BatteryLevel } from '@/shared/ui/BatteryLevel'
import { Button } from '@/shared/ui/Button'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_CONTAINER_STATUS_TONE, JOB_STATUS_TONE, ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { t } from '@/shared/i18n'
import type { RobotHealth } from '@/shared/api/fleet'
import { buildHealthGroups, countHealth, formatAge } from './technical/healthModel'
interface RobotDetailPanelProps {

  robot: RobotView
  onBack: () => void
  /** Opens manual control (go to a point on the map, or drive with buttons). */
  onManual?: () => void
  /** Opens the Technical dashboard (diagnostics, battery, connection). */
  onTechnical?: () => void
}

/**
 * Robot commands. Taking a robot out of dispatch is the Disable button above. An action the backend cannot run yet is
 * shown disabled with its reason instead of doing nothing.
 */
const ACTIONS: { id: 'manual' | 'localize' | 'technical'; label: string; icon: IconName; unavailable?: string }[] = [
  { id: 'manual', label: t('Manual'), icon: 'gamepad' },
  { id: 'localize', label: t('Localize'), icon: 'crosshair' },
  { id: 'technical', label: t('Technical'), icon: 'sliders' },
]

/**
 * Re-localize: the operator puts the robot on an endpoint and says which one; the robot sets its pose estimate there.
 * Wrong endpoint = wrong pose, so it asks to confirm the robot really stands there.
 */
function LocalizePanel({ robot, onClose }: { robot: RobotView; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [endpointId, setEndpointId] = useState('')
  const endpoints = useQuery({
    queryKey: ['map-endpoints', robot.currentMapVersionId],
    queryFn: () => listEndpoints(robot.currentMapVersionId),
  })
  const localize = useMutation({
    mutationFn: () => localizeRobot(robot.id, endpointId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['robot', robot.id] })
      void queryClient.invalidateQueries({ queryKey: ['robots'] })
    },
  })
  const chosen = endpoints.data?.find((e) => e.id === endpointId)

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-md border border-outline-soft p-4 text-sm">
      <p className="text-ink-2">Place {robot.code} on an endpoint, facing the endpoint's direction, then choose it here.</p>
      <select className="rounded-md border border-outline-soft bg-surface p-2" value={endpointId} onChange={(e) => setEndpointId(e.target.value)}>
        <option value="">Choose where the robot stands…</option>
        {(endpoints.data ?? [])
          .filter((e) => e.isEnabled !== false)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name || e.code} ({e.code})
            </option>
          ))}
      </select>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!chosen || localize.isPending} onClick={() => localize.mutate()}>
          {localize.isPending ? 'Sending…' : chosen ? `Robot is at ${chosen.name || chosen.code}: localize` : 'Localize'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {localize.isSuccess ? (
        <p className="text-xs text-ink-2">
          Sent. Localization now: <b className="font-medium">{robot.localizationStatus ?? 'unknown'}</b> (updates within a few seconds).
        </p>
      ) : null}
      {localize.error ? <p className="text-xs text-red-ink">{localize.error instanceof ApiError ? localize.error.message : 'Localize failed.'}</p> : null}
    </section>
  )
}

const TIMELINE = 'divide-y divide-outline-soft'
const TIMELINE_NOTE = 'mt-1 block text-xs text-muted'
const EMPTY = 'py-2.5 text-sm text-muted'
const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value)

interface Section {
  id: string
  label: string
  /** Shown on the collapsed row, so the panel is useful without opening anything. */
  summary: ReactNode
  body: ReactNode
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-outline-soft py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 text-right font-medium">{children}</dd>
    </div>
  )
}

/** The Health section: the counts from the robot's last snapshot, what needs attention, and the way to the full dashboard. */
function HealthBody({ robot, diagnostics }: { robot: RobotView; diagnostics: Diagnostics }) {
  const { allowed, health } = diagnostics
  const groups = buildHealthGroups(health)
  const rows = groups.flatMap((group) => group.rows)
  const attention = rows.filter((row) => row.freshness === 'stale' || row.level === 'ERROR' || row.level === 'WARN')
  const counts = countHealth(groups)

  return (
    <dl>
      {allowed && health?.receivedAt ? (
        <>
          <Field label={t('Overall')}>
            <StatusBadge tone={HEALTH_TONE[health.overall]}>{health.overall}</StatusBadge>
          </Field>
          <Field label={t('Diagnostics received {age}', { age: formatAge(health.receivedAt) })}>
            <span className="text-xs text-muted tabular-nums">
              {t('{live} live, {stale} stale, {unmeasured} not measured', { live: counts.live + counts.warn + counts.error, stale: counts.stale, unmeasured: counts.notMeasured + counts.notReported })}
            </span>
          </Field>
          {attention.slice(0, 4).map((row) => (
            <Field key={row.key} label={row.label}>
              <span className="text-xs text-muted">{row.value ?? '—'}</span>
              <StatusBadge tone={row.freshness === 'stale' ? 'amber' : HEALTH_TONE[row.level ?? 'OK']}>{row.freshness === 'stale' ? t('Stale') : (row.level ?? 'OK')}</StatusBadge>
            </Field>
          ))}
        </>
      ) : allowed ? (
        <p className={EMPTY}>{t('No diagnostics received yet.')}</p>
      ) : null}
      <Field label={t('Error code')}>{dash(robot.errorCode)}</Field>
      {allowed ? (
        <div className="pt-2">
          <Link to={`/monitor/fleet/${robot.code}/technical`} className="text-sm font-medium text-blue-ink hover:underline">
            {t('Open the technical dashboard')}
          </Link>
        </div>
      ) : null}
    </dl>
  )
}

type RecentJobs = { state: 'loading' | 'error' | 'ready'; items: JobSummaryDto[] }

/** The robot's latest health snapshot, when this person may read it (robot.diagnostics). */
interface Diagnostics {
  allowed: boolean
  health: RobotHealth | undefined
}

const HEALTH_TONE = { OK: 'green', WARN: 'amber', ERROR: 'red', STALE: 'amber', UNKNOWN: 'grey' } as const

// Every section is backed by persisted data: fleet.robots, the active JobAssignment and the robot's Job assignments.
function buildSections(robot: RobotView, recent: RecentJobs, diagnostics: Diagnostics): Section[] {
  const activity = robot.activity
  const recentJobs = recent.items
  const hasTelemetry = Boolean(robot.lastTelemetryAt)

  return [
    {
      id: 'identity',
      label: t('Identity'),
      summary: robot.name,
      body: (
        <dl>
          <Field label={t('Code')}>{robot.code}</Field>
          <Field label={t('Name')}>{robot.name}</Field>
          <Field label={t('Warehouse')}>{dash(robot.warehouseId)}</Field>
          <Field label={t('Current map version')}>{dash(robot.currentMapVersionId)}</Field>
        </dl>
      ),
    },
    {
      id: 'operational',
      label: t('Operational'),
      summary: (
        <>
          <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
            {robot.status}
          </StatusBadge>
          <span className="text-muted">{robot.isEnabled ? t('Enabled') : t('Disabled')}</span>
        </>
      ),
      body: (
        <dl>
          <Field label={t('Operational status')}>
            <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
              {robot.status}
            </StatusBadge>
          </Field>
          <Field label={t('Enabled')}>{robot.isEnabled ? t('Yes') : t('No')}</Field>
          <Field label={t('Connectivity')}>{robot.isOnline ? t('Online') : t('Offline')}</Field>
        </dl>
      ),
    },
    {
      id: 'navigation',
      label: t('Navigation'),
      summary: robot.navigationStatus ?? t('No telemetry yet'),
      body: (
        <dl>
          <Field label={t('Navigation status')}>{dash(robot.navigationStatus)}</Field>
          <Field label={t('Localization status')}>{dash(robot.localizationStatus)}</Field>
          <Field label={t('Current command')}>{dash(robot.currentCommandId)}</Field>
        </dl>
      ),
    },
    {
      id: 'telemetry',
      label: t('Telemetry'),
      summary: hasTelemetry ? formatBattery(robot.batteryPercent) : t('No telemetry yet'),
      body: (
        <dl>
          <Field label={t('Battery')}>
            {hasTelemetry ? <BatteryLevel percent={robot.batteryPercent} /> : '—'}
          </Field>
          <Field label={t('Pose X')}>{hasTelemetry ? `${robot.poseX.toFixed(2)} m` : '—'}</Field>
          <Field label={t('Pose Y')}>{hasTelemetry ? `${robot.poseY.toFixed(2)} m` : '—'}</Field>
          <Field label={t('Pose yaw')}>{hasTelemetry ? `${Math.round((robot.poseYaw * 180) / Math.PI)}°` : '—'}</Field>
          <Field label={t('Linear velocity')}>{dash(robot.linearVelocity)}</Field>
          <Field label={t('Angular velocity')}>{dash(robot.angularVelocity)}</Field>
          <Field label={t('Last telemetry')}>{formatDateTimeWithYear(robot.lastTelemetryAt)}</Field>
          {!hasTelemetry ? (
            <p className="py-2 text-xs text-muted">{t('Pose and battery default to 0 until the first telemetry message. Values shown as "—" until telemetry is received.')}</p>
          ) : null}
        </dl>
      ),
    },
    {
      id: 'connectivity',
      label: t('Connectivity'),
      summary: robot.isOnline ? t('Online') : t('Offline'),
      body: (
        <dl>
          <Field label={t('Online')}>{robot.isOnline ? t('Yes') : t('No')}</Field>
          <Field label={t('Last heartbeat')}>
            {formatRelativeTime(robot.lastHeartbeatAt)}
            <span className="basis-full text-xs font-normal text-muted">
              {formatDateTimeWithYear(robot.lastHeartbeatAt)}
            </span>
          </Field>
          <Field label={t('Map version code')}>{dash(robot.mapVersionCode)}</Field>
        </dl>
      ),
    },
    {
      id: 'health',
      label: t('Health'),
      // What the robot reported, never a made-up "OK": no snapshot yet says so.
      summary: robot.errorCode ?? (diagnostics.health?.receivedAt ? humanize(diagnostics.health.overall) : t('No diagnostics yet')),
      body: <HealthBody robot={robot} diagnostics={diagnostics} />,
    },
    {
      id: 'system',
      label: t('System'),
      summary: formatDateTimeWithYear(robot.createdAt),
      body: (
        <dl>
          <Field label={t('Created')}>{formatDateTimeWithYear(robot.createdAt)}</Field>
          <Field label={t('Updated')}>{formatDateTimeWithYear(robot.updatedAt)}</Field>
        </dl>
      ),
    },
    {
      id: 'job',
      label: t('Current job'),
      summary: activity ? activity.requestCode : t('No active job'),
      body: activity ? (
        <dl>
          <Field label={t('Job')}>{activity.jobNo}</Field>
          <Field label={t('Request')}>{activity.requestCode}</Field>
          <Field label={t('Status')}>
            <StatusBadge tone={JOB_STATUS_TONE[activity.jobStatus]}>{activity.jobStatus}</StatusBadge>
          </Field>
          <Field label={t('Progress')}>
            {activity.progressPercent}%{' '}
            <Meter percent={activity.progressPercent} tone={activity.jobStatus === 'FAILED' ? 'red' : 'blue'} className="w-12" />
          </Field>
          {activity.routeLabel ? <Field label={t('Route')}>{activity.routeLabel}</Field> : null}
          {activity.containers?.length ? (
            <Field label={activity.containers.length > 1 ? t('Containers') : t('Container')}>
              <ul className="flex flex-col items-end gap-1.5">
                {activity.containers.map((container) => (
                  <li key={container.barcode} className="flex items-center gap-2">
                    {container.barcode}
                    <StatusBadge tone={JOB_CONTAINER_STATUS_TONE[container.status]}>{container.status}</StatusBadge>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
        </dl>
      ) : (
        <p className={EMPTY}>{t('This robot has no job assigned.')}</p>
      ),
    },
    {
      id: 'recent',
      label: t('Recent jobs'),
      summary: recent.state === 'loading' ? t('Loading…') : recent.state === 'error' ? t('Unavailable') : recentJobs.length ? t('Last {length}', { length: recentJobs.length }) : t('No jobs yet'),
      body: recentJobs.length ? (
        <ol className={TIMELINE}>
          {recentJobs.map((item) => {
            const seconds = secondsBetween(item.startedAt, item.completedAt)
            return (
              <li key={item.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/monitor/jobs/${item.id}`} className="font-medium hover:underline">
                    {item.jobNo}
                  </Link>
                  <StatusBadge tone={JOB_STATUS_TONE[item.status]}>{item.status}</StatusBadge>
                </div>
                <span className={TIMELINE_NOTE}>{t('{value}, {containerCount} container{value2}', { value: formatRelativeTime(item.createdAt), containerCount: item.containerCount, value2: item.containerCount === 1 ? '' : 's' })}{item.completedAt && seconds !== null ? `, ${formatDuration(seconds)}` : item.completedAt ? '' : t(', in progress')}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className={EMPTY}>
          {recent.state === 'loading'
            ? t('Loading jobs…')
            : recent.state === 'error'
              ? t('The jobs of this robot could not be loaded.')
              : t('This robot has not been assigned any job yet.')}
        </p>
      ),
    },
    {
      id: 'history',
      label: t('State history'),
      summary: t('State changes and commands'),
      body: (
        <>
          <RobotHistoryCard robot={robot} />
          <Link to={`/operations/robot-history?robot=${encodeURIComponent(robot.code)}`} className="mb-2 inline-block text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            {t('Open the full history')}
          </Link>
        </>
      ),
    },
  ]
}

export function RobotDetailPanel({ robot, onBack, onManual, onTechnical }: RobotDetailPanelProps) {
  const queryClient = useQueryClient()
  const { capabilities } = useAuth()
  const mayConfigure = canActOnRobot(capabilities, PERMISSIONS.robotConfigure, robot.id)
  const mayDrive = canActOnRobot(capabilities, PERMISSIONS.robotManualDrive, robot.id)
  const mayDiagnose = canActOnRobot(capabilities, PERMISSIONS.robotDiagnostics, robot.id)
  const recentQuery = useQuery({
    queryKey: ['jobs', 'by-robot', robot.id],
    queryFn: () => listJobs({ robotId: robot.id, take: 5 }),
    refetchInterval: 10_000,
  })
  // Shares its query key with the Control card, so the snapshot is fetched once.
  const healthQuery = useQuery({
    queryKey: ['robot-health', robot.id],
    queryFn: () => getRobotHealth(robot.id),
    enabled: mayDiagnose,
    refetchInterval: 10_000,
  })
  const sections = buildSections(
    robot,
    {
      state: recentQuery.isError ? 'error' : recentQuery.data ? 'ready' : 'loading',
      items: recentQuery.data?.items ?? [],
    },
    { allowed: mayDiagnose, health: healthQuery.data },
  )
  const [openIds, setOpenIds] = useState<string[]>(['identity', 'operational'])
  const [actionError, setActionError] = useState<string | null>(null)
  const [localizing, setLocalizing] = useState(false)
  const mayCommand = canActOnRobot(capabilities, PERMISSIONS.robotCommand, robot.id)
  const navigationState = robot.telemetry?.navigationState

  const enableMutation = useMutation({
    mutationFn: () => enableRobot(robot.id),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : (err as Error).message)
    },
  })

  const disableMutation = useMutation({
    mutationFn: () => disableRobot(robot.id),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : (err as Error).message)
    },
  })

  const toggling = enableMutation.isPending || disableMutation.isPending

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-6 pt-4 pb-2">
        <Button variant="surface" size="sm" className="self-start" onClick={onBack}>
          <Icon name="arrowLeft" size={14} />{' '}{t('Fleet')}</Button>
        <div className="mt-3 mb-2 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-book">{robot.code}</h1>
          <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
            {robot.status}
          </StatusBadge>
        </div>
        <p className="mb-4 text-sm text-muted">{t('Connectivity:')}{' '}{robot.isOnline ? t('Online') : t('Offline')}
          {' · '}
          {robot.isEnabled ? t('Enabled') : t('Disabled')}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {!mayConfigure ? null : robot.isEnabled ? (
            <Button
              variant="surface"
              size="sm"
              disabled={toggling}
              onClick={() => disableMutation.mutate()}
            >{t('Disable')}</Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={toggling}
              onClick={() => enableMutation.mutate()}
            >{t('Enable')}</Button>
          )}
        </div>
        {actionError ? <p className="mb-4 text-xs text-red-ink">{actionError}</p> : null}

        <RobotControlCard robotId={robot.id} robotCode={robot.code} />
        <TrafficClearanceCard robotId={robot.id} robotCode={robot.code} />
        <RobotCapacityCard key={robot.id} robot={robot} />

        <RobotFaultCard robot={robot} />

        <div className="mt-6 grid grid-cols-3 gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="group flex flex-col items-center gap-2 text-xs text-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                Boolean(action.unavailable) ||
                (action.id === 'manual' && (!onManual || !mayDrive)) ||
                (action.id === 'localize' && (!mayCommand || !robot.isOnline)) ||
                (action.id === 'technical' && (!onTechnical || !mayDiagnose))
              }
              title={
                action.unavailable ??
                (action.id === 'manual' && !mayDrive
                  ? t('You may not drive this robot.')
                  : action.id === 'localize' && !robot.isOnline
                    ? t('The robot is offline.')
                    : action.id === 'technical' && !mayDiagnose
                      ? t('You do not have access to the diagnostics of this robot.')
                      : undefined)
              }
              onClick={action.id === 'manual' ? onManual : action.id === 'localize' ? () => setLocalizing(true) : action.id === 'technical' ? onTechnical : undefined}
            >
              <span className="grid size-12 place-items-center rounded-full bg-surface text-ink transition-colors duration-200 group-enabled:group-hover:bg-container-higher">
                <Icon name={action.icon} size={18} />
              </span>
              {action.label}
            </button>
          ))}
        </div>
        {localizing ? <LocalizePanel robot={robot} onClose={() => setLocalizing(false)} /> : null}
        <ul className="mt-3 mb-6 flex flex-col gap-1 text-xs text-muted">
          {ACTIONS.filter((action) => action.unavailable).map((action) => (
            <li key={action.label}>
              <span className="font-medium text-ink-2">{action.label}:</span> {action.unavailable}
            </li>
          ))}
        </ul>

        {navigationState ? (
          <p className="mb-4 flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted">{t('Navigation')}</span>
            <span className="font-medium">{navigationState}</span>
          </p>
        ) : null}

        <div className="border-t border-outline">
          {sections.map((section) => {
            const isOpen = openIds.includes(section.id)
            return (
              <section key={section.id} className="border-b border-outline">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-2 text-left text-sm text-ink-2 transition-colors duration-200 hover:text-ink"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenIds(isOpen ? openIds.filter((id) => id !== section.id) : [...openIds, section.id])
                  }
                >
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} />
                  <span className="font-medium whitespace-nowrap text-ink">{section.label}</span>
                  {isOpen ? null : (
                    <span className="ml-auto flex min-w-0 items-center gap-2 truncate text-muted">{section.summary}</span>
                  )}
                </button>
                {isOpen ? <div className="mb-3 rounded-md bg-surface px-4 py-1">{section.body}</div> : null}
              </section>
            )
          })}
        </div>
      </div>

    </div>
  )
}
