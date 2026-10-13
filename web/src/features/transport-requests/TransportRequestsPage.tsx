import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TransportRequestStatus, TransportRequestView } from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import { REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatDuration, secondsBetween } from '@/shared/lib/format'
import { WarehouseMap, type MapCallout, type MapMovement, type MapRobot } from '@/shared/map/WarehouseMap'
import { findEndpointByName } from '@/shared/map/scene'
import { ROBOTS } from '../robots/mock'
import { REQUEST_STATUS_GROUPS } from './constants'
import { detailProgress, routeSummary } from './derive'
import { JobSummaryPanel } from './JobSummaryPanel'
import { RequestDetailPanel } from './RequestDetailPanel'
import { TRANSPORT_REQUESTS } from './mock'
import '../jobs/jobs.css'
import './transport-requests.css'

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

  return (
    <article className={`jcard rcard${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <header>
        <span className="jcard__no mono">{request.requestCode}</span>
        <span className={`badge badge--${REQUEST_STATUS_TONE[request.status]}`}>{request.status}</span>
      </header>
      <dl>
        <div>
          <dt>Route:</dt>
          <dd>{routeSummary(request)}</dd>
        </div>
        <div>
          <dt>Containers:</dt>
          <dd>
            <Icon name="box" size={12} /> {request.details.length}
          </dd>
        </div>
        <div>
          <dt>Jobs:</dt>
          <dd>{request.jobs.length === 0 ? '—' : request.jobs.length}</dd>
        </div>
      </dl>
      <div className="jcard__bar">
        <i style={{ width: `${progress.percent}%` }} />
      </div>
      <footer>
        <small>
          {progress.done}/{progress.total} done · {elapsed === null ? '—' : formatDuration(elapsed)}
        </small>
        {canCancel ? (
          <span onClick={(event) => event.stopPropagation()}>
            <button type="button" className="jcard__mini jcard__mini--danger">
              Cancel
            </button>
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
                `${request.requestCode} · ${job.status}`,
                `${job.jobNo} · ${job.robotCode} · ${robot.batteryPercent}%`,
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
    <div className="jobs">
      <aside className="jobs__panel">
        <header className="jobs__title">
          <h2>
            <Icon name="layers" size={14} /> TRANSPORT REQUESTS
          </h2>
          <span className="mono">Total: {TRANSPORT_REQUESTS.length}</span>
        </header>

        <div className="jobs__cta rcta">
          <button type="button" className="btn btn--primary">
            <Icon name="plus" size={14} /> New Request
          </button>
        </div>

        <div className="jobs__search">
          <label>
            <Icon name="search" size={14} />
            <input
              placeholder="Search REQ-YYYYMMDD-XXXXXX or container..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" aria-label="Filter">
            <Icon name="filter" size={14} />
          </button>
          <button type="button" aria-label="Sort">
            <Icon name="sort" size={14} />
          </button>
        </div>

        <div className="jobs__groups">
          {REQUEST_STATUS_GROUPS.map((status) => {
            const requests = grouped.get(status) ?? []
            const expanded = open.has(status)
            return (
              <section key={status} className={`jgroup jgroup--${REQUEST_STATUS_TONE[status]}`}>
                <button type="button" className="jgroup__head" onClick={() => toggle(status)}>
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
                  <span className="dot" />
                  <strong>{status}</strong>
                  <span className="jgroup__count">{requests.length}</span>
                </button>
                {expanded ? (
                  <div className="jgroup__body">
                    {requests.length === 0 ? <p className="jgroup__empty">No requests</p> : null}
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

      <section className="jobs__map">
        {selected ? (
          <div className={`rdrawers${collapsed ? ' is-collapsed' : ''}`}>
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
            <button
              type="button"
              className="rdrawers__handle"
              aria-label={collapsed ? 'Show panels' : 'Hide panels'}
              title={collapsed ? 'Show panels' : 'Hide panels'}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
        ) : null}
        <div className="jobs__mapfill">
          <WarehouseMap
            robots={mapRobots}
            layers={{ occupancy: true }}
            labels="focus"
            focusEndpointIds={mapView.focusEndpointIds}
            focusRobotCodes={mapView.focusRobotCodes}
            movements={mapView.movements}
            callouts={mapView.callouts}
          />
        </div>

        <footer className="jobs__legend">
          <button type="button" className="jobs__estop">
            <Icon name="bolt" size={12} /> Facility E-Stop
          </button>
        </footer>
      </section>
    </div>
  )
}
