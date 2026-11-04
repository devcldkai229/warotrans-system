import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import type { Robot, RobotStatus, RobotView } from '@/shared/api/contracts'
import { listRobots } from '@/shared/api/fleet'
import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import { MapVersionToolbar } from '@/shared/map/MapVersionToolbar'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { useNotificationsHub, type RobotTelemetryMessage } from '@/shared/realtime/useNotificationsHub'
import { Button, IconButton } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { FleetMap } from './FleetMap'
import { RegisterRobotDialog } from './RegisterRobotDialog'
import { RobotDetailPanel } from './RobotDetailPanel'
import { ROBOT_STATUS_ORDER } from './constants'

const chipClass = (active: boolean) =>
  cx(
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs whitespace-nowrap transition-colors duration-200',
    active ? 'bg-primary text-white' : 'bg-surface text-ink-2 hover:text-ink',
  )

function toRobotView(robot: Robot): RobotView {
  return { ...robot, activity: null }
}

export function FleetPage() {
  const { robotCode } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [previewCode, setPreviewCode] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<RobotStatus | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const statusRailRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebouncedValue(query.trim(), 250)
  const search = debouncedQuery || undefined

  // Live poses over SignalR (5 Hz telemetry); the REST list refreshes status/command every few seconds.
  const [livePoses, setLivePoses] = useState<Record<string, RobotTelemetryMessage>>({})
  const onTelemetry = useCallback(
    (message: RobotTelemetryMessage) => setLivePoses((current) => ({ ...current, [message.robotId]: message })),
    [],
  )
  useNotificationsHub({ robotTelemetryUpdated: onTelemetry })

  const countsQuery = useQuery({
    queryKey: ['fleet-robots', 'counts', search ?? ''],
    queryFn: () => listRobots({ search, take: 100 }),
    refetchInterval: 5000,
  })

  const listQuery = useQuery({
    queryKey: ['fleet-robots', 'list', search ?? '', statusFilter ?? 'ALL'],
    queryFn: () =>
      listRobots({
        search,
        status: statusFilter ?? undefined,
        take: 100,
      }),
  })

  const robotsForCounts = useMemo(
    () =>
      (countsQuery.data?.items ?? []).map((robot) => {
        const live = livePoses[robot.id]
        const fresher = live && (!robot.lastTelemetryAt || (live.lastTelemetryAt ?? '') >= robot.lastTelemetryAt)
        return toRobotView(
          fresher
            ? {
                ...robot,
                poseX: live.poseX,
                poseY: live.poseY,
                poseYaw: live.poseYaw,
                navigationStatus: (live.navigationStatus as Robot['navigationStatus']) ?? robot.navigationStatus,
              }
            : robot,
        )
      }),
    [countsQuery.data, livePoses],
  )
  const robots = useMemo(
    () => (listQuery.data?.items ?? []).map(toRobotView),
    [listQuery.data],
  )
  const totalForHeader = countsQuery.data?.total ?? robotsForCounts.length

  const counts = useMemo(() => {
    const map = new Map<RobotStatus, number>()
    ROBOT_STATUS_ORDER.forEach((status) => map.set(status, 0))
    robotsForCounts.forEach((robot) => map.set(robot.status, (map.get(robot.status) ?? 0) + 1))
    return map
  }, [robotsForCounts])

  // Detail + map use the search-scoped set (no status filter) so a selected robot stays findable.
  const selected = robotsForCounts.find((robot) => robot.code === robotCode) ?? null
  const isLoading = listQuery.isLoading || countsQuery.isLoading
  const error = listQuery.error ?? countsQuery.error

  const preferredWarehouseId = selected?.warehouseId ?? null
  const preferredMapVersionId = selected?.currentMapVersionId ?? null

  const monitorMap = useMonitorMapVersion({
    preferredWarehouseId,
    preferredMapVersionId,
  })

  const robotsOnMap = useMemo(
    () =>
      robotsForCounts.filter(
        (robot) =>
          !monitorMap.warehouseId ||
          robot.warehouseId === monitorMap.warehouseId,
      ),
    [robotsForCounts, monitorMap.warehouseId],
  )

  function scrollStatuses(direction: 1 | -1) {
    statusRailRef.current?.scrollBy({ left: direction * 160, behavior: 'smooth' })
  }

  function openRegister() {
    setRegisterOpen(true)
  }

  return (
    // The side panel is the Robot list, or one Robot's detail; the map keeps the rest of the frame either way.
    <div className={cx('grid h-full gap-3 px-3 pb-3', selected ? 'grid-cols-[400px_minmax(0,1fr)]' : 'grid-cols-[360px_minmax(0,1fr)]')}>
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container">
        {selected ? (
          <RobotDetailPanel
            robot={selected}
            onBack={() => navigate('/monitor/fleet')}
            onManual={() => navigate(`/monitor/fleet/${selected.code}/manual`)}
          />
        ) : (
          <>
            <header className="flex items-center gap-3 px-4 pt-5">
              <h1 className="text-xl font-book">Fleet</h1>
              <span className="text-sm text-muted">{totalForHeader} robots</span>
              <Button variant="primary" size="sm" className="ml-auto" onClick={openRegister}>
                <Icon name="plus" size={14} /> Register Robot
              </Button>
            </header>

            <div className="px-4 pt-3">
              <SearchInput tone="surface" placeholder="Filter robots" value={query} onChange={setQuery} className="w-full" />
            </div>

            <div className="flex items-center gap-1 px-4 py-3" role="group" aria-label="Filter by status">
              <div
                ref={statusRailRef}
                className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button type="button" className={chipClass(statusFilter === null)} onClick={() => setStatusFilter(null)}>
                  All <span className="opacity-60">{countsQuery.data?.total ?? 0}</span>
                </button>
                {ROBOT_STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={chipClass(statusFilter === status)}
                    onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  >
                    <ToneDot tone={ROBOT_STATUS_TONE[status]} size="sm" />
                    {humanize(status)} <span className="opacity-60">{counts.get(status) ?? 0}</span>
                  </button>
                ))}
              </div>
              <IconButton tone="surface" size="sm" aria-label="Scroll statuses left" onClick={() => scrollStatuses(-1)}>
                <Icon name="chevronRight" size={14} className="rotate-180" />
              </IconButton>
              <IconButton tone="surface" size="sm" aria-label="Scroll statuses right" onClick={() => scrollStatuses(1)}>
                <Icon name="chevronRight" size={14} />
              </IconButton>
            </div>

            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-4 pt-1 pb-2">
              {isLoading ? (
                <li className="px-3 py-10 text-center text-sm text-muted">Loading robots…</li>
              ) : null}
              {error ? (
                <li className="px-3 py-10 text-center text-sm text-red-ink">
                  {(error as Error).message || 'Failed to load robots.'}
                </li>
              ) : null}
              {!isLoading && !error
                ? robots.map((robot) => (
                    <li key={robot.id}>
                      <button
                        type="button"
                        className={cx(
                          // Each Robot is its own white card, like a Request, so rows read as separate items on the grey panel.
                          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-md bg-surface px-4 py-3.5 text-left transition-shadow duration-200',
                          previewCode === robot.code ? 'ring-2 ring-blue' : 'hover:shadow-float',
                        )}
                        onClick={() => navigate(`/monitor/fleet/${robot.code}`)}
                      >
                        <span className="min-w-0">
                          <strong className="block font-medium">{robot.code}</strong>
                          <span className="block truncate text-xs text-muted">
                            {robot.name}
                            {' · '}
                            {robot.isOnline ? 'Online' : 'Offline'}
                            {!robot.isEnabled ? ' · Disabled' : ''}
                          </span>
                        </span>
                        <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
                          {robot.status}
                        </StatusBadge>
                        {robot.activity ? (
                          <>
                            <Meter percent={robot.activity.progressPercent} tone={ROBOT_STATUS_TONE[robot.status]} />
                            <span className="text-right text-xs text-muted tabular-nums">
                              {robot.activity.progressPercent}%
                            </span>
                          </>
                        ) : null}
                      </button>
                    </li>
                  ))
                : null}
              {!isLoading && !error && robots.length === 0 ? (
                <li className="flex flex-col items-center justify-center gap-4 px-4 py-12 text-center">
                  <Icon name="radio" size={28} className="text-muted" />
                  <div>
                    <p className="text-sm font-medium text-ink">There are currently no robots.</p>
                    <p className="mt-1 text-xs text-muted">
                      {query || statusFilter
                        ? 'Try a different code or status filter.'
                        : 'Add a robot to start monitoring the fleet.'}
                    </p>
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={openRegister}>
                    <Icon name="plus" size={14} /> Register Robot
                  </Button>
                </li>
              ) : null}
            </ul>

            <footer className="flex items-center justify-between px-4 py-3 text-xs text-muted">
              <span>{robots.length} shown</span>
            </footer>
          </>
        )}
      </aside>

      <div className="relative min-w-0 overflow-hidden rounded-lg bg-container">
        <FleetMap
          robots={robotsOnMap}
          selectedCode={robotCode ?? null}
          onSelect={(code) => navigate(`/monitor/fleet/${code}`)}
          variant={selected ? 'detail' : 'overview'}
          previewCode={previewCode}
          onPreview={setPreviewCode}
          endpoints={monitorMap.geometry.endpoints}
          edges={monitorMap.geometry.edges}
          zones={monitorMap.geometry.zones}
          bounds={monitorMap.geometry.bounds}
          occupancyImageUrl={monitorMap.geometry.occupancyImageUrl}
          mapVersion={monitorMap.version}
        />
        <MapVersionToolbar
          warehouses={monitorMap.warehouses}
          warehouseId={monitorMap.warehouseId}
          onWarehouseChange={monitorMap.setWarehouseId}
          maps={monitorMap.maps}
          mapVersionId={monitorMap.mapVersionId}
          onMapVersionChange={monitorMap.setMapVersionId}
          activeMapId={monitorMap.activeMapId}
        />
        {monitorMap.isLoading ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-5 rounded-full bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-float">
            Loading map…
          </div>
        ) : null}
        {monitorMap.error ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-5 max-w-sm rounded-md bg-surface/95 px-3 py-2 text-xs text-red-ink shadow-float">
            {monitorMap.error.message || 'Failed to load map version.'}
          </div>
        ) : null}
      </div>

      {registerOpen ? (
        <RegisterRobotDialog
          onClose={() => setRegisterOpen(false)}
          onRegistered={(code) => {
            setRegisterOpen(false)
            navigate(`/monitor/fleet/${code}`)
          }}
        />
      ) : null}
    </div>
  )
}
