import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { RobotStatus } from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { FleetMap } from './FleetMap'
import { RobotDetailPanel } from './RobotDetailPanel'
import { ROBOT_STATUS_ORDER } from './constants'
import { ROBOTS } from './mock'
import './robots.css'

export function FleetPage() {
  const { robotCode } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [previewCode, setPreviewCode] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<RobotStatus | null>(null)

  const counts = useMemo(() => {
    const map = new Map<RobotStatus, number>()
    ROBOT_STATUS_ORDER.forEach((status) => map.set(status, 0))
    ROBOTS.forEach((robot) => map.set(robot.status, (map.get(robot.status) ?? 0) + 1))
    return map
  }, [])

  const visibleRobots = ROBOTS.filter(
    (robot) =>
      robot.code.toLowerCase().includes(query.toLowerCase()) &&
      (statusFilter === null || robot.status === statusFilter),
  )
  const selected = ROBOTS.find((robot) => robot.code === robotCode) ?? null

  return (
    <div className={`fleet${selected ? ' fleet--detail' : ''}`}>
      <aside className="fleet__panel">
        {selected ? (
          <RobotDetailPanel robot={selected} onBack={() => navigate('/monitor/fleet')} />
        ) : (
          <>
            <header className="fleet__head">
              <h2>Fleet</h2>
              <span className="fleet__count">{ROBOTS.length} robots</span>
              <button type="button" className="fleet__more" aria-label="More">
                <Icon name="more" size={18} />
              </button>
            </header>

            <label className="fleet__search">
              <Icon name="search" size={14} />
              <input
                placeholder="Filter robots"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="fleet__chips" role="group" aria-label="Filter by status">
              <button
                type="button"
                className={`fleet__chip${statusFilter === null ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(null)}
              >
                All <b>{ROBOTS.length}</b>
              </button>
              {ROBOT_STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0 || statusFilter === status).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    className={`fleet__chip fleet__chip--${ROBOT_STATUS_TONE[status]}${statusFilter === status ? ' is-active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  >
                    <span className="dot" />
                    {status.charAt(0) + status.slice(1).toLowerCase()} <b>{counts.get(status) ?? 0}</b>
                  </button>
                ),
              )}
            </div>

            <ul className="fleet__list">
              {visibleRobots.map((robot) => (
                  <li key={robot.id}>
                    <button
                      type="button"
                      className={`fleet__item${robot.status === 'ERROR' ? ' is-error' : ''}${previewCode === robot.code ? ' is-selected' : ''}`}
                      onClick={() => navigate(`/monitor/fleet/${robot.code}`)}
                    >
                      <span className="fleet__item-icon">
                        <Icon name="box" size={16} />
                      </span>
                      <span className="fleet__item-main">
                        <strong>{robot.code}</strong>
                        <small>
                          {robot.activity
                            ? `${robot.activity.requestCode}${robot.activity.routeLabel ? ` · ${robot.activity.routeLabel}` : ''}`
                            : 'No active job'}
                        </small>
                      </span>
                      <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
                        {robot.status}
                      </StatusBadge>
                      <span className="fleet__bar">
                        <i
                          className={`fleet__bar-fill fleet__bar-fill--${ROBOT_STATUS_TONE[robot.status]}`}
                          style={{ width: `${robot.activity?.progressPercent ?? 0}%` }}
                        />
                      </span>
                      <span className="fleet__pct">{robot.activity?.progressPercent ?? 0}%</span>
                    </button>
                  </li>
                ))}
              {visibleRobots.length === 0 && <li className="fleet__empty">No robots match</li>}
            </ul>

            <footer className="fleet__foot">
              <span>{robotCode ? '1 selected' : `${visibleRobots.length} shown`}</span>
              <button type="button" className="btn">
                Actions <Icon name="chevronDown" size={12} />
              </button>
            </footer>
          </>
        )}
      </aside>

      <div className="fleet__map">
        <FleetMap
          robots={ROBOTS}
          selectedCode={robotCode ?? null}
          onSelect={(code) => navigate(`/monitor/fleet/${code}`)}
          variant={selected ? 'detail' : 'overview'}
          previewCode={previewCode}
          onPreview={setPreviewCode}
        />
      </div>
    </div>
  )
}
