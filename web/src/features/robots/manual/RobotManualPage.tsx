import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import type { Endpoint } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import { cancelRobotCommand, listRobots, navigateRobot } from '@/shared/api/fleet'
import { cx } from '@/shared/lib/cx'
import { useMonitorMapVersion } from '@/shared/map/useMonitorMapVersion'
import { WarehouseMap, type MapCallout, type MapMovement } from '@/shared/map/WarehouseMap'
import { useNotificationsHub, type RobotTelemetryMessage } from '@/shared/realtime/useNotificationsHub'
import { Button } from '@/shared/ui/Button'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { ROBOT_STATUS_TONE } from '@/shared/ui/statusTones'
import { HeadingDial } from '../../maps/HeadingDial'
import { CameraPanel } from './CameraPanel'
import { Joystick } from './Joystick'
import { Speedometer } from './Speedometer'
import { useTeleopLoop } from './useTeleopLoop'

interface Target {
  x: number
  y: number
  /** Heading on arrival in degrees (0 = +X, counter-clockwise). */
  yawDeg: number
  label?: string
}

const KEYS: Record<string, 'f' | 'b' | 'l' | 'r'> = {
  ArrowUp: 'f',
  KeyW: 'f',
  ArrowDown: 'b',
  KeyS: 'b',
  ArrowLeft: 'l',
  KeyA: 'l',
  ArrowRight: 'r',
  KeyD: 'r',
}

/** Turn rate scales with the speed setting (0.05 m/s → 0.3 rad/s … 0.3 m/s → 1.0 rad/s). */
const turnRateFor = (maxLinear: number) => Math.min(1.0, 0.2 + maxLinear * 2.7)

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : String(err))

/**
 * Full-screen control of one Robot (Monitor → Fleet → robot → Manual). The map is the page.
 *  - Manual OFF (default): click the floor or an endpoint, set the heading, Go → Nav2 plans and drives there.
 *  - Manual ON: drive by hand with the joystick / ▲▼ / arrow keys (teleop, optional Drive Assist).
 * The control bar (Manual, Drive Assist, speed, Stop) opens from the control-panel button beside the joystick.
 */
export function RobotManualPage() {
  const { robotCode = '' } = useParams()
  const navigate = useNavigate()

  const robotsQuery = useQuery({
    queryKey: ['fleet-robots', 'manual', robotCode],
    queryFn: () => listRobots({ search: robotCode, take: 10 }),
    refetchInterval: 1000,
  })
  const restRobot = robotsQuery.data?.items.find((r) => r.code === robotCode) ?? null

  const [live, setLive] = useState<RobotTelemetryMessage | null>(null)
  const onTelemetry = useCallback(
    (message: RobotTelemetryMessage) => {
      if (message.robotCode === robotCode) setLive(message)
    },
    [robotCode],
  )
  const hubConnected = useNotificationsHub({ robotTelemetryUpdated: onTelemetry })
  const pose = live ?? (restRobot ? { poseX: restRobot.poseX, poseY: restRobot.poseY, poseYaw: restRobot.poseYaw } : null)
  const speed = live?.linearVelocity ?? restRobot?.linearVelocity ?? null

  const monitorMap = useMonitorMapVersion({
    preferredWarehouseId: restRobot?.warehouseId ?? null,
    preferredMapVersionId: restRobot?.currentMapVersionId ?? null,
  })
  const geometry = monitorMap.geometry

  // ------------------------------------------------------------------ console state
  const [manualOn, setManualOn] = useState(false)
  const [barOpen, setBarOpen] = useState(false)
  const [assist, setAssist] = useState(true)
  const [maxLinear, setMaxLinear] = useState(0.2)
  const [follow, setFollow] = useState(true)
  const [zoom, setZoom] = useState(1.5)
  const [showZones, setShowZones] = useState(true)
  const [target, setTarget] = useState<Target | null>(null)

  const navigating = Boolean(restRobot?.currentCommandId)
  const canDrive = manualOn && Boolean(restRobot?.isOnline) && Boolean(restRobot?.isEnabled) && !navigating
  const drive = useTeleopLoop(restRobot?.id ?? null, assist)
  // set / stop are stable (useCallback): depend on them, not on `drive`, which is a new object every render.
  const { set: driveSet, stop: driveStop } = drive
  const maxAngular = turnRateFor(maxLinear)

  // Every hand input produces a normalised (forward, turn); scaled by the speed setting here.
  const steer = useCallback(
    (forward: number, turn: number) => {
      if (!canDrive) return driveStop()
      driveSet(forward * maxLinear, turn * maxAngular)
    },
    [canDrive, driveSet, driveStop, maxLinear, maxAngular],
  )
  useEffect(() => {
    if (!canDrive) driveStop()
  }, [canDrive, driveStop])

  function setMode(on: boolean) {
    setManualOn(on)
    if (on) setTarget(null) // hand driving and click-to-go are separate modes
  }

  // Keyboard (Manual ON): arrows / WASD combine (W + A = forward-left), Space stops.
  const pressed = useRef(new Set<string>())
  useEffect(() => {
    if (!canDrive) return
    const apply = () => {
      const has = (k: string) => pressed.current.has(k)
      steer((has('f') ? 1 : 0) - (has('b') ? 1 : 0), (has('l') ? 1 : 0) - (has('r') ? 1 : 0))
    }
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      const key = KEYS[event.code]
      if (key) {
        event.preventDefault()
        if (!pressed.current.has(key)) {
          pressed.current.add(key)
          apply()
        }
      } else if (event.code === 'Space') {
        event.preventDefault()
        pressed.current.clear()
        driveStop()
      }
    }
    const up = (event: KeyboardEvent) => {
      const key = KEYS[event.code]
      if (key && pressed.current.delete(key)) apply()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    const keys = pressed.current
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      keys.clear()
    }
  }, [canDrive, steer, driveStop])

  // ------------------------------------------------------------------ click-to-go (Manual OFF, Nav2)
  const go = useMutation({
    mutationFn: () =>
      navigateRobot(restRobot!.id, { x: target!.x, y: target!.y, yaw: (target!.yawDeg * Math.PI) / 180 }),
  })
  const cancel = useMutation({ mutationFn: () => cancelRobotCommand(restRobot!.id) })

  const pickEndpoint = (endpoint: Endpoint) =>
    setTarget({ x: endpoint.x, y: endpoint.y, yawDeg: Math.round((endpoint.yaw * 180) / Math.PI), label: endpoint.name })

  const mapRobots = useMemo(
    () =>
      restRobot && pose
        ? [{ code: restRobot.code, status: restRobot.status, x: pose.poseX, y: pose.poseY, yaw: pose.poseYaw }]
        : [],
    [restRobot, pose],
  )
  const callouts: MapCallout[] = target
    ? [{ x: target.x, y: target.y, lines: [target.label ?? 'Target', `(${target.x.toFixed(2)}, ${target.y.toFixed(2)})`] }]
    : []
  const movements: MapMovement[] =
    target && pose ? [{ from: { x: pose.poseX, y: pose.poseY }, to: { x: target.x, y: target.y } }] : []

  const requestError = go.error ?? cancel.error
  const message = drive.error ?? (requestError ? errorText(requestError) : null)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-container text-ink">
      <div className="absolute inset-0">
        <WarehouseMap
          yawUnit="rad"
          zones={showZones ? geometry.zones : []}
          edges={geometry.edges}
          endpoints={geometry.endpoints}
          bounds={geometry.bounds}
          occupancyImageUrl={geometry.occupancyImageUrl}
          robots={mapRobots}
          layers={{ occupancy: true, legend: false, controls: false, coordinates: false }}
          labels="all"
          movements={movements}
          callouts={callouts}
          selected={{ robotCode: restRobot?.code }}
          zoom={zoom}
          onZoomChange={setZoom}
          follow={follow && pose ? { x: pose.poseX, y: pose.poseY } : null}
          onUserPan={() => setFollow(false)}
          onEndpointClick={
            manualOn
              ? undefined
              : (id) => {
                  const endpoint = geometry.endpoints.find((e) => e.id === id)
                  if (endpoint) pickEndpoint(endpoint)
                }
          }
          onBackgroundClick={
            manualOn ? undefined : (point) => setTarget({ x: point.x, y: point.y, yawDeg: target?.yawDeg ?? 0 })
          }
        />
      </div>

      {/* Top-left: robot and back */}
      <header className="absolute top-4 left-4 flex items-center gap-3 rounded-full bg-surface py-1.5 pr-4 pl-1.5 shadow-float">
        <button
          type="button"
          aria-label="Back to robot"
          className="grid size-9 place-items-center rounded-full bg-container hover:bg-container-high"
          onClick={() => {
            driveStop()
            navigate(`/monitor/fleet/${robotCode}`)
          }}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <strong className="text-base font-medium">{robotCode}</strong>
        {restRobot ? (
          <StatusBadge tone={ROBOT_STATUS_TONE[restRobot.status]} withDot>
            {restRobot.status}
          </StatusBadge>
        ) : null}
        <span className="text-xs text-muted">
          {restRobot?.isOnline ? 'Online' : 'Offline'} · {live?.navigationStatus ?? restRobot?.navigationStatus ?? '—'}
        </span>
        {pose ? (
          <span className="font-mono text-xs text-muted">
            ({pose.poseX.toFixed(2)}, {pose.poseY.toFixed(2)}) {Math.round((pose.poseYaw * 180) / Math.PI)}°
          </span>
        ) : null}
        {!hubConnected ? <span className="text-xs text-amber-ink">polling</span> : null}
      </header>

      {/* Top-right: map tools */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <ToolButton icon="layers" label="Zones" active={showZones} onClick={() => setShowZones(!showZones)} />
        <ToolButton icon="navigate" label="Follow robot" active={follow} onClick={() => setFollow(!follow)} />
        <ToolButton icon="plus" label="Zoom in" onClick={() => setZoom(Math.min(4, zoom + 0.5))} />
        <ToolButton icon="minus" label="Zoom out" onClick={() => setZoom(Math.max(1, zoom - 0.5))} />
        <ToolButton
          icon="fit"
          label="Whole map"
          onClick={() => {
            setFollow(false)
            setZoom(1)
          }}
        />
      </div>

      {/* Top-centre: what the operator can do now; the picked target with Go / Cancel (Manual OFF) */}
      {!manualOn && target ? (
        <section className="absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-surface px-4 py-3 shadow-float">
          <div className="text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Icon name="target" size={15} className="text-blue" /> {target.label ?? 'Floor point'}
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted">
              ({target.x.toFixed(2)}, {target.y.toFixed(2)}) · heading {target.yawDeg}°
            </div>
          </div>
          <div className="w-28">
            <HeadingDial variant="panel" yaw={target.yawDeg} onChange={(yaw) => setTarget({ ...target, yawDeg: yaw })} />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!restRobot?.isOnline || navigating || go.isPending}
              onClick={() => go.mutate()}
            >
              <Icon name="play" size={14} /> Go
            </Button>
            <Button variant="danger" size="sm" disabled={!navigating || cancel.isPending} onClick={() => cancel.mutate()}>
              <Icon name="stop" size={14} /> Cancel
            </Button>
          </div>
          <button type="button" aria-label="Clear target" className="text-muted hover:text-ink" onClick={() => setTarget(null)}>
            <Icon name="close" size={16} />
          </button>
        </section>
      ) : (
        <p className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-surface/95 px-4 py-2 text-xs text-ink-2 shadow-float">
          {manualOn
            ? 'Manual: drive with the joystick, ▲ ▼ or arrow keys / WASD. Space stops.'
            : 'Click the floor or an endpoint to send the robot there (Nav2 plans the path).'}
        </p>
      )}

      {message ? (
        <p className="absolute top-36 left-1/2 -translate-x-1/2 rounded-full bg-red-soft px-4 py-2 text-sm text-red-ink shadow-float">
          {message}
        </p>
      ) : navigating ? (
        <p className="absolute top-36 left-1/2 -translate-x-1/2 rounded-full bg-blue-soft px-4 py-2 text-sm text-blue-ink shadow-float">
          Navigating with Nav2{manualOn ? ' — cancel the goal (Manual off → Cancel) to drive by hand' : ''}.
        </p>
      ) : null}

      {/* Bottom-left: real speed */}
      <div className={cx('absolute left-6 transition-[bottom] duration-200', barOpen ? 'bottom-24' : 'bottom-6')}>
        <Speedometer speed={speed} max={Math.max(maxLinear, 0.1)} />
      </div>

      {/* Bottom-right: live camera above the joystick (Manual ON) and the control-panel button */}
      <div
        className={cx(
          'absolute right-6 flex flex-col items-end gap-3 transition-[bottom] duration-200',
          barOpen ? 'bottom-20' : 'bottom-6',
        )}
      >
        {restRobot ? <CameraPanel robotId={restRobot.id} /> : null}
        <div className="flex items-end gap-3">
          {manualOn ? <Joystick disabled={!canDrive} onChange={steer} /> : null}
          <div className="pb-2">
            <RoundButton
              icon="sliders"
              label={barOpen ? 'Hide control panel' : 'Show control panel'}
              active={barOpen}
              onClick={() => setBarOpen(!barOpen)}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar: shown from the control-panel button */}
      {barOpen ? (
        <footer className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center gap-10 border-t border-outline-soft bg-surface">
          <Toggle label="Manual" on={manualOn} onChange={setMode} />
          <Toggle label="Drive Assist" on={assist} onChange={setAssist} />
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <span aria-hidden>🐢</span>
            <input
              type="range"
              min={0.05}
              max={0.3}
              step={0.05}
              value={maxLinear}
              onChange={(e) => setMaxLinear(Number(e.target.value))}
              aria-label="Max speed"
              className="w-48 accent-blue"
            />
            <span aria-hidden>🐇</span>
            <span className="w-16 text-xs text-muted tabular-nums">{maxLinear.toFixed(2)} m/s</span>
          </label>
          <Button variant="danger" size="sm" onClick={() => driveStop()}>
            <Icon name="stop" size={14} /> Stop
          </Button>
        </footer>
      ) : null}
    </div>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="flex items-center gap-3 text-sm text-ink" onClick={() => onChange(!on)}>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-green' : 'bg-container-highest')}>
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform duration-200',
            on && 'translate-x-5',
          )}
        />
      </span>
      {label}
    </button>
  )
}

function ToolButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'grid size-10 place-items-center rounded-lg shadow-float transition-colors duration-200',
        active ? 'bg-ink text-surface' : 'bg-surface text-ink-2 hover:text-ink',
      )}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
    </button>
  )
}

function RoundButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        'grid size-12 place-items-center rounded-full shadow-float transition-colors duration-200',
        active ? 'bg-ink text-surface' : 'bg-surface text-ink-2 hover:text-ink',
      )}
      onClick={onClick}
    >
      <Icon name={icon} size={19} />
    </button>
  )
}
