import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import type { DispatchCandidate } from '@/shared/api/contracts'
import { dispatchJob, getDispatchCandidates, getDispatchDecisions, type JobDetailDto } from '@/shared/api/jobs'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { cx } from '@/shared/lib/cx'
import { formatBattery, formatClock, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { t } from '@/shared/i18n'
const REASON_TEXT: Record<string, string> = {

  robot_disabled: t('Disabled'),
  robot_offline: t('Offline'),
  robot_in_maintenance: t('In maintenance'),
  robot_not_available: t('Not available'),
  robot_motion_held: t('Stopped (holding motion)'),
  robot_in_manual_mode: t('Driven by hand'),
  robot_map_mismatch: t('On another map'),
  robot_not_localized: t('Not localized'),
  robot_busy: t('Running another job'),
  battery_low: t('Battery below dispatch minimum'),
  battery_unknown: t('Battery unknown'),
  battery_stale: t('Battery reading is old'),
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
  const dispatch = useMutation({
    mutationFn: (body: { robotId?: string; overrideReason?: string }) => dispatchJob(job.id, body),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('Dispatch failed.')),
  })

  const last = decisions.data?.[0]
  const use = (candidate: DispatchCandidate) => {
    if (candidate.eligible) {
      dispatch.mutate({ robotId: candidate.robotId })
      return
    }
    const reason = window.prompt(
      t('{robotCode}: {value}. Why is it safe to use it anyway?', { robotCode: candidate.robotCode, value: candidate.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ') }),
    )?.trim()
    if (reason) dispatch.mutate({ robotId: candidate.robotId, overrideReason: reason })
  }

  return (
    <section className="mt-4 rounded-lg border border-outline-soft bg-surface p-6 shadow-float">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-book">{t('Dispatch')}</h2>
        <span className="text-xs text-muted">
          {last
            ? t('Last decision {value} ({value2}){value3}', { value: formatClock(last.createdAt), value2: humanize(last.trigger), value3: last.overrideReason ? `, override: ${last.overrideReason}` : '' })
            : t('No decision yet')}
        </span>
      </header>

      {canStart ? (
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={dispatch.isPending} onClick={() => dispatch.mutate({})}>{t('Dispatch to best robot')}</Button>
          {error ? <span className="text-xs text-red-ink">{error}</span> : null}
        </div>
      ) : null}

      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 font-normal">{t('Robot')}</th>
            <th className="py-1 font-normal">{t('Battery')}</th>
            <th className="py-1 font-normal">{t('Distance')}</th>
            <th className="py-1 font-normal">{t('Score')}</th>
            <th className="py-1 font-normal">{t('Eligibility')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(candidates.data ?? []).map((c) => {
            const chosen = last?.selectedRobotId === c.robotId
            return (
              <tr key={c.robotId} className={cx('border-t border-outline-soft', chosen && 'bg-blue-soft/40')}>
                <td className="py-2 font-mono">
                  {c.robotCode}
                  {chosen ? <span className="ml-2 text-xs text-blue-ink">{t('selected')}</span> : null}
                </td>
                <td className="py-2 tabular-nums">
                  {formatBattery(c.batteryPercent)}
                  {c.batteryState === 'STALE' ? <span className="ml-1 text-xs text-muted">{t('(old)')}</span> : null}
                </td>
                <td className="py-2 tabular-nums">{c.distanceMeters === null ? '—' : `${c.distanceMeters.toFixed(1)} m`}</td>
                <td className="py-2 tabular-nums">{c.eligible && c.score !== null ? c.score.toFixed(2) : '—'}</td>
                <td className="py-2">
                  {c.eligible ? (
                    <StatusBadge tone="green">{t('Eligible')}</StatusBadge>
                  ) : (
                    <span className="text-xs text-red-ink">{c.reasons.map((r) => REASON_TEXT[r] ?? r).join(', ')}</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {canStart && (c.eligible || (c.overridable && mayOverride)) ? (
                    <Button size="sm" variant={c.eligible ? 'surface' : 'ghost'} disabled={dispatch.isPending} onClick={() => use(c)}>
                      {c.eligible ? t('Use') : t('Override')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {candidates.data?.length === 0 ? <p className="mt-2 text-sm text-muted">{t('No robot on this map.')}</p> : null}
    </section>
  )
}
