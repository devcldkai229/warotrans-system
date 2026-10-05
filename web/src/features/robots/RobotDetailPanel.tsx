import { useState } from 'react'
import type { RobotView } from '@/shared/api/contracts'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'

interface RobotDetailPanelProps {
  robot: RobotView
  onBack: () => void
}

const ACTIONS: { label: string; icon: IconName; primary?: boolean }[] = [
  { label: 'Maint.', icon: 'wrench', primary: true },
  { label: 'Manual', icon: 'gamepad' },
  { label: 'Pause', icon: 'pause' },
  { label: 'Unavail.', icon: 'stop' },
  { label: 'Localize', icon: 'crosshair' },
]

interface DetailRow {
  label: string
  value: string
  ok?: boolean
  battery?: number
}

function buildRows(robot: RobotView): DetailRow[] {
  const telemetry = robot.telemetry
  const rows: DetailRow[] = []

  const identity = [telemetry?.model, telemetry?.firmware].filter(Boolean).join(' · ')
  if (identity) rows.push({ label: 'Robot details', value: identity })
  if (telemetry) rows.push({ label: 'Payload', value: telemetry.payloadLabel ?? 'Empty' })
  rows.push({ label: 'Battery', value: `${robot.batteryPercent}%`, battery: robot.batteryPercent })
  if (telemetry?.zone) {
    const seconds = String(telemetry.zone.heldSeconds).padStart(2, '0')
    rows.push({ label: 'Zone held', value: `${telemetry.zone.name} · 00:${seconds}` })
  }
  if (telemetry?.connectionLabel) rows.push({ label: 'Connection', value: telemetry.connectionLabel })
  if (telemetry?.eStopReleased !== undefined) {
    rows.push({ label: 'E-Stop', value: telemetry.eStopReleased ? 'Released' : 'Engaged', ok: telemetry.eStopReleased })
  }
  return rows
}

export function RobotDetailPanel({ robot, onBack }: RobotDetailPanelProps) {
  const rows = buildRows(robot)
  const [open, setOpen] = useState<string | null>(rows[0]?.label ?? null)
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
            <button
              key={action.label}
              type="button"
              className={action.primary ? 'is-primary' : undefined}
            >
              <span>
                <Icon name={action.icon} size={16} />
              </span>
              {action.label}
            </button>
          ))}
        </div>

        {navigationState ? (
          <section className="rdetail__nav">
            <header>
              <strong>
                Navigation <span>|</span> {navigationState}
              </strong>
              <small>
                {robot.isEnabled ? 'Ready for work' : 'Disabled'} <i className="dot" />
              </small>
            </header>
            <div>
              <button type="button" className="btn">Abort</button>
              <button type="button" className="btn">Retry</button>
            </div>
          </section>
        ) : null}

        <dl className="rdetail__rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>
                <button
                  type="button"
                  onClick={() => setOpen(open === row.label ? null : row.label)}
                >
                  <Icon name={open === row.label ? 'chevronDown' : 'chevronRight'} size={12} />
                  {row.label}
                </button>
              </dt>
              <dd className={row.ok ? 'is-ok' : undefined}>
                {row.value}
                {row.battery !== undefined ? (
                  <i className="rdetail__battery">
                    <b style={{ width: `${row.battery}%` }} />
                  </i>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        {robot.activity ? (
          <div className={`rdetail__job${robot.activity.jobStatus === 'FAILED' ? '' : ' is-ok'}`}>
            <strong>{robot.activity.requestCode}</strong>
            <StatusBadge tone={JOB_STATUS_TONE[robot.activity.jobStatus]}>{robot.activity.jobStatus}</StatusBadge>
          </div>
        ) : null}
      </div>

      {error ? (
        <footer className="rdetail__foot">
          <button type="button" className="btn btn--primary btn--block">
            <Icon name="refresh" size={14} /> Retry navigation
          </button>
          <button type="button" className="btn btn--danger btn--block">
            Remove from fleet
          </button>
        </footer>
      ) : null}
    </div>
  )
}
