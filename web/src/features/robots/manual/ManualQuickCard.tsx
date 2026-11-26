import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RobotView } from '@/shared/api/contracts'
import { ApiError } from '@/shared/api/client'
import { cancelRobotCommand, navigateRobot } from '@/shared/api/fleet'
import { listEndpoints } from '@/shared/api/navigation'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { Joystick } from './Joystick'
import { useManualLease } from './useManualLease'
import { useTeleopLoop } from './useTeleopLoop'

const KEYS: Record<string, 'f' | 'b' | 'l' | 'r'> = {
  ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
}
const MAX_LINEAR = 0.15
const MAX_ANGULAR = 0.6

const errorText = (failure: unknown) => (failure instanceof ApiError || failure instanceof Error ? failure.message : String(failure))

/**
 * Manual control on the main Fleet screen, without leaving the map: send the robot to an endpoint (Nav2 plans and
 * drives, traffic rules apply), cancel what it is doing, or drive it by hand with the stick / arrow keys (manual lease,
 * Drive Assist on). The full-screen page (camera, click on the map) stays one click away.
 */
export function ManualQuickCard({
  robot,
  mayCommand,
  mayDrive,
  onFullScreen,
}: {
  robot: RobotView
  mayCommand: boolean
  mayDrive: boolean
  onFullScreen?: () => void
}) {
  const queryClient = useQueryClient()
  const [endpointId, setEndpointId] = useState('')
  const [driving, setDriving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const endpoints = useQuery({
    queryKey: ['map-endpoints', robot.currentMapVersionId],
    queryFn: () => listEndpoints(robot.currentMapVersionId),
    enabled: Boolean(robot.currentMapVersionId) && mayCommand,
    staleTime: 60_000,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['robot', robot.id] })
    void queryClient.invalidateQueries({ queryKey: ['fleet-robots'] })
  }
  const go = useMutation({
    mutationFn: () => {
      const target = endpoints.data?.find((e) => e.id === endpointId)
      if (!target) throw new Error(t('Choose where to send the robot.'))
      return navigateRobot(robot.id, { x: target.x, y: target.y, yaw: target.yaw ?? 0 })
    },
    onSuccess: () => {
      setMessage(t('Sent. The robot plans its path and follows the traffic rules.'))
      refresh()
    },
    onError: (failure) => setMessage(errorText(failure)),
  })
  const cancel = useMutation({
    mutationFn: () => cancelRobotCommand(robot.id),
    onSuccess: () => {
      setMessage(t('Cancel sent.'))
      refresh()
    },
    onError: (failure) => setMessage(errorText(failure)),
  })

  const lease = useManualLease(robot.id, driving)
  const canDrive = driving && lease.heldByMe && robot.isOnline && robot.isEnabled && !robot.currentCommandId && !robot.motionHeld
  const drive = useTeleopLoop(robot.id, true)
  const { set: driveSet, stop: driveStop } = drive
  const steer = useCallback(
    (forward: number, turn: number) => (canDrive ? driveSet(forward * MAX_LINEAR, turn * MAX_ANGULAR) : driveStop()),
    [canDrive, driveSet, driveStop],
  )
  useEffect(() => {
    if (!canDrive) driveStop()
  }, [canDrive, driveStop])

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
    const keys = pressed.current
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      keys.clear()
    }
  }, [canDrive, steer, driveStop])

  if (!mayCommand && !mayDrive) return null
  const offline = !robot.isOnline
  const busy = Boolean(robot.currentCommandId)
  const blocked = offline ? t('The robot is offline.') : robot.motionHeld ? t('The robot holds motion: resume it first.') : null

  return (
    <section className="mb-6 rounded-md bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('Manual control')}</h2>
        {onFullScreen && mayDrive ? (
          <Button size="sm" variant="ghost" onClick={onFullScreen}>{t('Full screen (map, camera)')}</Button>
        ) : null}
      </div>
      {blocked ? <p className="mt-1 text-xs text-amber-ink">{blocked}</p> : null}

      {mayCommand ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs text-muted" htmlFor={`go-${robot.id}`}>{t('Send it to')}</label>
          <div className="flex gap-2">
            <select
              id={`go-${robot.id}`}
              className={controlClass('sm', 'flex-1')}
              value={endpointId}
              onChange={(event) => setEndpointId(event.target.value)}
            >
              <option value="">{t('Choose an endpoint…')}</option>
              {(endpoints.data ?? [])
                .filter((e) => e.isEnabled !== false)
                .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code))
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name || e.code}</option>
                ))}
            </select>
            <Button size="sm" variant="primary" disabled={!endpointId || go.isPending || Boolean(blocked) || busy} onClick={() => go.mutate()}>
              {t('Go')}
            </Button>
            <Button size="sm" variant="outline" disabled={!busy || cancel.isPending || offline} onClick={() => cancel.mutate()}>
              {t('Cancel move')}
            </Button>
          </div>
        </div>
      ) : null}

      {mayDrive ? (
        <div className="mt-4 border-t border-outline-soft pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-2">{t('Drive by hand (Drive Assist on, max {speed} m/s). Arrow keys / WASD, Space stops.', { speed: MAX_LINEAR })}</p>
            <Button size="sm" variant={driving ? 'danger' : 'tonal'} disabled={!driving && (Boolean(blocked) || busy)} onClick={() => setDriving((on) => !on)}>
              {driving ? t('Stop driving') : t('Take control')}
            </Button>
          </div>
          {driving ? (
            <div className="mt-3 flex flex-col items-center gap-2">
              {lease.error ? <p className="text-xs text-red-ink">{lease.error}</p> : null}
              {!lease.heldByMe && !lease.error ? <p className="text-xs text-muted">{t('Taking control…')}</p> : null}
              <Joystick disabled={!canDrive} onChange={steer} />
              {drive.error ? <p className="text-xs text-red-ink">{drive.error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-3 text-xs text-ink-2">{message}</p> : null}
    </section>
  )
}
