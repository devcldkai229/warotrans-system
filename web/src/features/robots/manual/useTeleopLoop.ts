import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { teleopRobot } from '@/shared/api/fleet'

/** Setpoints repeat this often while the operator holds a direction; the robot stops ~0.5 s after the last one. */
const REPEAT_MS = 200

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : String(err))

/**
 * One teleop stream for every input (joystick, arrow buttons, keyboard, gamepad): `set(linear, angular)` with the
 * latest command, `{0, 0}` to stop. While non-zero it is re-sent every 200 ms; the change to zero is sent at once.
 * Stops on unmount, window blur and tab hide, so a lost pointer-up never leaves the robot driving.
 */
export function useTeleopLoop(robotId: string | null, assist: boolean) {
  const target = useRef<[number, number]>([0, 0])
  const timer = useRef<number | null>(null)
  const assistRef = useRef(assist)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    assistRef.current = assist
  }, [assist])

  const send = useCallback(
    (linear: number, angular: number) => {
      if (!robotId) return
      teleopRobot(robotId, linear, angular, assistRef.current).then(
        () => setError(null),
        (err) => setError(errorText(err)),
      )
    },
    [robotId],
  )

  const set = useCallback(
    (linear: number, angular: number) => {
      const [prevLinear, prevAngular] = target.current
      target.current = [linear, angular]
      const nowMoving = linear !== 0 || angular !== 0
      if (!nowMoving) {
        if (timer.current !== null) {
          window.clearInterval(timer.current)
          timer.current = null
        }
        if (prevLinear !== 0 || prevAngular !== 0) send(0, 0)
        setMoving(false)
        return
      }
      if (linear !== prevLinear || angular !== prevAngular) send(linear, angular)
      if (timer.current === null) {
        timer.current = window.setInterval(() => send(...target.current), REPEAT_MS)
      }
      setMoving(true)
    },
    [send],
  )

  const stop = useCallback(() => set(0, 0), [set])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stop()
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', onHide)
      stop()
    }
  }, [stop])

  return { set, stop, moving, error, clearError: () => setError(null) }
}
