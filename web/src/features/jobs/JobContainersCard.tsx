import { Link } from 'react-router-dom'
import type { Issue } from '@/shared/api/operations'
import type { JobDetailDto } from '@/shared/api/jobs'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatClock, humanize } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { problemLabel } from '@/features/operations/containerProblems'
import { handoverOf, isBlocking, isOpenIssue, issuesOf, type HandoverView } from './jobContainerView'

const SOURCE_TEXT: Record<string, string> = { STAFF_APP: 'App', ROBOT_BUTTON: t('robot button'), WEB: 'Web' }

/** A confirmation is an event of the run: done (green tick, who, when, how) or still to come. */
function HandoverCell({ handover, failed }: { handover: HandoverView | null; failed: boolean }) {
  if (!handover) return <span className="text-muted">—</span>
  if (handover.status === 'COMPLETED') {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 font-medium text-green-ink">
          <Icon name="check" size={13} strokeWidth={2.5} /> {formatClock(handover.confirmedAt)}
        </span>
        <span className="text-muted">
          {[handover.confirmedBy, handover.source ? (SOURCE_TEXT[handover.source] ?? humanize(handover.source)) : null].filter(Boolean).join(' · ') || '—'}
        </span>
        {handover.scannedBarcode ? <span className="font-mono text-muted">{t('scanned')} {handover.scannedBarcode}</span> : null}
      </span>
    )
  }
  if (failed || handover.status === 'SKIPPED' || handover.status === 'CANCELLED') return <span className="text-muted">{t('not done')}</span>
  return <span className={handover.status === 'WAITING' ? 'font-medium text-amber-ink' : 'text-muted'}>{handover.status === 'WAITING' ? t('waiting now') : t('to come')}</span>
}

/** An issue is a record with its own life: red while it blocks a confirmation, amber while open, grey once dealt with. */
export function IssueChip({ issue }: { issue: Issue }) {
  const paths = usePaths()
  const blocking = isBlocking(issue)
  const open = isOpenIssue(issue)
  return (
    <Link
      to={paths.issues(issue.id)}
      title={issue.description}
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium hover:underline',
        blocking ? 'bg-red-soft text-red-ink' : open ? 'bg-amber-soft text-amber-ink' : 'bg-container-high text-ink-2',
      )}
    >
      <Icon name={blocking ? 'lock' : open ? 'alert' : 'check'} size={11} />
      <span className="truncate">
        {issue.code} · {problemLabel(issue.problemCode ?? issue.issueType)}
      </span>
      <span className="font-normal opacity-80">· {humanize(issue.status)}</span>
    </Link>
  )
}

/**
 * Every container of the Job on one line: where it is in the Job, its pickup and drop-off confirmations, and the issues
 * about it. A container held up by a blocking issue is marked in red: it is what keeps the robot waiting.
 */
export function JobContainersCard({
  job,
  issues,
  containerLabel,
}: {
  job: JobDetailDto
  issues: Issue[]
  containerLabel: (id: string | null | undefined) => string
}) {
  return (
    <section className="mt-4 rounded-lg border border-outline-soft bg-surface p-6 shadow-float">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-book">{t('Containers')}</h2>
        <span className="text-xs text-muted">{t('Confirmations are steps of the run; issues are reports with their own status.')}</span>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="text-muted">
            <tr className="border-b border-outline-soft">
              <th className="py-2 pr-3 font-normal">{t('Container')}</th>
              <th className="py-2 pr-3 font-normal">{t('In this job')}</th>
              <th className="py-2 pr-3 font-normal">{t('Pickup confirmed')}</th>
              <th className="py-2 pr-3 font-normal">{t('Drop-off confirmed')}</th>
              <th className="py-2 font-normal">{t('Issues')}</th>
            </tr>
          </thead>
          <tbody>
            {job.containers.map((container) => {
              const mine = issuesOf(issues, container.containerId)
              const blocked = mine.some(isBlocking)
              const failed = container.status === 'FAILED'
              return (
                <tr
                  key={container.id}
                  className={cx('border-b border-outline-soft align-top last:border-b-0', blocked && 'bg-red-soft/40')}
                >
                  <td className={cx('py-2.5 pr-3 pl-2', blocked ? 'border-l-4 border-l-red' : 'border-l-4 border-l-transparent')}>
                    <span className="font-mono text-sm font-medium">{containerLabel(container.containerId)}</span>
                    {blocked ? <p className="mt-0.5 font-medium text-red-ink">{t('Holding up the robot')}</p> : null}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge tone={JOB_CONTAINER_STATUS_TONE[container.status] ?? 'grey'}>{container.status}</StatusBadge>
                    {failed ? (
                      <p className="mt-1 max-w-[220px] text-red-ink">
                        <b className="font-medium">{problemLabel(container.failureCode)}</b>
                        {container.failureMessage ? `: ${container.failureMessage}` : ''}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3">
                    <HandoverCell handover={handoverOf(job, container.containerId, 'PICKUP_CONFIRM')} failed={failed} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <HandoverCell handover={handoverOf(job, container.containerId, 'DROPOFF_CONFIRM')} failed={failed} />
                  </td>
                  <td className="py-2.5">
                    {mine.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="flex flex-col items-start gap-1">
                        {mine.map((issue) => (
                          <IssueChip key={issue.id} issue={issue} />
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
