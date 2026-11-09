import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { acquireManualLease, releaseManualLease, type ManualLease } from '@/shared/api/fleet'

const RENEW_MS = 10_000

export interface ManualLeaseState {
  lease: ManualLease | null
  error: string | null
  /** Only the lease holder drives (RB-04); the server refuses everyone else's setpoints. */
  heldByMe: boolean
}

/**
 * RB-04: while `active`, holds the robot's exclusive manual-drive lease (30 s on the server), renews it every 10 s and
 * releases it when manual mode ends or the page closes. A second operator gets the holder's name instead of control.
 */
export function useManualLease(robotId: string | null, active: boolean): ManualLeaseState {
  const [lease, setLease] = useState<ManualLease | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!robotId || !active) return
    let cancelled = false

    const acquire = () =>
      acquireManualLease(robotId)
        .then((granted) => {
          if (cancelled) return
          setLease(granted)
          setError(null)
        })
        .catch((failure: unknown) => {
          if (cancelled) return
          setLease(null)
          setError(failure instanceof ApiError ? failure.message : 'The manual-drive lease could not be obtained.')
        })

    void acquire()
    const timer = setInterval(acquire, RENEW_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      setLease(null)
      void releaseManualLease(robotId).catch(() => {})
    }
  }, [robotId, active])

  return { lease, error, heldByMe: Boolean(active && lease?.heldByMe) }
}
