import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TransportRequestStatus, TransportRequestView } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatDuration, secondsBetween, humanize } from '@/shared/lib/format'
import { WarehouseMap, type MapCallout, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { findEndpointByName } from '@/shared/map/scene'
import { ROBOTS } from '../robots/mock'
import { REQUEST_STATUS_GROUPS } from './constants'
import { detailProgress, routeSummary } from './derive'
import { JobSummaryPanel } from './JobSummaryPanel'
import { RequestDetailPanel } from './RequestDetailPanel'
import { TRANSPORT_REQUESTS } from './mock'

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
  const canCancel = request.availableActions.includes('CANCEL')
  const facts = [
    { label: 'Route', value: routeSummary(request) },
    { label: 'Containers', value: request.details.length },
    { label: 'Jobs', value: request.jobs.length === 0 ? '—' : request.jobs.length },
  ]

  return (
    <article
      className={cx(
        'cursor-pointer rounded-md bg-surface p-4 transition-shadow duration-200',
        selected ? 'ring-2 ring-ink' : 'hover:shadow-float',
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
        <span className="text-xs text-muted">
          {progress.done} of {progress.total} delivered{elapsed === null ? '' : `, ${formatDuration(elapsed)}`}
        </span>
        {canCancel ? (
          <span onClick={(event) => event.stopPropagation()}>
            <Button variant="danger" size="sm">
              Cancel
            </Button>
          </span>
        ) : null}
      </footer>
    </article>
  )
}

export function TransportRequestsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<TransportRequestStatus>>(new Set(['IN_PROGRESS']))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedJobNo, setSelectedJobNo] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const selected = TRANSPORT_REQUESTS.find((request) => request.id === selectedId) ?? null
  const selectedJob = selected?.jobs.find((job) => job.jobNo === selectedJobNo) ?? null

  function selectRequest(id: string) {
    // Picking the open request again closes it; picking another one resets the Job column.
    setSelectedId(selectedId === id ? null : id)
    setSelectedJobNo(null)
    setCollapsed(false)
  }

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<TransportRequestStatus, TransportRequestView[]>()
    REQUEST_STATUS_GROUPS.forEach((status) => map.set(status, []))
    TRANSPORT_REQUESTS.filter(
      (request) =>
        request.requestCode.toLowerCase().includes(needle) ||
        request.details.some((detail) => detail.containerBarcode.toLowerCase().includes(needle)),
    ).forEach((request) => map.get(request.status)?.push(request))
    return map
  }, [query])

  const mapRobots = useMemo<MapRobot[]>(
    () =>
      ROBOTS.map((robot) => ({
        code: robot.code,
        status: robot.status,
        x: robot.poseX,
        y: robot.poseY,
        yaw: robot.poseYaw,
        alert: robot.status === 'ERROR',
      })),
    [],
  )

  // What the map shows depends on what is selected: nothing -> every running Job; a Request -> its movement plan
  // (pick up -> drop off per Container) and the Robots of its Jobs; a Job -> only that Robot.
  const mapView = useMemo(() => {
    const requests = selected ? [selected] : TRANSPORT_REQUESTS
    const callouts: MapCallout[] = requests.flatMap((request) =>
      request.jobs
        .filter((job) => job.robotCode && (selected || job.status === 'RUNNING' || job.status === 'RECOVERY_REQUIRED'))
        .flatMap((job) => {
          const robot = ROBOTS.find((item) => item.code === job.robotCode)
          if (!robot) return []
          return [
            {
              x: robot.poseX,
              y: robot.poseY,
              tone: job.status === 'RECOVERY_REQUIRED' ? ('danger' as const) : ('dark' as const),
              lines: [
                `${request.requestCode}: ${humanize(job.status).toLowerCase()}`,
                `${job.jobNo}, ${job.robotCode}, ${robot.batteryPercent}% battery`,
              ],
            },
          ]
        }),
    )

    const movements: MapMovement[] = []
    const focusEndpointIds: string[] = []
    if (selected) {
      selected.details.forEach((detail) => {
        const from = findEndpointByName(detail.sourceLabel)
        const to = findEndpointByName(detail.destinationLabel)
        if (!from || !to) return
        movements.push({ from, to, sequence: detail.sequenceNo })
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
  }, [selected, selectedJob])

  function toggle(status: TransportRequestStatus) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  return (
    <div className="grid h-full grid-cols-[400px_minmax(0,1fr)] gap-3 px-3 pb-3">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container">
        <header className="flex items-center gap-3 px-5 pt-5">
          <h1 className="text-xl font-book whitespace-nowrap">Transport requests</h1>
          <span className="text-sm text-muted">{TRANSPORT_REQUESTS.length}</span>
          <Button variant="primary" size="sm" className="ml-auto">
            <Icon name="plus" size={14} /> New request
          </Button>
        </header>

        <div className="mt-3 mb-3 flex h-9 items-center gap-1.5 px-4">
          <SearchInput
            tone="surface"
            className="h-9 min-w-0 flex-1"
            placeholder="Search request code or container"
            value={query}
            onChange={setQuery}
          />
          <IconButton tone="surface" className="size-9 shrink-0" aria-label="Filter">
            <Icon name="filter" size={15} />
          </IconButton>
          <IconButton tone="surface" className="size-9 shrink-0" aria-label="Sort">
            <Icon name="sort" size={15} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {REQUEST_STATUS_GROUPS.map((status) => {
            const requests = grouped.get(status) ?? []
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
                  <span className="text-xs text-muted tabular-nums">{requests.length}</span>
                </button>
                {expanded ? (
                  <div className="flex flex-col gap-2 px-2 pt-1 pb-3">
                    {requests.length === 0 ? <p className="px-2 py-2 text-xs text-muted">No requests</p> : null}
                    {requests.map((request) => (
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

      <section className="relative min-w-0 overflow-hidden rounded-lg bg-container">
        <WarehouseMap
          robots={mapRobots}
          layers={{ occupancy: true }}
          labels="focus"
          focusEndpointIds={mapView.focusEndpointIds}
          focusRobotCodes={mapView.focusRobotCodes}
          movements={mapView.movements}
          callouts={mapView.callouts}
        />

        {selected ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex gap-3 p-3">
            {collapsed ? null : (
              <>
                <RequestDetailPanel
                  request={selected}
                  selectedJobNo={selectedJobNo}
                  onSelectJob={(jobNo) => setSelectedJobNo(jobNo === selectedJobNo ? null : jobNo)}
                  onClose={() => selectRequest(selected.id)}
                />
                {selectedJob ? (
                  <JobSummaryPanel
                    jobRef={selectedJob}
                    onClose={() => setSelectedJobNo(null)}
                    onOpenFull={() => navigate(`/monitor/jobs/${selectedJob.jobNo}`)}
                  />
                ) : null}
              </>
            )}
            <button
              type="button"
              className="pointer-events-auto grid h-14 w-7 place-items-center self-center rounded-full bg-surface text-ink-2 shadow-float transition-colors duration-200 hover:text-ink"
              aria-label={collapsed ? 'Show panels' : 'Hide panels'}
              title={collapsed ? 'Show panels' : 'Hide panels'}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Icon name="chevronRight" size={14} className={collapsed ? undefined : 'rotate-180'} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="absolute top-3 right-3 z-5 inline-flex h-9 items-center gap-2 rounded-full bg-red px-4 text-sm font-medium text-white shadow-float transition-colors duration-200 hover:bg-red-ink"
        >
          <Icon name="bolt" size={15} /> Facility E-stop
        </button>
      </section>
    </div>
  )
}
