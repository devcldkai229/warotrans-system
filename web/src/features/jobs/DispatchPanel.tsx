import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import type { DispatchCandidate } from '@/shared/api/contracts'
import { dispatchJob, enqueueJob, getDispatchCandidates, getDispatchDecisions, type JobDetailDto } from '@/shared/api/jobs'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { cx } from '@/shared/lib/cx'
import { formatBattery, formatClock, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'

const REASON_TEXT: Record<string, string> = {
  robot_disabled: 'Disabled',
  robot_offline: 'Offline',
  robot_in_maintenance: 'In maintenance',
  robot_not_available: 'Not available',
  robot_motion_held: 'Stopped (holding motion)',
  robot_in_manual_mode: 'Driven by hand',
  robot_map_mismatch: 'On another map',
  robot_not_localized: 'Not localized',
  robot_busy: 'Running another job',
  battery_low: 'Battery below dispatch minimum',
  battery_unknown: 'Battery unknown',
  battery_stale: 'Battery reading is old',
}

/**
 * WEB-TR-03 / FL-02: why each robot is (not) a candidate for this Job, and the last dispatch decision. Everything
 * shown is computed by the server (FL-01); dispatching asks the server again, so nothing here is invented.
 */
export function DispatchPanel({ job }: { job: JobDetailDto }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const canStart = (job.availableActions ?? []).some((a) => a.action === 'START' && a.allowed)
  const mayOverride = can(PERMISSIONS.dispatchOverride)

  const candidates = useQuery({
    queryKey: ['job', job.id, 'dispatch-candidates'],
    queryFn: () => getDispatchCandidates(job.id),
    refetchInterval: canStart ? 5000 : false,
  })
  const decisions = useQuery({
    queryKey: ['job', job.id, 'dispatch-decisions', job.status],
    queryFn: () => getDispatchDecisions(job.id),
  })
  const enqueue = useMutation({
    mutationFn: () => enqueueJob(job.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
  })
  const dispatch = useMutation({
    mutationFn: (body: { robotId?: string; overrideReason?: string }) => dispatchJob(job.id, body),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : 'Dispatch failed.'),
  })

  const last = decisions.data?.[0]
  const use = (candidate: DispatchCandidate) => {
    if (candidate.eligible) {
      dispatch.mutate({ robotId: candidate.robotId })
      return
    }
    const reason = window.prompt(
      `${candidate.robotCode}: ${candidate.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ')}. Why is it safe to use it anyway?`,
    )?.trim()
    if (reason) dispatch.mutate({ robotId: candidate.robotId, overrideReason: reason })
  }

  return (
    <section className="mt-4 rounded-lg border border-outline-soft bg-surface p-6 shadow-float">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-book">Dispatch</h2>
        <span className="text-xs text-muted">
          {last
            ? `Last decision ${formatClock(last.createdAt)} (${humanize(last.trigger)})${last.overrideReason ? `, override: ${last.overrideReason}` : ''}`
            : 'No decision yet'}
        </span>
      </header>

      {canStart ? (
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={dispatch.isPending} onClick={() => dispatch.mutate({})}>
            Dispatch to best robot
          </Button>
          {job.status === 'CREATED' ? (
            <Button size="sm" variant="ghost" disabled={enqueue.isPending} onClick={() => enqueue.mutate()}>
              Go when a robot is free
            </Button>
          ) : null}
          {error ? <span className="text-xs text-red-ink">{error}</span> : null}
        </div>
      ) : null}
      {job.status === 'QUEUED' ? (
        <p className="mt-2 text-xs text-ink-2">
          Waiting in the queue{job.priority ? ` (${job.priority > 0 ? 'high' : 'low'} priority)` : ''}.
          {job.blockingReason ? ` Not started yet: ${job.blockingReason}` : ''}
        </p>
      ) : null}

      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 font-normal">Robot</th>
            <th className="py-1 font-normal">Battery</th>
            <th className="py-1 font-normal">Distance</th>
            <th className="py-1 font-normal">Score</th>
            <th className="py-1 font-normal">Eligibility</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(candidates.data ?? []).map((c) => {
            const chosen = last?.type === 'SELECTED' && last.selectedRobotId === c.robotId
            return (
              <tr key={c.robotId} className={cx('border-t border-outline-soft', chosen && 'bg-blue-soft/40')}>
                <td className="py-2 font-mono">
                  {c.robotCode}
                  {chosen ? <span className="ml-2 text-xs text-blue-ink">selected</span> : null}
                </td>
                <td className="py-2 tabular-nums">
                  {formatBattery(c.batteryPercent)}
                  {c.batteryState === 'STALE' ? <span className="ml-1 text-xs text-muted">(old)</span> : null}
                </td>
                <td className="py-2 tabular-nums">{c.distanceMeters === null ? '—' : `${c.distanceMeters.toFixed(1)} m`}</td>
                <td className="py-2 tabular-nums">{c.eligible && c.score !== null ? c.score.toFixed(2) : '—'}</td>
                <td className="py-2">
                  {c.eligible ? (
                    <StatusBadge tone="green">Eligible</StatusBadge>
                  ) : (
                    <span className="text-xs text-red-ink">{c.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ')}</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {canStart && (c.eligible || (c.overridable && mayOverride)) ? (
                    <Button size="sm" variant={c.eligible ? 'surface' : 'ghost'} disabled={dispatch.isPending} onClick={() => use(c)}>
                      {c.eligible ? 'Use' : 'Override'}
                    </Button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {candidates.data?.length === 0 ? <p className="mt-2 text-sm text-muted">No robot on this map.</p> : null}
    </section>
  )
}
