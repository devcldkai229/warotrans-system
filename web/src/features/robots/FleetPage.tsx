import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { RobotStatus } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge, ToneDot } from '@/shared/ui/StatusBadge'
import { humanize } from '@/shared/lib/format'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { FleetMap } from './FleetMap'
import { RobotDetailPanel } from './RobotDetailPanel'
import { ROBOT_STATUS_ORDER } from './constants'
import { ROBOTS } from './mock'

const chipClass = (active: boolean) =>
  cx(
    'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors duration-200',
    active ? 'bg-ink text-surface' : 'bg-surface text-ink-2 hover:text-ink',
  )

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
    // The side panel is the Robot list, or one Robot's detail; the map keeps the rest of the frame either way.
    <div className={cx('grid h-full gap-3 px-3 pb-3', selected ? 'grid-cols-[400px_minmax(0,1fr)]' : 'grid-cols-[360px_minmax(0,1fr)]')}>
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-container">
        {selected ? (
          <RobotDetailPanel robot={selected} onBack={() => navigate('/monitor/fleet')} />
        ) : (
          <>
            <header className="flex items-center gap-3 px-5 pt-5">
              <h1 className="text-xl font-book">Fleet</h1>
              <span className="text-sm text-muted">{ROBOTS.length} robots</span>
              <IconButton aria-label="More" className="-mr-2 ml-auto">
                <Icon name="more" size={18} />
              </IconButton>
            </header>

            <SearchInput tone="surface" placeholder="Filter robots" value={query} onChange={setQuery} className="mx-4 mt-3" />

            <div className="flex flex-wrap gap-1.5 px-4 py-3" role="group" aria-label="Filter by status">
              <button type="button" className={chipClass(statusFilter === null)} onClick={() => setStatusFilter(null)}>
                All <span className="opacity-60">{ROBOTS.length}</span>
              </button>
              {ROBOT_STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0 || statusFilter === status).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    className={chipClass(statusFilter === status)}
                    onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  >
                    <ToneDot tone={ROBOT_STATUS_TONE[status]} size="sm" />
                    {humanize(status)} <span className="opacity-60">{counts.get(status) ?? 0}</span>
                  </button>
                ),
              )}
            </div>

            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-3 pt-1 pb-2">
              {visibleRobots.map((robot) => (
                <li key={robot.id}>
                  <button
                    type="button"
                    className={cx(
                      // Each Robot is its own white card, like a Request, so rows read as separate items on the grey panel.
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-md bg-surface px-4 py-3.5 text-left transition-shadow duration-200',
                      previewCode === robot.code ? 'ring-2 ring-ink' : 'hover:shadow-float',
                    )}
                    onClick={() => navigate(`/monitor/fleet/${robot.code}`)}
                  >
                    <span className="min-w-0">
                      <strong className="block font-medium">{robot.code}</strong>
                      <span className="block truncate text-xs text-muted">
                        {robot.activity
                          ? `${robot.activity.requestCode}${robot.activity.routeLabel ? `, ${robot.activity.routeLabel}` : ''}`
                          : 'No active job'}
                      </span>
                    </span>
                    <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]} withDot>
                      {robot.status}
                    </StatusBadge>
                    {robot.activity ? (
                      <>
                        <Meter percent={robot.activity.progressPercent} tone={ROBOT_STATUS_TONE[robot.status]} />
                        <span className="text-right text-xs text-muted tabular-nums">{robot.activity.progressPercent}%</span>
                      </>
                    ) : null}
                  </button>
                </li>
              ))}
              {visibleRobots.length === 0 ? (
                <li className="px-3 py-10 text-center text-sm text-muted">No robots match this filter.</li>
              ) : null}
            </ul>

            <footer className="flex items-center justify-between px-5 py-3 text-xs text-muted">
              <span>{visibleRobots.length} shown</span>
              <Button variant="surface" size="sm">
                Actions <Icon name="chevronDown" size={13} />
              </Button>
            </footer>
          </>
        )}
      </aside>

      <div className="relative min-w-0 overflow-hidden rounded-lg bg-container">
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
