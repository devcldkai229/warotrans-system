import type { CSSProperties } from 'react'
import type { RobotView } from '@/shared/api/contracts'
import { formatRelativeTime } from '@/shared/lib/format'
import { poseToPercent } from '@/shared/lib/mapView'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'

interface RobotPreviewCardProps {
  robot: RobotView
  onClose: () => void
  onOpenDetails: () => void
}

/** Floating summary anchored to a robot marker; "View details" opens the full Robot Detail panel. */
export function RobotPreviewCard({ robot, onClose, onOpenDetails }: RobotPreviewCardProps) {
  const anchor = poseToPercent(robot.poseX, robot.poseY)
  // Open towards the free side of the map so the card never runs off the edge.
  const side = parseFloat(anchor.left) > 60 ? 'left' : 'right'
  const vertical = parseFloat(anchor.top) < 30 ? 'down' : parseFloat(anchor.top) > 70 ? 'up' : 'mid'
  const style: CSSProperties = { left: anchor.left, top: anchor.top }
  const activity = robot.activity

  return (
    <div
      className={`rpreview rpreview--${side} rpreview--${vertical}`}
      style={style}
      role="dialog"
      aria-label={`${robot.code} summary`}
      onClick={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <strong>{robot.code}</strong>
          <small>{robot.name}</small>
        </div>
        <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]}>{robot.status}</StatusBadge>
        <button type="button" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>

      {robot.telemetry?.error ? <p className="rpreview__alert">{robot.telemetry.error.title}</p> : null}

      <dl>
        <div>
          <dt>Battery</dt>
          <dd>
            {robot.batteryPercent}%
            <i className="rsec__meter rsec__meter--green">
              <b style={{ width: `${robot.batteryPercent}%` }} />
            </i>
          </dd>
        </div>
        <div>
          <dt>Heartbeat</dt>
          <dd>{formatRelativeTime(robot.lastHeartbeatAt)}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>
            {robot.poseX.toFixed(1)}, {robot.poseY.toFixed(1)} m
          </dd>
        </div>
      </dl>

      <section className="rpreview__job">
        {activity ? (
          <>
            <div>
              <strong>{activity.requestCode}</strong>
              <StatusBadge tone={JOB_STATUS_TONE[activity.jobStatus]}>{activity.jobStatus}</StatusBadge>
            </div>
            {activity.routeLabel ? <small>{activity.routeLabel}</small> : null}
            <div className="rpreview__progress">
              <i className={`rsec__meter rsec__meter--${activity.jobStatus === 'FAILED' ? 'red' : 'blue'}`}>
                <b style={{ width: `${activity.progressPercent}%` }} />
              </i>
              <span>{activity.progressPercent}%</span>
            </div>
          </>
        ) : (
          <small>No active job</small>
        )}
      </section>

      <button type="button" className="btn btn--block rpreview__more" onClick={onOpenDetails}>
        View details <Icon name="arrowRight" size={14} />
      </button>
    </div>
  )
}
