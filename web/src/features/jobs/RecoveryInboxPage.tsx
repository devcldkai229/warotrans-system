import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import { getJobRecovery, listJobs } from '@/shared/api/jobs'
import { t } from '@/shared/i18n'
import { formatRelativeTime } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { actionState, PHASE_LABEL, PHASE_TONE } from './recoveryModel'

/**
 * Payload recoveries waiting for someone: every Job in RECOVERY_REQUIRED (robots in the reader's scope for a Technician),
 * where it stands and whether the next step is the reader's. A row opens the Job, where the recovery is worked.
 */
export function RecoveryInboxPage() {
  const paths = usePaths()
  const jobs = useQuery({
    queryKey: ['jobs', 'recovery-inbox'],
    queryFn: () => listJobs({ status: 'RECOVERY_REQUIRED', take: 50 }),
    refetchInterval: 10_000,
  })
  const items = jobs.data?.items ?? []
  const cases = useQueries({
    queries: items.map((job) => ({
      queryKey: ['job', job.id, 'recovery'],
      queryFn: () => getJobRecovery(job.id),
      refetchInterval: 10_000,
    })),
  })

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1000px] px-10 pt-8 pb-16">
        <SectionHead
          title={t('Payload recovery')}
          hint={t('Robots that failed with cargo on board. A technician assesses and secures the robot; the floor moves the cargo to a second robot.')}
        />
        <Table>
          <thead>
            <tr>
              <Th>{t('Job')}</Th>
              <Th>{t('Failed robot')}</Th>
              <Th>{t('Stage')}</Th>
              <Th>{t('Your turn')}</Th>
              <Th>{t('Opened')}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((job, i) => {
              const recovery = cases[i]?.data?.recovery ?? null
              const mine = (['ASSESS', 'SOURCE_EVACUATE', 'SOURCE_SECURE', 'ASSIGN', 'CONFIRM', 'CLAIM'] as const)
                .filter((a) => actionState(recovery, a).allowed)
              return (
                <Tr key={job.id}>
                  <Td className="align-top">
                    <Link className="font-medium underline-offset-2 hover:underline" to={paths.job(job.id)}>{job.jobNo}</Link>
                    <div className="text-xs text-muted">{job.containerCount} {t('container(s)')}</div>
                  </Td>
                  <Td className="align-top">{job.robotCode ?? '—'}</Td>
                  <Td className="align-top">
                    {recovery?.phase ? <StatusBadge tone={PHASE_TONE[recovery.phase]} withDot>{t(PHASE_LABEL[recovery.phase])}</StatusBadge> : '—'}
                  </Td>
                  <Td className="align-top text-xs">{mine.length > 0 ? mine.map((a) => a.replaceAll('_', ' ').toLowerCase()).join(', ') : '—'}</Td>
                  <Td tone="faint" className="align-top">{recovery ? formatRelativeTime(recovery.createdAt) : '—'}</Td>
                </Tr>
              )
            })}
            {jobs.isLoading ? <EmptyRow colSpan={5}>{t('Loading…')}</EmptyRow> : null}
            {!jobs.isLoading && items.length === 0 ? <EmptyRow colSpan={5}>{t('No robot is waiting for a payload recovery.')}</EmptyRow> : null}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
