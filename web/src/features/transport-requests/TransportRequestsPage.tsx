import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { Can } from '@/features/auth/RequirePermission'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import type { JobStatus, TransportRequestStatus, TransportRequestView } from '@/shared/api/contracts'
import { listRobots } from '@/shared/api/fleet'
import { listJobs, resumeJob, startJob, type JobSummaryDto } from '@/shared/api/jobs'
import { getTransportRequest, listTransportRequests } from '@/shared/api/transportRequests'
import { getActiveMapVersion } from '@/shared/api/navigation'
import { getStockVoucher } from '@/shared/api/warehouses'
import { listWorkflows } from '@/shared/api/workflows'
import { cx } from '@/shared/lib/cx'
import { MapVersionToolbar } from '@/shared/map/MapVersionToolbar'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { useNotificationsHub } from '@/shared/realtime/useNotificationsHub'
import { WarehouseMap, type MapCallout, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { Button, IconButton } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatDuration, secondsBetween, humanize } from '@/shared/lib/format'
import {
  TransportRequestComposer,
  type ComposerMapState,
} from './composer/TransportRequestComposer'
import { voucherPrefill, type ComposerPrefill } from './composer/voucherPrefill'
import { REQUEST_STATUS_GROUPS } from './constants'
import { detailProgress, routeSummary } from './derive'
import { JobSummaryPanel } from './JobSummaryPanel'
import { detailToView, listItemToView } from './mapTransportRequest'
import { RequestCloseActions } from './RequestCloseActions'
import { RequestDetailPanel } from './RequestDetailPanel'
import { queueAndStart, runAgain } from './runOnRobot'
import { t } from '@/shared/i18n'
function RequestCard({

  request,
  selected,
  onSelect,
}: {
  request: TransportRequestView
  selected: boolean
  onSelect: () => void
}) {
  const progress = detailProgress(request)
  const elapsed = secondsBetween(request.submittedAt, request.completedAt)
  const facts = [
    { label: t('Route'), value: routeSummary(request) },
    { label: t('Containers'), value: request.details.length },
    { label: t('Jobs'), value: request.jobs.length === 0 ? '—' : request.jobs.length },
  ]

  return (
    <article
      className={cx(
        'cursor-pointer rounded-md bg-surface p-4 transition-shadow duration-200',
        selected ? 'ring-2 ring-blue' : 'hover:shadow-float',
      )}
      onClick={onSelect}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{request.requestCode}</span>
        <StatusBadge tone={REQUEST_STATUS_TONE[request.status]}>{request.status}</StatusBadge>
      </header>
      <dl className="mt-3 flex flex-col gap-1 text-xs">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4">
            <dt className="text-muted">{fact.label}</dt>
            <dd className="truncate">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <Meter percent={progress.percent} tone="blue" className="mt-3" />
      <footer className="mt-3 flex min-h-8 items-center justify-between gap-2">
        <span className="text-xs text-muted">{t('{done} of {total} delivered', { done: progress.done, total: progress.total })}{elapsed === null ? '' : `, ${formatDuration(elapsed)}`}
        </span>
        <RequestCloseActions request={request} />
      </footer>
    </article>
  )
}

const TERMINAL_REQUEST_STATUSES: TransportRequestStatus[] = ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED']
const TERMINAL_JOB_STATUSES: JobStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED']

/**
 * Run a request on a robot: SUBMITTED → queue (plan Jobs) → start the Job (backend picks the best free
 * robot on the request's map) → open the live view, where the robot moves in step with Gazebo / the
 * real robot and staff confirm each pickup / drop-off.
 */
function RunControls({ request, jobs }: { request: TransportRequestView; jobs: JobSummaryDto[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transport-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    ])

  const run = useMutation({
    mutationFn: () => queueAndStart(request.id),
    onSuccess: async (jobId) => {
      setError(null)
      await refresh()
      navigate(`/monitor/jobs/${jobId}`)
    },
    onError: async (err: Error) => {
      setError(err.message)
      await refresh()
    },
  })

  const again = useMutation({
    mutationFn: () => runAgain(request.id),
    onSuccess: async ({ jobId }) => {
      setError(null)
      await refresh()
      navigate(`/monitor/jobs/${jobId}`)
    },
    onError: async (err: Error) => {
      setError(err.message)
      await refresh()
    },
  })

  const start = useMutation({
    mutationFn: (jobId: string) => startJob(jobId).then(() => jobId),
    onSuccess: async (jobId) => {
      setError(null)
      await refresh()
      navigate(`/monitor/jobs/${jobId}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  const resume = useMutation({
    mutationFn: (jobId: string) => resumeJob(jobId).then(() => jobId),
    onSuccess: async (jobId) => {
      setError(null)
      await refresh()
      navigate(`/monitor/jobs/${jobId}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  const busy = run.isPending || start.isPending || again.isPending || resume.isPending
  // Starting, resuming and replaying a Job is job.operate (Staff and Admin); a Technician only looks.
  const mayOperate = useAuth().can(PERMISSIONS.jobOperate)
  // A Job stopped half-way (robot offline) keeps its containers: resume it, do not replay the request.
  const jobOpen = jobs.some((job) => !TERMINAL_JOB_STATUSES.includes(job.status))
  const finished = TERMINAL_REQUEST_STATUSES.includes(request.status) && request.status !== 'CANCELLED' && !jobOpen
  return (
    <>
      {finished && mayOperate ? (
        <Button variant="primary" size="sm" disabled={busy} onClick={() => again.mutate()}>
          <Icon name="refresh" size={14} /> {again.isPending ? t('Starting…') : t('Run again on robot')}
        </Button>
      ) : null}
      {request.status === 'SUBMITTED' && jobs.length === 0 && mayOperate ? (
        <Button variant="primary" size="sm" disabled={busy} onClick={() => run.mutate()}>
          <Icon name="bolt" size={14} /> {run.isPending ? t('Starting…') : t('Run on robot')}
        </Button>
      ) : null}
      {jobs.map((job) =>
        job.status === 'CREATED' && mayOperate ? (
          <Button key={job.id} variant="primary" size="sm" disabled={busy} onClick={() => start.mutate(job.id)}>
            <Icon name="bolt" size={14} /> {start.isPending ? t('Starting…') : t('Start {jobNo} on robot', { jobNo: job.jobNo })}
          </Button>
        ) : (job.status === 'PAUSED' || job.status === 'REASSIGNING') && mayOperate ? (
          <Button key={job.id} variant="primary" size="sm" disabled={busy} onClick={() => resume.mutate(job.id)}>
            <Icon name="play" size={14} /> {resume.isPending ? t('Resuming…') : t('Resume {jobNo} on robot', { jobNo: job.jobNo })}
          </Button>
        ) : (
          <Button key={job.id} variant="outline" size="sm" onClick={() => navigate(`/monitor/jobs/${job.id}`)}>
            <Icon name="target" size={14} /> {t('View {jobNo}', { jobNo: job.jobNo })}</Button>
        ),
      )}
      {request.status === 'SUBMITTED' && jobs.length === 0 && mayOperate ? (
        <p className="text-xs text-muted">{t('Plans the route, starts the best free robot on this map and opens the live view.')}</p>
      ) : null}
      {error ? <p className="text-xs text-red-ink">{error}</p> : null}
    </>
  )
}

export function TransportRequestsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<TransportRequestStatus>>(new Set(['SUBMITTED', 'IN_PROGRESS']))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedJobNo, setSelectedJobNo] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [composing, setComposing] = useState(false)
  const [composerMap, setComposerMap] = useState<ComposerMapState | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<ComposerPrefill | null>(null)

  // "Dispatch robots" on a stock voucher lands here with ?voucher=<id>: open the composer filled with its Containers,
  // on the warehouse's published map. The parameter is dropped when the composer closes.
  const [searchParams, setSearchParams] = useSearchParams()
  const voucherId = searchParams.get('voucher')
  // A notification about a request lands here with ?requestId=<id>: open that request. The parameter stays in the
  // address, so the link can be shared and a reload reopens the same request; picking another request still works.
  const linkedRequestId = searchParams.get('requestId')
  const [openedRequestId, setOpenedRequestId] = useState<string | null>(null)
  if (linkedRequestId && openedRequestId !== linkedRequestId) {
    setOpenedRequestId(linkedRequestId)
    setSelectedId(linkedRequestId)
    setSelectedJobNo(null)
    setCollapsed(false)
  }
  const [openedVoucherId, setOpenedVoucherId] = useState<string | null>(null)
  const voucherPrefillQuery = useQuery({
    queryKey: ['transport-requests', 'voucher-prefill', voucherId],
    queryFn: async () => {
      const voucher = await getStockVoucher(voucherId!)
      const map = await getActiveMapVersion(voucher.warehouseId)
      return voucherPrefill(voucher, map?.id ?? '')
    },
    enabled: Boolean(voucherId),
    staleTime: 0,
    gcTime: 0,
  })
  if (voucherId && voucherPrefillQuery.data && openedVoucherId !== voucherId) {
    setOpenedVoucherId(voucherId)
    setPrefill(voucherPrefillQuery.data)
    setSelectedId(null)
    setSelectedJobNo(null)
    setComposing(true)
    setBanner(null)
  }

  const listQuery = useQuery({
    queryKey: ['transport-requests', 'list', query],
    queryFn: () => listTransportRequests({ search: query.trim() || undefined, take: 100 }),
  })

  // RTM-02: a pushed change only says "this request moved"; the data always comes from the API. After a reconnect
  // everything is refetched, so events missed while offline cannot leave the page stale.
  const queryClient = useQueryClient()
  const onRequestUpdated = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['transport-requests'] }),
    [queryClient],
  )
  const hubConnected = useNotificationsHub({ transportRequestUpdated: onRequestUpdated })
  useEffect(() => {
    if (hubConnected) onRequestUpdated()
  }, [hubConnected, onRequestUpdated])

  const workflowsQuery = useQuery({
    queryKey: ['workflows', 'published'],
    queryFn: () => listWorkflows({ status: 'PUBLISHED' }),
  })

  const workflowNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of workflowsQuery.data?.items ?? []) {
      map.set(item.id, item.name)
    }
    return map
  }, [workflowsQuery.data])

  const requests = useMemo(
    () => (listQuery.data?.items ?? []).map((item) => listItemToView(item, workflowNameById)),
    [listQuery.data, workflowNameById],
  )

  const detailQuery = useQuery({
    queryKey: ['transport-requests', 'detail', selectedId],
    queryFn: () => getTransportRequest(selectedId!),
    enabled: Boolean(selectedId) && !composing,
    // Keep progress moving while the robot runs; stop polling once the request is finished.
    refetchInterval: (q) => {
      // A request that does not exist (a stale link) will not appear by asking again every 3 seconds.
      if (q.state.error instanceof ApiError && q.state.error.status === 404) return false
      return q.state.data && TERMINAL_REQUEST_STATUSES.includes(q.state.data.status as TransportRequestStatus) ? false : 3000
    },
  })
  // A link (a notification) to a request that is gone or not visible to this person: say so instead of showing nothing.
  const linkedRequestMissing =
    Boolean(linkedRequestId) && selectedId === linkedRequestId && detailQuery.error instanceof ApiError && detailQuery.error.status === 404

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'by-request', selectedId],
    queryFn: () => listJobs({ transportRequestId: selectedId!, take: 20 }),
    enabled: Boolean(selectedId) && !composing,
    refetchInterval: 3000,
  })
  const requestJobs = useMemo(() => jobsQuery.data?.items ?? [], [jobsQuery.data])

  const selectedBase = useMemo(() => {
    if (!selectedId) return null
    if (detailQuery.data?.id === selectedId) {
      return detailToView(detailQuery.data, workflowNameById)
    }
    return requests.find((request) => request.id === selectedId) ?? null
  }, [selectedId, detailQuery.data, requests, workflowNameById])

  const preferredWarehouseId = selectedBase?.warehouseId ?? null
  const preferredMapVersionId =
    (selectedBase && detailQuery.data?.id === selectedBase.id
      ? detailQuery.data.mapVersionId
      : null) ?? null

  const monitorMap = useMonitorMapVersion({
    preferredWarehouseId,
    preferredMapVersionId,
    enabled: !composing,
  })

  const robotsQuery = useQuery({
    queryKey: ['fleet', 'robots', monitorMap.warehouseId || selectedBase?.warehouseId],
    queryFn: () =>
      listRobots({
        warehouseId: monitorMap.warehouseId || selectedBase?.warehouseId,
        take: 100,
      }),
    enabled: !composing,
  })

  // The selected request with its real Jobs (robot code resolved from the fleet list).
  const selected = useMemo(() => {
    if (!selectedBase) return null
    const robotCodeById = new Map((robotsQuery.data?.items ?? []).map((robot) => [robot.id, robot.code]))
    return {
      ...selectedBase,
      jobs: requestJobs.map((job) => ({
        jobNo: job.jobNo,
        status: job.status,
        robotCode: job.robotCode ?? (job.assignedRobotId ? robotCodeById.get(job.assignedRobotId) ?? null : null),
      })),
    }
  }, [selectedBase, requestJobs, robotsQuery.data])

  const selectedJob = selected?.jobs.find((job) => job.jobNo === selectedJobNo) ?? null
  // The request view only carries job numbers; the detail page is addressed by the job's id.
  const selectedJobId = requestJobs.find((job) => job.jobNo === selectedJobNo)?.id ?? null

  function selectRequest(id: string) {
    setSelectedId(selectedId === id ? null : id)
    setSelectedJobNo(null)
    setCollapsed(false)
  }

  const grouped = useMemo(() => {
    const map = new Map<TransportRequestStatus, TransportRequestView[]>()
    REQUEST_STATUS_GROUPS.forEach((status) => map.set(status, []))
    requests.forEach((request) => map.get(request.status)?.push(request))
    return map
  }, [requests])

  const mapEndpoints = monitorMap.geometry.endpoints
  const mapBounds = monitorMap.geometry.bounds

  const endpointById = useMemo(
    () => new Map(mapEndpoints.map((endpoint) => [endpoint.id, endpoint])),
    [mapEndpoints],
  )

  const mapRobots = useMemo<MapRobot[]>(
    () =>
      (robotsQuery.data?.items ?? []).map((robot) => ({
        code: robot.code,
        status: robot.status,
        x: robot.poseX,
        y: robot.poseY,
        yaw: robot.poseYaw,
        alert: robot.status === 'ERROR',
      })),
    [robotsQuery.data],
  )

  const listMapView = useMemo(() => {
    const callouts: MapCallout[] = []
    const movements: MapMovement[] = []
    const focusEndpointIds: string[] = []

    if (selected) {
      selected.details.forEach((detail) => {
        const from = endpointById.get(detail.sourceEndpointId)
        const to = endpointById.get(detail.destinationEndpointId)
        if (!from || !to) return
        movements.push({
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          sequence: detail.sequenceNo,
        })
        focusEndpointIds.push(from.id, to.id)
      })
    }

    const robotCodes = selectedJob
      ? [selectedJob.robotCode]
      : selected
        ? selected.jobs.map((job) => job.robotCode)
        : null
    const focusRobotCodes = robotCodes ? robotCodes.filter((code): code is string => Boolean(code)) : undefined
    return { callouts, movements, focusEndpointIds, focusRobotCodes }
  }, [selected, selectedJob, endpointById])

  const handleComposerMapState = useCallback((state: ComposerMapState) => {
    setComposerMap(state)
  }, [])

  function startCompose() {
    setSelectedId(null)
    setSelectedJobNo(null)
    setPrefill(null)
    setComposing(true)
    setBanner(null)
  }

  function endCompose() {
    setComposing(false)
    setComposerMap(null)
    setPrefill(null)
    if (voucherId) setSearchParams({}, { replace: true })
  }

  function toggle(status: TransportRequestStatus) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const gridClass = composing
    ? composerMap?.panel2Open
      ? 'grid h-full grid-cols-[minmax(320px,360px)_minmax(430px,500px)_minmax(0,1fr)] gap-3 px-3 pb-3'
      : 'grid h-full grid-cols-[minmax(320px,360px)_minmax(0,1fr)] gap-3 px-3 pb-3'
    : 'grid h-full grid-cols-[400px_minmax(0,1fr)] gap-3 px-3 pb-3'

  const mapFocus = composing && composerMap ? composerMap.focusEndpointIds : listMapView.focusEndpointIds
  const mapMovements = composing && composerMap ? composerMap.movements : listMapView.movements
  const mapCallouts = composing && composerMap ? composerMap.callouts : listMapView.callouts

  return (
    <div className={cx(gridClass, 'relative')}>
      {composing ? (
        <TransportRequestComposer
          onClose={endCompose}
          onSubmitted={({ id, requestCode }) => {
            setBanner(t('Created {requestCode}', { requestCode }))
            endCompose()
            setSelectedId(id)
            setOpen((current) => new Set(current).add('SUBMITTED'))
          }}
          onMapState={handleComposerMapState}
          onBanner={setBanner}
          prefill={prefill}
        />
      ) : (
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container">
          <header className="flex items-center gap-3 px-5 pt-5">
            <h1 className="text-xl font-book whitespace-nowrap">{t('Transport requests')}</h1>
            <span className="text-sm text-muted">{listQuery.data?.total ?? requests.length}</span>
            <Can permission={PERMISSIONS.transportCreate}>
              <Button variant="primary" size="sm" className="ml-auto" onClick={startCompose}>
                <Icon name="plus" size={14} /> {t('New request')}</Button>
            </Can>
          </header>

          <div className="mt-3 mb-3 flex h-9 items-center gap-1.5 px-4">
            <SearchInput
              tone="surface"
              className="h-9 min-w-0 flex-1"
              placeholder={t('Search request code or container')}
              value={query}
              onChange={setQuery}
            />
            <IconButton tone="surface" className="size-9 shrink-0" aria-label={t('Filter')}>
              <Icon name="filter" size={15} />
            </IconButton>
            <IconButton tone="surface" className="size-9 shrink-0" aria-label={t('Sort')}>
              <Icon name="sort" size={15} />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {listQuery.isLoading ? (
              <p className="px-3 py-4 text-xs text-muted">{t('Loading transport requests…')}</p>
            ) : null}
            {listQuery.error ? (
              <p className="px-3 py-4 text-xs text-red-ink">
                {(listQuery.error as Error).message || t('Failed to load transport requests.')}
              </p>
            ) : null}
            {!listQuery.isLoading && !listQuery.error && requests.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">{t('No transport requests yet. Create one to get started.')}</p>
            ) : null}
            {REQUEST_STATUS_GROUPS.map((status) => {
              const group = grouped.get(status) ?? []
              const expanded = open.has(status)
              return (
                <section key={status}>
                  <button
                    type="button"
                    className="flex h-10 w-full items-center gap-2.5 rounded-full px-3 text-left text-sm transition-colors duration-200 hover:bg-surface"
                    aria-expanded={expanded}
                    onClick={() => toggle(status)}
                  >
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
                    <ToneDot tone={REQUEST_STATUS_TONE[status]} />
                    <span className="flex-1 font-medium">{humanize(status)}</span>
                    <span className="text-xs text-muted tabular-nums">{group.length}</span>
                  </button>
                  {expanded ? (
                    <div className="flex flex-col gap-2 px-2 pt-1 pb-3">
                      {group.length === 0 ? <p className="px-2 py-2 text-xs text-muted">{t('No requests')}</p> : null}
                      {group.map((request) => (
                        <RequestCard
                          key={request.id}
                          request={request}
                          selected={request.id === selectedId}
                          onSelect={() => selectRequest(request.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </aside>
      )}

      <section className="relative min-w-0 overflow-hidden rounded-lg bg-container">
        <WarehouseMap
          yawUnit="rad"
          zones={composing ? composerMap?.zones ?? [] : monitorMap.geometry.zones}
          edges={composing ? composerMap?.edges ?? [] : monitorMap.geometry.edges}
          endpoints={composing ? composerMap?.endpoints ?? [] : mapEndpoints}
          bounds={composing ? composerMap?.bounds : mapBounds}
          occupancyImageUrl={
            composing ? composerMap?.occupancyImageUrl ?? null : monitorMap.geometry.occupancyImageUrl
          }
          robots={composing ? [] : mapRobots}
          layers={{ occupancy: true }}
          labels="all"
          focusEndpointIds={mapFocus}
          focusRobotCodes={composing ? undefined : listMapView.focusRobotCodes}
          movements={mapMovements}
          callouts={mapCallouts}
          uiInset={composing ? composerMap?.uiInset : undefined}
          onEndpointClick={composing ? composerMap?.onEndpointClick : undefined}
        />

        {!composing ? (
          <MapVersionToolbar
            warehouses={monitorMap.warehouses}
            warehouseId={monitorMap.warehouseId}
            onWarehouseChange={monitorMap.setWarehouseId}
            maps={monitorMap.maps}
            mapVersionId={monitorMap.mapVersionId}
            onMapVersionChange={monitorMap.setMapVersionId}
            activeMapId={monitorMap.activeMapId}
          />
        ) : null}

        {composing ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-sm rounded-md bg-surface/95 px-3 py-2 text-[11px] text-muted shadow-float">{t('Preview only — final robot route is planned after submission.')}{composerMap?.pickHint ? (
              <p className="mt-1 font-medium text-ink">{composerMap.pickHint}</p>
            ) : null}
          </div>
        ) : null}

        {!composing && selected ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex gap-3 p-3">
            {collapsed ? null : (
              <>
                <RequestDetailPanel
                  request={selected}
                  selectedJobNo={selectedJobNo}
                  onSelectJob={(jobNo) => setSelectedJobNo(jobNo === selectedJobNo ? null : jobNo)}
                  onClose={() => selectRequest(selected.id)}
                  actions={<RunControls request={selected} jobs={requestJobs} />}
                />
                {selectedJob ? (
                  <JobSummaryPanel
                    jobRef={selectedJob}
                    jobId={selectedJobId}
                    containerBarcodes={new Map(selected.details.map((detail) => [detail.containerId, detail.containerBarcode]))}
                    onClose={() => setSelectedJobNo(null)}
                    onOpenFull={selectedJobId ? () => navigate(`/monitor/jobs/${selectedJobId}`) : undefined}
                  />
                ) : null}
              </>
            )}
            <button
              type="button"
              className="pointer-events-auto grid h-14 w-7 place-items-center self-center rounded-full bg-surface text-ink-2 shadow-float transition-colors duration-200 hover:text-ink"
              aria-label={collapsed ? t('Show panels') : t('Hide panels')}
              title={collapsed ? t('Show panels') : t('Hide panels')}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Icon name={collapsed ? 'chevronRight' : 'chevronRight'} size={14} className={collapsed ? undefined : 'rotate-180'} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="absolute top-3 right-3 z-5 inline-flex h-9 items-center gap-2 rounded-full bg-red px-4 text-sm font-medium text-white shadow-float transition-colors duration-200 hover:bg-red-ink"
        >
          <Icon name="bolt" size={15} /> {t('Facility E-stop')}</button>
      </section>

      {banner ? (
        <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-container-high px-4 py-2 text-xs text-ink shadow-float">
          {banner}
        </div>
      ) : null}

      {linkedRequestMissing ? (
        // Bottom centre: the top centre is the map toolbar.
        <div
          role="status"
          className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-container-high px-4 py-2 text-xs text-ink shadow-float"
        >{t('That transport request was not found. It may have been removed, or you may not have access to it.')}</div>
      ) : null}
    </div>
  )
}
