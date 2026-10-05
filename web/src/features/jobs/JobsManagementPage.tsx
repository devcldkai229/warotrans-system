import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JobStatus, JobView } from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import { JOB_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatCoordinate, formatDuration } from '@/shared/lib/format'
import { JobsMapScene } from './JobsMapScene'
import { JOB_STATUS_GROUPS } from './constants'
import { elapsedSeconds, stepProgress } from './derive'
import { JOBS, JOBS_MAP } from './mock'
import './jobs.css'

function JobCard({ job, onOpen }: { job: JobView; onOpen: () => void }) {
  const elapsed = elapsedSeconds(job)
  const canPause = job.availableActions.includes('PAUSE')
  const canCancel = job.availableActions.includes('CANCEL')

  return (
    <article className="jcard" onClick={onOpen}>
      <header>
        <span className="jcard__no mono">{job.jobNo}</span>
        <span className={`badge badge--${JOB_STATUS_TONE[job.status]}`}>{job.status}</span>
      </header>
      <dl>
        <div>
          <dt>Robot:</dt>
          <dd>
            <Icon name="box" size={12} /> {job.assignedRobot?.code ?? 'Unassigned'}
          </dd>
        </div>
        <div>
          <dt>Path:</dt>
          <dd>{job.routeLabel ?? '—'}</dd>
        </div>
      </dl>
      <div className="jcard__bar">
        <i style={{ width: `${stepProgress(job).percent}%` }} />
      </div>
      <footer>
        <small>Elapsed: {elapsed === null ? '—' : formatDuration(elapsed)}</small>
        {canPause || canCancel ? (
          <span onClick={(event) => event.stopPropagation()}>
            {canPause ? (
              <button type="button" className="jcard__mini">Pause</button>
            ) : null}
            {canCancel ? (
              <button type="button" className="jcard__mini jcard__mini--danger">Cancel</button>
            ) : null}
          </span>
        ) : null}
      </footer>
    </article>
  )
}

export function JobsManagementPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<JobStatus>>(new Set(['RUNNING']))

  const grouped = useMemo(() => {
    const map = new Map<JobStatus, JobView[]>()
    JOB_STATUS_GROUPS.forEach((status) => map.set(status, []))
    JOBS.filter((job) => job.jobNo.toLowerCase().includes(query.toLowerCase())).forEach((job) =>
      map.get(job.status)?.push(job),
    )
    return map
  }, [query])

  function toggle(status: JobStatus) {
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
            <Icon name="layers" size={14} /> JOBS MANAGEMENT
          </h2>
          <span className="mono">Total: {JOBS.length}</span>
        </header>

        <div className="jobs__cta">
          <button type="button" className="btn btn--primary">
            <Icon name="plus" size={14} /> New Job
          </button>
          <button type="button" className="btn">
            <Icon name="history" size={14} /> History
          </button>
        </div>

        <div className="jobs__search">
          <label>
            <Icon name="search" size={14} />
            <input
              placeholder="Search JOB-YYYYMMDD-XXXX..."
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
          {JOB_STATUS_GROUPS.map((status) => {
            const jobs = grouped.get(status) ?? []
            const expanded = open.has(status)
            return (
              <section key={status} className={`jgroup jgroup--${JOB_STATUS_TONE[status]}`}>
                <button type="button" className="jgroup__head" onClick={() => toggle(status)}>
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
                  <span className="dot" />
                  <strong>{status}</strong>
                  <span className="jgroup__count">{jobs.length}</span>
                </button>
                {expanded ? (
                  <div className="jgroup__body">
                    {jobs.length === 0 ? <p className="jgroup__empty">No jobs</p> : null}
                    {jobs.map((job) => (
                      <JobCard key={job.id} job={job} onOpen={() => navigate(`/monitor/jobs/${job.jobNo}`)} />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>

        <footer className="jobs__foot">
          <span>
            Scheduler: <strong>{JOBS_MAP.scheduler}</strong>
          </span>
          <a href="#batch" onClick={(event) => event.preventDefault()}>
            Batch Actions
          </a>
        </footer>
      </aside>

      <section className="jobs__map">
        <div className="jobs__coords mono">
          <Icon name="target" size={12} />
          <span>X: {formatCoordinate(JOBS_MAP.coordinates.x)}</span>
          <span>Y: {formatCoordinate(JOBS_MAP.coordinates.y)}</span>
          <span className="jobs__live">
            <span className="dot" /> {JOBS_MAP.mapLabel}
          </span>
        </div>
        <div className="jobs__layers">
          <button type="button" aria-label="Routes">
            <Icon name="route" size={14} />
          </button>
          <button type="button" aria-label="Robots">
            <Icon name="box" size={14} />
          </button>
          <button type="button" aria-label="Alerts">
            <Icon name="info" size={14} />
          </button>
          <button type="button" aria-label="Battery">
            <Icon name="battery" size={14} />
          </button>
        </div>
        <div className="jobs__zoom">
          <button type="button" aria-label="Zoom in">
            <Icon name="plus" size={14} />
          </button>
          <button type="button" aria-label="Zoom out">
            <Icon name="minus" size={14} />
          </button>
          <hr />
          <button type="button" aria-label="Center">
            <Icon name="crosshair" size={14} />
          </button>
          <button type="button" aria-label="3D view">
            <Icon name="box" size={14} />
          </button>
          <button type="button" aria-label="Map settings">
            <Icon name="sliders" size={14} />
          </button>
        </div>

        <JobsMapScene jobs={JOBS} />

        <footer className="jobs__legend">
          <strong>MAP LEGEND:</strong>
          <span><i className="lg lg--blue" /> Dynamic Highway</span>
          <span><i className="lg lg--amber" /> Interlocking Node</span>
          <span><i className="lg lg--green" /> Robot Online</span>
          <span><i className="lg lg--orange" /> Yielding / Interlock</span>
          <span className="jobs__keys">
            <kbd>Space</kbd> Pan Map <kbd>R</kbd> Reset View
          </span>
          <button type="button" className="jobs__estop">
            <Icon name="bolt" size={12} /> Facility E-Stop
          </button>
        </footer>
      </section>
    </div>
  )
}
