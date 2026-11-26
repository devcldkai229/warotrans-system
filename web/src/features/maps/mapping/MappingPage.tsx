import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { Joystick } from '@/features/robots/manual/Joystick'
import { useManualLease } from '@/features/robots/manual/useManualLease'
import { useTeleopLoop } from '@/features/robots/manual/useTeleopLoop'
import { ApiError } from '@/shared/api/client'
import {
  cancelMappingSession,
  finishMappingSession,
  getMappingPreview,
  getMappingSession,
  isOpenMappingSession,
  type MappingPose,
  type MappingSessionStatus,
} from '@/shared/api/mapping'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { MappingCanvas } from './MappingCanvas'
import { keysToMove } from './drivePad'
import { MappingDrivePad } from './MappingDrivePad'
import { canRescan, rescanMapping } from './rescan'
import {
  decodeGrid,
  formatElapsed,
  mappingActions,
  mappingPreviewKey,
  mappingSessionKey,
  type MappingGrid,
} from './mappingGrid'

const STATUS_TONE: Record<MappingSessionStatus, Tone> = {
  STARTING: 'blue',
  MAPPING: 'green',
  SAVING: 'blue',
  CANCELLING: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'grey',
  FAILED: 'red',
}

const STATUS_TEXT: Record<MappingSessionStatus, () => string> = {
  STARTING: () => t('Starting'),
  MAPPING: () => t('Mapping'),
  SAVING: () => t('Saving'),
  CANCELLING: () => t('Cancelling'),
  COMPLETED: () => t('Completed'),
  CANCELLED: () => t('Cancelled'),
  FAILED: () => t('Failed'),
}

const KEYS: Record<string, 'f' | 'b' | 'l' | 'r' | 'q' | 'e'> = {
  ArrowUp: 'f',
  KeyW: 'f',
  ArrowDown: 'b',
  KeyS: 'b',
  ArrowLeft: 'l',
  KeyA: 'l',
  ArrowRight: 'r',
  KeyD: 'r',
  KeyQ: 'q',
  KeyE: 'e',
}

/** Slow is what makes a good map: slam_toolbox needs overlapping scans. */
const SPEEDS: { value: number; label: () => string }[] = [
  { value: 0.05, label: () => t('Very slow') },
  { value: 0.1, label: () => t('Slow') },
  { value: 0.15, label: () => t('Medium') },
  { value: 0.2, label: () => t('Fast') },
]
/** Turning is what blurs a scan most: on its own setting, slow by default (rad/s). */
const TURN_RATES: { value: number; label: () => string }[] = [
  { value: 0.2, label: () => t('Very slow') },
  { value: 0.35, label: () => t('Slow') },
  { value: 0.5, label: () => t('Medium') },
]
type DriveMode = 'pad' | 'joystick'
const DRIVE_MODE_KEY = 'warotrans.mapping.driveMode'
const readDriveMode = (): DriveMode => {
  try {
    return window.localStorage.getItem(DRIVE_MODE_KEY) === 'joystick' ? 'joystick' : 'pad'
  } catch {
    return 'pad'
  }
}
const TRAIL_STEP_M = 0.05
const TRAIL_MAX = 4000

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : String(err))

/**
 * Configure → Facility → Build map → robot: drive the robot by hand while it builds the map, watch the map grow,
 * then save it as a draft map version (opened in the editor) or cancel.
 */
export function MappingPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const canWrite = auth.can(PERMISSIONS.mapWrite)
  const canDriveByHand = auth.can(PERMISSIONS.robotManualDrive)

  const sessionQuery = useQuery({
    queryKey: mappingSessionKey(sessionId),
    queryFn: () => getMappingSession(sessionId),
    refetchInterval: (query) => (query.state.data && !isOpenMappingSession(query.state.data.status) ? false : 1000),
  })
  const session = sessionQuery.data
  const status = session?.status ?? 'STARTING'
  const actions = mappingActions(status)

  const previewQuery = useQuery({
    queryKey: mappingPreviewKey(sessionId),
    queryFn: () => getMappingPreview(sessionId),
    refetchInterval: actions.closed ? false : 1000,
    enabled: Boolean(session) && !actions.closed,
  })
  const preview = previewQuery.data

  // The grid comes every ~2 s; decode it once per new grid.
  const [grid, setGrid] = useState<MappingGrid | null>(null)
  const [gridError, setGridError] = useState<string | null>(null)
  const mapReceivedAt = preview?.mapReceivedAt ?? null
  const mapMessage = preview?.map ?? null
  useEffect(() => {
    if (!mapMessage) return
    let cancelled = false
    decodeGrid(mapMessage).then(
      (decoded) => {
        if (cancelled) return
        setGrid(decoded)
        setGridError(null)
      },
      (err) => !cancelled && setGridError(errorText(err)),
    )
    return () => {
      cancelled = true
    }
    // mapReceivedAt identifies a new grid; the object itself is new on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReceivedAt])

  // Trail of where the robot drove (client side, this page view only).
  const [trail, setTrail] = useState<MappingPose[]>([])
  // "Scan again" moves this page to a new session: start from an empty view.
  useEffect(() => {
    setGrid(null)
    setGridError(null)
    setTrail([])
  }, [sessionId])
  const pose = preview?.pose ?? null
  useEffect(() => {
    if (!pose) return
    setTrail((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.hypot(last.x - pose.x, last.y - pose.y) < TRAIL_STEP_M) return prev
      const next = [...prev, pose]
      return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next
    })
  }, [pose])

  // ------------------------------------------------------------------ manual drive (only while MAPPING)
  const robotId = session?.robotId ?? null
  const driving = actions.canDrive && canDriveByHand
  const lease = useManualLease(robotId, driving)
  const canDrive = driving && lease.heldByMe && Boolean(session?.robotOnline)
  const drive = useTeleopLoop(robotId, true)
  const { set: driveSet, stop: driveStop } = drive
  const [speed, setSpeed] = useState(0.1)
  const [turnRate, setTurnRate] = useState(0.35)
  const [driveMode, setDriveModeState] = useState<DriveMode>(readDriveMode)
  const setDriveMode = (mode: DriveMode) => {
    setDriveModeState(mode)
    try {
      window.localStorage.setItem(DRIVE_MODE_KEY, mode)
    } catch {
      // per-viewer convenience only
    }
  }
  const [command, setCommand] = useState<[number, number]>([0, 0])
  const [keyMove, setKeyMove] = useState<string | null>(null)
  const steer = useCallback(
    (forward: number, turn: number) => {
      if (!canDrive) {
        setCommand([0, 0])
        return driveStop()
      }
      const next: [number, number] = [forward * speed, turn * turnRate]
      setCommand(next)
      driveSet(...next)
    },
    [canDrive, driveSet, driveStop, speed, turnRate],
  )
  useEffect(() => {
    if (!canDrive) driveStop()
  }, [canDrive, driveStop])

  const pressed = useRef(new Set<string>())
  useEffect(() => {
    if (!canDrive) return
    const apply = () => {
      const move = keysToMove((k) => pressed.current.has(k))
      setKeyMove(move.key)
      steer(move.forward, move.turn)
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
        setKeyMove(null)
        setCommand([0, 0])
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

  // ------------------------------------------------------------------ finish / cancel
  const [name, setName] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: mappingSessionKey(sessionId) })
  const finish = useMutation({
    mutationFn: () => finishMappingSession(sessionId, name),
    onMutate: () => driveStop(),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: () => cancelMappingSession(sessionId),
    onMutate: () => driveStop(),
    onSuccess: refresh,
  })

  // Scan again: throw the map away, the robot restarts slam_toolbox where it stands, a new session opens.
  const rescan = useMutation({
    mutationFn: () => {
      if (!session) throw new Error('no session')
      return rescanMapping(session)
    },
    onMutate: () => driveStop(),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ['mapping'] })
      navigate(`/configure/facility/mapping/${next.id}`, { replace: true })
    },
  })
  const askRescan = () => {
    if (window.confirm(t('Scan again from the start? The map built so far is thrown away; the new map starts where the robot stands now.'))) {
      rescan.mutate()
    }
  }

  // Saved while this page watched: open the new draft in the editor.
  const sawSaving = useRef(false)
  useEffect(() => {
    if (status === 'SAVING') sawSaving.current = true
    if (status === 'COMPLETED' && sawSaving.current && session?.resultMapVersionId) {
      const id = session.resultMapVersionId
      const timer = window.setTimeout(() => navigate(`/configure/facility/maps/${id}/edit`), 1500)
      return () => window.clearTimeout(timer)
    }
  }, [status, session?.resultMapVersionId, navigate])

  if (sessionQuery.isLoading) {
    return <p className="p-10 text-sm text-muted">{t('Loading…')}</p>
  }
  if (sessionQuery.isError || !session) {
    return (
      <div className="p-10">
        <p className="text-sm text-red">{sessionQuery.error ? errorText(sessionQuery.error) : t('The mapping session was not found.')}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/configure/facility')}>{t('Back to Facility')}</Button>
      </div>
    )
  }

  const area = grid?.knownAreaM2 ?? session.knownAreaM2
  const stale = preview?.receivedAt ? Date.now() - new Date(preview.receivedAt).getTime() > 5000 : true

  return (
    <div className="flex h-full min-h-0">
      <section className="relative min-w-0 flex-1 bg-container">
        <MappingCanvas grid={grid} pose={pose} trail={trail} />
        {!grid ? (
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface px-4 py-2 text-sm text-ink-2 shadow-float">
            {status === 'STARTING' ? t('The robot is starting the map…') : actions.closed ? t('No live map for a closed session.') : t('Waiting for the first map from the robot…')}
          </p>
        ) : null}
        {gridError ? <p className="absolute bottom-4 left-4 rounded bg-red-soft px-3 py-1 text-xs text-red-ink">{gridError}</p> : null}
        {actions.canDrive && stale ? (
          <p className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-soft px-4 py-2 text-sm text-amber-ink shadow-float">
            {t('No live view from the robot for a few seconds.')}
          </p>
        ) : null}
      </section>

      <aside className="flex w-[360px] shrink-0 flex-col gap-5 overflow-auto border-l border-outline-soft bg-surface p-6">
        <div>
          <button type="button" className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink" onClick={() => navigate('/configure/facility')}>
            <Icon name="arrowLeft" size={14} /> {t('Facility')}
          </button>
          <h1 className="mt-3 text-2xl font-book">{t('Build a map')}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={STATUS_TONE[status]} withDot>{STATUS_TEXT[status]()}</StatusBadge>
            <span className="text-sm font-medium">{session.robotCode}</span>
            {!session.robotOnline ? <StatusBadge tone="grey">{t('Offline')}</StatusBadge> : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-2">{t('Time')}</dt>
          <dd>{formatElapsed(preview?.elapsedSec)}</dd>
          <dt className="text-ink-2">{t('Area mapped')}</dt>
          <dd>{area != null ? `${area.toFixed(1)} m²` : '—'}</dd>
          <dt className="text-ink-2">{t('Map size')}</dt>
          <dd>{mapMessage ? `${mapMessage.fullWidth} × ${mapMessage.fullHeight}` : '—'}</dd>
          <dt className="text-ink-2">{t('Started')}</dt>
          <dd>{formatDateTime(session.startedAt)}</dd>
        </dl>

        {session.errorMessage ? (
          <p className={cx('rounded px-3 py-2 text-sm', status === 'FAILED' ? 'bg-red-soft text-red-ink' : 'bg-amber-soft text-amber-ink')}>
            {session.errorMessage}
            {session.errorCode ? <span className="mt-1 block text-xs opacity-70">{session.errorCode}</span> : null}
          </p>
        ) : null}

        {actions.canDrive ? (
          <section className="flex flex-col items-center gap-3">
            {!canDriveByHand ? (
              <p className="text-sm text-amber-ink">{t('You may not drive robots by hand.')}</p>
            ) : lease.error ? (
              <p className="text-sm text-red">{lease.error}</p>
            ) : !lease.heldByMe ? (
              <p className="text-sm text-muted">{t('Taking the manual-drive lease…')}</p>
            ) : null}
            <div className="flex w-full rounded-lg border border-outline-soft p-0.5 text-sm" role="tablist" aria-label={t('Drive control')}>
              {(['pad', 'joystick'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={driveMode === mode}
                  className={cx('flex-1 rounded-md px-2 py-1', driveMode === mode ? 'bg-ink text-white' : 'text-ink-2 hover:bg-container-high')}
                  onClick={() => setDriveMode(mode)}
                >
                  {mode === 'pad' ? t('Buttons') : t('Joystick')}
                </button>
              ))}
            </div>
            {driveMode === 'pad' ? (
              <MappingDrivePad disabled={!canDrive} keyboardActive={keyMove} onChange={steer} />
            ) : (
              <Joystick disabled={!canDrive} onChange={steer} />
            )}
            <p className="text-sm tabular-nums text-ink-2" aria-live="polite">
              {command[0] === 0 && command[1] === 0
                ? t('Stopped')
                : t('Driving {linear} m/s, turning {angular} rad/s', {
                    linear: command[0].toFixed(2),
                    angular: command[1].toFixed(2),
                  })}
            </p>
            <ChipRow label={t('Driving speed')} options={SPEEDS} value={speed} unit="m/s" onChange={setSpeed} />
            <ChipRow label={t('Turning speed')} options={TURN_RATES} value={turnRate} unit="rad/s" onChange={setTurnRate} />
            {drive.error ? <p className="text-xs text-red">{drive.error}</p> : null}
            <p className="text-xs text-muted">
              {t('Hold a button to drive, let go to stop. Drive slowly along every wall, turn slowly on the spot, and come back to where you started (closing the loop sharpens the map). Keys: arrows / WASD drive, Q / E turn on the spot, Space stops. Drive Assist stops the robot before obstacles.')}
            </p>
          </section>
        ) : null}

        {actions.waiting ? (
          <p className="rounded bg-blue-soft px-3 py-2 text-sm text-blue-ink">
            {status === 'STARTING'
              ? t('The robot pauses its localization and starts slam_toolbox (up to 30 s).')
              : status === 'SAVING'
                ? t('The robot sends the map; it becomes a draft map version.')
                : t('The robot stops mapping and goes back to its map.')}
          </p>
        ) : null}

        {status === 'COMPLETED' ? (
          <div className="rounded bg-green-soft px-3 py-3 text-sm text-green-ink">
            <p>{t('Saved as draft map {code}.', { code: session.resultMapVersionCode ?? '' })}</p>
            <p className="mt-1">{t('The robot is not localized now: localize it again on its map before giving it work.')}</p>
            {session.resultMapVersionId ? (
              <Button className="mt-3" variant="primary" onClick={() => navigate(`/configure/facility/maps/${session.resultMapVersionId}/edit`)}>
                {t('Open in the map editor')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canWrite && (actions.canFinish || actions.canCancel || rescan.isPending) ? (
          <section className="mt-auto flex flex-col gap-3 border-t border-outline-soft pt-4">
            {actions.canFinish ? (
              <>
                <label className="text-sm text-ink-2">{t('Map name')}
                  <input
                    className={cx(controlClass(), 'mt-1 block w-full')}
                    value={name}
                    maxLength={200}
                    placeholder={t('e.g. Warehouse floor 1')}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <Button variant="primary" disabled={finish.isPending || !session.robotOnline} onClick={() => finish.mutate()}>
                  <Icon name="save" size={15} /> {t('Finish and save')}
                </Button>
              </>
            ) : null}
            {canRescan(status) ? (
              <Button variant="outline" disabled={rescan.isPending} onClick={askRescan}>
                <Icon name="refresh" size={15} /> {rescan.isPending ? t('Restarting the scan…') : t('Scan again')}
              </Button>
            ) : null}
            {actions.canCancel ? (
              <Button
                variant="ghost"
                disabled={cancel.isPending}
                onClick={() => {
                  if (window.confirm(t('Cancel map building? The map built so far is thrown away.'))) cancel.mutate()
                }}
              >{t('Cancel mapping')}</Button>
            ) : null}
            {finish.isError || cancel.isError || rescan.isError ? (
              <p className="text-sm text-red">{errorText(finish.error ?? cancel.error ?? rescan.error)}</p>
            ) : null}
          </section>
        ) : null}

        {actions.closed && canWrite && canRescan(status) ? (
          <Button variant="primary" disabled={rescan.isPending || !session.robotOnline} onClick={askRescan}>
            <Icon name="refresh" size={15} /> {rescan.isPending ? t('Restarting the scan…') : t('Scan again')}
          </Button>
        ) : null}
        {actions.closed && rescan.isError ? <p className="text-sm text-red">{errorText(rescan.error)}</p> : null}
        {actions.closed ? (
          <Button variant="outline" onClick={() => navigate('/configure/facility')}>{t('Back to Facility')}</Button>
        ) : null}
      </aside>
    </div>
  )
}


function ChipRow({
  label,
  options,
  value,
  unit,
  onChange,
}: {
  label: string
  options: { value: number; label: () => string }[]
  value: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <div className="w-full">
      <p className="mb-1 text-sm text-ink-2">{label}</p>
      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={cx(
              'rounded-md border px-1 py-1.5 text-xs leading-tight',
              value === option.value ? 'border-ink bg-ink text-white' : 'border-outline-soft text-ink-2 hover:bg-container-high',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label()}
            <span className="block tabular-nums opacity-70">
              {option.value.toFixed(2)} {unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
