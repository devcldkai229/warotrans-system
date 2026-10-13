import { useState, type ReactNode } from 'react'
import type { RobotView } from '@/shared/api/contracts'
import { formatDateTimeWithYear, formatDuration, formatRelativeTime, secondsBetween } from '@/shared/lib/format'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_CONTAINER_STATUS_TONE, JOB_STATUS_TONE, ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { ROBOT_JOB_HISTORY, ROBOT_STATE_EVENTS } from './mock'

interface RobotDetailPanelProps {
  robot: RobotView
  onBack: () => void
}

const ACTIONS: { label: string; icon: IconName }[] = [
  { label: 'Manual', icon: 'gamepad' },
  { label: 'Pause', icon: 'pause' },
  { label: 'Unavail.', icon: 'stop' },
  { label: 'Localize', icon: 'crosshair' },
]

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')

interface Section {
  id: string
  label: string
  /** Shown on the collapsed row, so the panel is useful without opening anything. */
  summary: ReactNode
  body: ReactNode
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rsec__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Meter({ percent, tone = 'green' }: { percent: number; tone?: 'green' | 'blue' | 'red' | 'amber' }) {
  return (
    <i className={`rsec__meter rsec__meter--${tone}`}>
      <b style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </i>
  )
}

// Every section is backed by persisted data: fleet.robots, the active JobAssignment and fleet.robot_state_events.
function buildSections(robot: RobotView): Section[] {
  const activity = robot.activity
  const events = ROBOT_STATE_EVENTS.filter((event) => event.robotId === robot.id)
  const recentJobs = ROBOT_JOB_HISTORY.filter((item) => item.robotId === robot.id)
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .slice(0, 5)

  return [
    {
      id: 'robot',
      label: 'Robot',
      summary: `${robot.name} · ${robot.isEnabled ? 'Enabled' : 'Disabled'}`,
      body: (
        <dl>
          <Field label="Name">{robot.name}</Field>
          <Field label="Code">{robot.code}</Field>
          <Field label="Status">{titleCase(robot.status)}</Field>
          <Field label="Enabled">{robot.isEnabled ? 'Yes' : 'No'}</Field>
          <Field label="Last heartbeat">
            {formatRelativeTime(robot.lastHeartbeatAt)}
            <small>{formatDateTimeWithYear(robot.lastHeartbeatAt)}</small>
          </Field>
        </dl>
      ),
    },
    {
      id: 'battery',
      label: 'Battery & position',
      summary: (
        <>
          {robot.batteryPercent}% <Meter percent={robot.batteryPercent} />
        </>
      ),
      body: (
        <dl>
          <Field label="Battery">
            {robot.batteryPercent}% <Meter percent={robot.batteryPercent} />
          </Field>
          <Field label="Position X">{robot.poseX.toFixed(2)} m</Field>
          <Field label="Position Y">{robot.poseY.toFixed(2)} m</Field>
          <Field label="Heading">{robot.poseYaw}°</Field>
        </dl>
      ),
    },
    {
      id: 'job',
      label: 'Current job',
      summary: activity ? activity.requestCode : 'No active job',
      body: activity ? (
        <dl>
          <Field label="Job">{activity.jobNo}</Field>
          <Field label="Request">{activity.requestCode}</Field>
          <Field label="Status">
            <StatusBadge tone={JOB_STATUS_TONE[activity.jobStatus]}>{activity.jobStatus}</StatusBadge>
          </Field>
          <Field label="Progress">
            {activity.progressPercent}%{' '}
            <Meter percent={activity.progressPercent} tone={activity.jobStatus === 'FAILED' ? 'red' : 'blue'} />
          </Field>
          {activity.routeLabel ? <Field label="Route">{activity.routeLabel}</Field> : null}
          {activity.containers?.length ? (
            <Field label={activity.containers.length > 1 ? 'Containers' : 'Container'}>
              <ul className="rsec__containers">
                {activity.containers.map((container) => (
                  <li key={container.barcode}>
                    {container.barcode}
                    <StatusBadge tone={JOB_CONTAINER_STATUS_TONE[container.status]}>
                      {titleCase(container.status)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
        </dl>
      ) : (
        <p className="rsec__empty">This robot has no job assigned.</p>
      ),
    },
    {
      id: 'recent',
      label: 'Recent jobs',
      summary: recentJobs.length ? `Last ${recentJobs.length}` : 'No jobs yet',
      body: recentJobs.length ? (
        <ol className="rsec__timeline">
          {recentJobs.map((item) => {
            const seconds = secondsBetween(item.assignedAt, item.endedAt)
            return (
              <li key={item.id}>
                <div>
                  <strong>{item.jobNo}</strong>
                  <StatusBadge tone={JOB_STATUS_TONE[item.jobStatus]}>{item.jobStatus}</StatusBadge>
                </div>
                <span>
                  {item.requestCode} · {formatRelativeTime(item.assignedAt)}
                  {item.endedAt && seconds !== null ? ` · ${formatDuration(seconds)}` : ' · in progress'}
                  {item.endReason && item.endReason !== 'COMPLETED' ? ` · ${titleCase(item.endReason)}` : ''}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="rsec__empty">This robot has not been assigned any job yet.</p>
      ),
    },
    {
      id: 'history',
      label: 'State history',
      summary: events.length ? `${events.length} events` : 'No events',
      body: events.length ? (
        <ol className="rsec__timeline">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>
                  {event.fromStatus ? `${titleCase(event.fromStatus)} → ` : ''}
                  {titleCase(event.toStatus)}
                </strong>
                <small>{formatRelativeTime(event.occurredAt)}</small>
              </div>
              <span>
                {titleCase(event.source)}
                {event.reason ? ` · ${event.reason}` : ''}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rsec__empty">No state changes recorded.</p>
      ),
    },
  ]
}

export function RobotDetailPanel({ robot, onBack }: RobotDetailPanelProps) {
  const sections = buildSections(robot)
  const [openIds, setOpenIds] = useState<string[]>(['robot'])
  const [confirmed, setConfirmed] = useState(false)
  const error = robot.telemetry?.error
  const navigationState = robot.telemetry?.navigationState

  return (
    <div className="rdetail">
      <div className="rdetail__scroll">
        <button type="button" className="rdetail__back" onClick={onBack}>
          <Icon name="arrowLeft" size={14} /> Fleet
        </button>
        <div className="rdetail__title">
          <h2>{robot.code}</h2>
          <Icon name="list" size={14} />
          <StatusBadge tone={ROBOT_STATUS_TONE[robot.status]}>{robot.status}</StatusBadge>
        </div>

        {error ? (
          <div className="rdetail__alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>{error.title}</strong>
              <p>{error.message}</p>
              <a href="#details" onClick={(event) => event.preventDefault()}>
                View details
              </a>
            </div>
          </div>
        ) : null}

        <div className="rdetail__actions">
          {ACTIONS.map((action) => (
            <button key={action.label} type="button">
              <span>
                <Icon name={action.icon} size={16} />
              </span>
              {action.label}
            </button>
          ))}
        </div>

        {navigationState ? (
          <p className="rdetail__nav">
            Navigation <span>|</span> {navigationState}
          </p>
        ) : null}

        <div className="rsec">
          {sections.map((section) => {
            const isOpen = openIds.includes(section.id)
            return (
              <section key={section.id} className={`rsec__item${isOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="rsec__head"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenIds(isOpen ? openIds.filter((id) => id !== section.id) : [...openIds, section.id])
                  }
                >
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
                  <span className="rsec__label">{section.label}</span>
                  {isOpen ? null : <span className="rsec__summary">{section.summary}</span>}
                </button>
                {isOpen ? <div className="rsec__body">{section.body}</div> : null}
              </section>
            )
          })}
        </div>
      </div>

      {error ? (
        <footer className="rdetail__foot">
          {/* TODO(backend): no endpoint to acknowledge a Robot error yet; the confirmation is local to this panel. */}
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={confirmed}
            onClick={() => setConfirmed(true)}
          >
            <Icon name="check" size={14} /> {confirmed ? 'Error confirmed' : 'Confirm error'}
          </button>
        </footer>
      ) : null}
    </div>
  )
}
