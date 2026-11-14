import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import type { Robot } from '@/shared/api/contracts'
import { getRobotPoseHistory } from '@/shared/api/fleet'
import { listJobs } from '@/shared/api/jobs'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatDateTimeFull, formatDateTimeWithYear } from '@/shared/lib/format'
import { WarehouseMap } from '@/shared/map/WarehouseMap'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { controlClass } from '@/shared/ui/controlClass'
import { PERIODS, pathOnMap, rangeEnds, trailSegments, type PeriodKey } from './pathModel'

type PathRobot = Pick<Robot, 'id' | 'code' | 'status' | 'warehouseId' | 'currentMapVersionId'>

/**
 * FE-09 / FE-19: where a robot went, over a recent period or during one Job, drawn on its map with a slider to replay
 * the path point by point. The points come from the movement history (a point every quarter metre or turn, and where
 * the robot stopped), so a robot standing still adds nothing.
 */
export function RobotPathCard({ robot }: { robot: PathRobot }) {
  const { capabilities } = useAuth()
  const allowed = canActOnRobot(capabilities, PERMISSIONS.robotRead, robot.id)
  const [period, setPeriod] = useState<PeriodKey>('1h')
  const [jobId, setJobId] = useState('')
  const [cursor, setCursor] = useState<number | null>(null)

  const jobs = useQuery({
    queryKey: ['jobs', 'by-robot', robot.id, 'path'],
    queryFn: () => listJobs({ robotId: robot.id, take: 20 }),
    enabled: allowed,
    staleTime: 30_000,
  })

  const history = useQuery({
    queryKey: ['robot-pose-history', robot.id, jobId || period],
    queryFn: () => {
      if (jobId) return getRobotPoseHistory(robot.id, { jobId })
      const to = new Date()
      const from = new Date(to.getTime() - PERIODS[period].hours * 3_600_000)
      return getRobotPoseHistory(robot.id, { from: from.toISOString(), to: to.toISOString() })
    },
    enabled: allowed,
    placeholderData: keepPreviousData,
  })

  const map = useMonitorMapVersion({
    preferredWarehouseId: robot.warehouseId,
    preferredMapVersionId: robot.currentMapVersionId,
    enabled: allowed,
  })

  const points = useMemo(() => history.data?.points ?? [], [history.data])
  const shown = useMemo(() => pathOnMap(points, map.version?.code ?? null), [points, map.version?.code])
  const last = shown.points.length - 1
  const at = cursor === null || cursor > last ? last : cursor
  const current = at >= 0 ? shown.points[at] : null
  // Up to the replay position only, so the line ends where the robot is drawn.
  const segments = useMemo(() => trailSegments(shown.points.slice(0, at + 1)), [shown.points, at])

  if (!allowed) {
    return <p className="text-sm text-muted">{t('You cannot see this robot.')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={controlClass('pill')}
          aria-label={t('Period')}
          value={period}
          disabled={jobId !== ''}
          onChange={(event) => {
            setPeriod(event.target.value as PeriodKey)
            setCursor(null)
          }}
        >
          {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
            <option key={key} value={key}>
              {t(PERIODS[key].label)}
            </option>
          ))}
        </select>
        <select
          className={controlClass('pill')}
          aria-label={t('Job')}
          value={jobId}
          onChange={(event) => {
            setJobId(event.target.value)
            setCursor(null)
          }}
        >
          <option value="">{t('Any job')}</option>
          {(jobs.data?.items ?? []).map((job) => (
            <option key={job.id} value={job.id}>
              {job.jobNo} · {formatDateTimeWithYear(job.startedAt ?? job.createdAt)}
            </option>
          ))}
        </select>
        {history.data ? (
          <span className="ml-auto text-xs text-muted">
            {t('{distance} m travelled', { distance: history.data.distanceMeters.toFixed(1) })}
            {shown.points.length > 1
              ? ` · ${t('{from} to {to}', rangeEnds(shown.points[0].at, shown.points[last].at))}`
              : ''}
            {' · '}
            {t('{count} points', { count: history.data.total })}
            {history.data.downsampled ? ` (${t('thinned out to {count}', { count: points.length })})` : ''}
          </span>
        ) : null}
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-md border border-outline-soft bg-container-high">
        <WarehouseMap
          yawUnit="rad"
          endpoints={map.geometry.endpoints}
          edges={map.geometry.edges}
          zones={map.geometry.zones}
          bounds={map.geometry.bounds}
          occupancyImageUrl={map.geometry.occupancyImageUrl}
          layers={{ occupancy: true }}
          labels="all"
          trails={segments.length > 0 ? [{ segments }] : []}
          robots={current ? [{ code: robot.code, status: robot.status, x: current.x, y: current.y, yaw: current.yaw }] : []}
        />
        {history.isPending ? (
          <p className="absolute inset-x-0 top-3 text-center text-sm text-muted">{t('Loading…')}</p>
        ) : history.isError ? (
          <p role="alert" className="absolute inset-x-0 top-3 text-center text-sm text-red-ink">
            {history.error instanceof Error ? history.error.message : t('The movement history could not be loaded.')}
          </p>
        ) : shown.points.length === 0 ? (
          <p className="absolute inset-x-0 top-3 text-center text-sm text-muted">
            {jobId ? t('No movement recorded for this job.') : t('No movement recorded in this period.')}
          </p>
        ) : null}
      </div>

      {shown.points.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="range"
            className="min-w-[240px] flex-1"
            aria-label={t('Replay the path')}
            min={0}
            max={last}
            value={at}
            onChange={(event) => setCursor(Number(event.target.value))}
          />
          {current ? (
            <span className="text-xs tabular-nums text-ink-2">
              {formatDateTimeFull(current.at)} · {current.x.toFixed(2)}, {current.y.toFixed(2)} m
              {current.linearVelocity !== null ? ` · ${current.linearVelocity.toFixed(2)} m/s` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted">
        {shown.elsewhere > 0
          ? `${t('{count} points were on another map and are not drawn.', { count: shown.elsewhere })} `
          : ''}
        {history.data
          ? t('Movement history is kept since {date}.', { date: formatDateTimeWithYear(history.data.keptSince) })
          : null}
      </p>
    </div>
  )
}
