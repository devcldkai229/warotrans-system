import type { ReactNode } from 'react'
import type { RobotView } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { formatRelativeTime } from '@/shared/lib/format'
import { poseToPercent } from '@/shared/lib/mapView'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'

interface RobotPreviewCardProps {
  robot: RobotView
  onClose: () => void
  onOpenDetails: () => void
}

// The card is 288px wide and sits 28px away from the marker, on whichever side has room.
const SIDE = { right: 'ml-7', left: '-ml-[316px]' }
const VERTICAL = { mid: '-translate-y-1/2', up: 'mt-4 -translate-y-full', down: '-mt-4' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-medium">{children}</dd>
    </div>
  )
}

/** Floating summary anchored to a robot marker; "View details" opens the full Robot Detail panel. */
export function RobotPreviewCard({ robot, onClose, onOpenDetails }: RobotPreviewCardProps) {
  const anchor = poseToPercent(robot.poseX, robot.poseY)
  // Open towards the free side of the map so the card never runs off the edge.
  const side = parseFloat(anchor.left) > 60 ? 'left' : 'right'
  const vertical = parseFloat(anchor.top) < 30 ? 'down' : parseFloat(anchor.top) > 70 ? 'up' : 'mid'
  const activity = robot.activity

  return (
    <div
      className={cx('absolute z-6 w-72 cursor-default rounded-md bg-surface p-4 shadow-float', SIDE[side], VERTICAL[vertical])}
      style={{ left: anchor.left, top: anchor.top }}
      role="dialog"
      aria-label={`${robot.code} summary`}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex items-center gap-2">
        <div className="mr-auto min-w-0">
          <strong className="block text-base font-medium">{robot.code}</strong>
          <span className="block truncate text-xs text-muted">{robot.name}</span>
        </div>
        <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]}>{robot.status}</StatusBadge>
        <IconButton size="sm" aria-label="Close" className="-mr-1" onClick={onClose}>
          <Icon name="close" size={15} />
        </IconButton>
      </header>

      {robot.telemetry?.error ? (
        <p className="mt-3 rounded-sm bg-red-soft px-3 py-2 text-xs font-medium text-red-ink">{robot.telemetry.error.title}</p>
      ) : null}

      <dl className="mt-3">
        <Row label="Battery">
          {robot.batteryPercent == null ? (
            <span className="text-muted">No sensor</span>
          ) : (
            <>
              {robot.batteryPercent}%
              <Meter percent={robot.batteryPercent} tone="green" className="w-12" />
            </>
          )}
        </Row>
        <Row label="Heartbeat">{formatRelativeTime(robot.lastHeartbeatAt)}</Row>
        <Row label="Position">
          {robot.poseX.toFixed(1)}, {robot.poseY.toFixed(1)} m
        </Row>
      </dl>

      <section className="mt-3 flex flex-col gap-2 rounded-sm bg-container p-3 text-xs">
        {activity ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <strong className="font-medium">{activity.requestCode}</strong>
              <StatusBadge tone={JOB_STATUS_TONE[activity.jobStatus]}>{activity.jobStatus}</StatusBadge>
            </div>
            {activity.routeLabel ? <span className="text-muted">{activity.routeLabel}</span> : null}
            <div className="flex items-center gap-2">
              <Meter percent={activity.progressPercent} tone={activity.jobStatus === 'FAILED' ? 'red' : 'blue'} className="flex-1" />
              <span className="text-muted tabular-nums">{activity.progressPercent}%</span>
            </div>
          </>
        ) : (
          <span className="text-muted">No active job</span>
        )}
      </section>

      <Button block className="mt-3" onClick={onOpenDetails}>
        View details <Icon name="arrowRight" size={14} />
      </Button>
    </div>
  )
}
