import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { JobProblem, ProblemTone } from './failureCatalog'

const ACCENT: Record<ProblemTone, string> = {
  red: 'border-l-red bg-red-soft/40',
  amber: 'border-l-amber bg-amber-soft/40',
  grey: 'border-l-outline bg-container',
}

/**
 * SY-08: why a Job is stuck or failed, who has to act and what is safe to do next, in plain words. The machine code and
 * the server's own message stay underneath for whoever supports the system.
 */
export function FailureExplanation({
  problem,
  message,
  className,
}: {
  problem: JobProblem
  /** The backend's own wording (a Job's failureMessage), shown as technical detail. */
  message?: string | null
  className?: string
}) {
  const detail = [problem.code, message].filter(Boolean).join(' · ')

  return (
    <section role="status" aria-label={problem.title} className={cx('rounded-md border-l-4 p-4', ACCENT[problem.tone], className)}>
      <h2 className="text-base font-medium">{problem.title}</h2>
      <p className="mt-1 text-sm text-ink-2">{problem.meaning}</p>

      <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {problem.owners.length > 0 ? (
          <>
            <dt className="text-muted">{t('Who acts')}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {problem.owners.map((owner) => (
                <StatusBadge key={owner} tone="blue">
                  {owner}
                </StatusBadge>
              ))}
            </dd>
          </>
        ) : null}
        <dt className="text-muted">{t('What to do')}</dt>
        <dd>
          {problem.next}
          {problem.retry ? <span className="mt-0.5 block text-xs text-ink-2">{problem.retry}</span> : null}
        </dd>
      </dl>

      {detail ? <p className="mt-3 font-mono text-[11px] break-words text-muted">{detail}</p> : null}
    </section>
  )
}
