import { Icon } from '@/shared/ui/Icon'
import type { RobotView } from '@/shared/api/contracts'
import { poseToPercent } from '@/shared/lib/mapView'
import { LIVE_MAP_LABEL, SHIFT_STATS } from './mock'

interface FleetMapProps {
  robots: RobotView[]
  selectedCode: string | null
  onSelect: (code: string) => void
  /** `detail` is the full-bleed map shown behind the Robot Detail panel. */
  variant?: 'overview' | 'detail'
}

function markerTone(robot: RobotView) {
  if (robot.status === 'ERROR') return 'is-error'
  if (robot.status === 'EXECUTING') return 'is-run'
  return 'is-idle'
}

function statusDot(robot: RobotView) {
  if (robot.status === 'ERROR') return 'red'
  if (robot.status === 'EXECUTING') return 'green'
  return 'grey'
}

function queueLabel(robot: RobotView) {
  const zone = robot.telemetry?.zone
  if (!zone?.heldByRobotCode) return null
  return `held by ${zone.heldByRobotCode} · queue ${robot.code} +${zone.queueAfter ?? 0}`
}

// The decorative scene (aisles, docks, zones) stands in for the map image + Zone geometry of the published
// MapVersion. Robots are the real data: they are placed from their pose.
function DetailMap({ robots, selectedCode, onSelect }: Omit<FleetMapProps, 'variant'>) {
  const blocked = robots.find((robot) => robot.status === 'ERROR')
  const blockedAt = blocked ? poseToPercent(blocked.poseX, blocked.poseY) : null
  const tip = blocked ? queueLabel(blocked) : null

  return (
    <div className="dmap">
      <div className="dmap__band" />
      {[
        { label: 'AISLE B', left: '35%' },
        { label: 'AISLE C', left: '50%' },
        { label: 'AISLE D', left: '65%' },
      ].map((aisle) => (
        <div key={aisle.label} className="dmap__aisle" style={{ left: aisle.left }}>
          {aisle.label}
        </div>
      ))}

      {blockedAt ? (
        <>
          <div
            className="dmap__zone"
            style={{ left: `calc(${blockedAt.left} - 10%)`, top: `calc(${blockedAt.top} - 7%)` }}
          >
            <span>{blocked?.telemetry?.zone?.name ?? 'ZONE'}</span>
          </div>
          {tip ? (
            <div className="dmap__tip" style={{ left: `calc(${blockedAt.left} - 5%)`, top: `calc(${blockedAt.top} - 12%)` }}>
              {tip}
            </div>
          ) : null}
        </>
      ) : null}

      {robots.map((robot) => (
        <button
          key={robot.id}
          type="button"
          className={`dmap__robot${robot.status === 'ERROR' ? ' is-error' : ''}${selectedCode === robot.code ? ' is-selected' : ''}`}
          style={poseToPercent(robot.poseX, robot.poseY)}
          onClick={() => onSelect(robot.code)}
        >
          <span>
            <Icon name="box" size={robot.status === 'ERROR' ? 14 : 11} />
          </span>
          <small>{robot.code}</small>
        </button>
      ))}

      <div className="dmap__layers">
        <button type="button" aria-label="Layers">
          <Icon name="layers" size={18} />
        </button>
        <button type="button" aria-label="Filter">
          <Icon name="filter" size={18} />
        </button>
      </div>

      <div className="dmap__zoom">
        <button type="button" aria-label="Zoom in">
          <Icon name="plus" size={18} />
        </button>
        <button type="button" aria-label="Zoom out">
          <Icon name="minus" size={18} />
        </button>
        <button type="button" aria-label="Center">
          <Icon name="target" size={18} />
        </button>
      </div>

      <div className="fmap__live dmap__live">
        <span className="dot" />
        {LIVE_MAP_LABEL}
      </div>
    </div>
  )
}

export function FleetMap({ robots, selectedCode, onSelect, variant = 'overview' }: FleetMapProps) {
  if (variant === 'detail') {
    return <DetailMap robots={robots} selectedCode={selectedCode} onSelect={onSelect} />
  }

  const blocked = robots.find((robot) => robot.status === 'ERROR')
  const blockedAt = blocked ? poseToPercent(blocked.poseX, blocked.poseY) : null
  const tip = blocked ? queueLabel(blocked) : null

  return (
    <div className="fmap">
      <div className="fmap__lane" style={{ left: '46.5%', width: '6.8%', top: 0, height: '65%' }} />
      <div className="fmap__lane fmap__lane--thin" style={{ left: '82.5%', width: '3.5%', top: 0, height: '65%' }} />

      <span className="fmap__label" style={{ left: '48%', top: '6%' }}>PACKING</span>
      <span className="fmap__label" style={{ left: '26%', top: '34%' }}>AISLE A &amp; B</span>
      <span className="fmap__label" style={{ left: '64%', top: '34%' }}>AISLE C &amp; D</span>

      <div className="fmap__zone fmap__zone--junction" style={{ left: '34%', top: '32%', width: '26%', height: '32%' }}>
        ZONE C — JUNCTION
      </div>
      <div className="fmap__zone fmap__zone--narrow" style={{ left: '34%', top: '70%', width: '26%', height: '26%' }}>
        ZONE F — NARROW AISLE
      </div>

      <div className="fmap__docks">
        {['DOCK 3', 'DOCK 2', 'DOCK 1'].map((dock) => (
          <span key={dock}>{dock}</span>
        ))}
      </div>

      <div className="fmap__edge-top" />
      <div className="fmap__edge-left" />
      <div className="fmap__route" style={{ left: '52%', top: '15.8%', width: '32.5%', borderTop: '2px dashed #3b82f6' }} />
      <div className="fmap__route" style={{ left: '84.5%', top: '15.8%', height: '20%', borderLeft: '2px dashed #3b82f6' }} />
      <div className="fmap__route fmap__route--soft" style={{ left: '73%', top: '47%', width: '13%', borderTop: '2px dashed #93c5fd' }} />

      {blockedAt && tip ? (
        <div className="fmap__tip" style={{ left: `calc(${blockedAt.left} - 2%)`, top: `calc(${blockedAt.top} - 10%)` }}>
          {tip}
        </div>
      ) : null}

      {robots.map((robot) => (
        <button
          key={robot.id}
          type="button"
          className={`fmap__robot ${markerTone(robot)}${selectedCode === robot.code ? ' is-selected' : ''}`}
          style={poseToPercent(robot.poseX, robot.poseY)}
          onClick={() => onSelect(robot.code)}
        >
          <span className="fmap__robot-dot">
            <Icon name="navigate" size={14} />
            <i className={`fmap__status fmap__status--${statusDot(robot)}`} />
          </span>
          <span className="fmap__robot-tag">{robot.code}</span>
        </button>
      ))}

      <div className="fmap__shift">
        <header>
          <Icon name="clock" size={14} /> <strong>Shift</strong> {SHIFT_STATS.window}
        </header>
        <div>
          <span>
            <strong>{SHIFT_STATS.completed}</strong>
            Completed
          </span>
          <span className="is-blue">
            <strong>{SHIFT_STATS.active}</strong>
            Active
          </span>
          <span className="is-green">
            <strong>{SHIFT_STATS.failedPercent.toFixed(1)}%</strong>
            Failed
          </span>
        </div>
      </div>

      <div className="fmap__tools">
        <button type="button" aria-label="Layers">
          <Icon name="box" size={16} />
        </button>
        <button type="button" aria-label="Center">
          <Icon name="crosshair" size={16} />
        </button>
        <button type="button" aria-label="Measure">
          <Icon name="route" size={16} />
        </button>
      </div>

      <div className="fmap__live">
        <span className="dot" />
        {LIVE_MAP_LABEL}
      </div>

      <div className="fmap__zoom">
        <button type="button" aria-label="Locate">
          <Icon name="navigate" size={16} />
        </button>
        <div>
          <button type="button" aria-label="Zoom in">
            <Icon name="plus" size={16} />
          </button>
          <button type="button" aria-label="Zoom out">
            <Icon name="minus" size={16} />
          </button>
        </div>
        <button type="button" className="fmap__pill">Shortcuts</button>
        <button type="button" className="fmap__pill">Map Legend</button>
      </div>
    </div>
  )
}
