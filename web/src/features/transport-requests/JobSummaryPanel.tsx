import { useQuery } from '@tanstack/react-query'
import type { JobStatus, TransportRequestView } from '@/shared/api/contracts'
import { getJob } from '@/shared/api/jobs'
import { formatDuration, humanize, secondsBetween } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { JOB_CONTAINER_STATUS_TONE, JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { FailureExplanation } from '@/features/jobs/FailureExplanation'
import { explainJobProblem } from '@/features/jobs/failureCatalog'
import { Drawer, DrawerHeading, LineItem, MetaList, MetaRow } from './panelParts'
import { t } from '@/shared/i18n'
const LIVE_JOB_STATUSES: JobStatus[] = ['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'PAUSED', 'REASSIGNING', 'RECOVERY_REQUIRED']

interface JobSummaryPanelProps {
  jobRef: TransportRequestView['jobs'][number]
  /** Id of the Job; null while the request's Job list has not loaded it yet. */
  jobId: string | null
  /** Barcodes of the request's Containers, by Container id. */
  containerBarcodes: ReadonlyMap<string, string>
  onClose: () => void
  /** Opens the Job detail page; absent while the job's id is not known yet. */
  onOpenFull?: () => void
}

/**
 * Third column: one Job of the selected Request, read from GET /jobs/{id} (same cache as the Job detail page), with a
 * button to its detail page. It polls while the Job is still live.
 */
export function JobSummaryPanel({ jobRef, jobId, containerBarcodes, onClose, onOpenFull }: JobSummaryPanelProps) {
  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data && LIVE_JOB_STATUSES.includes(query.state.data.status) ? 5000 : false),
  })
  const job = jobQuery.data
  const steps = job?.tasks.flatMap((task) => task.steps) ?? []
  const done = steps.filter((step) => step.status === 'COMPLETED').length
  const elapsed = job ? secondsBetween(job.startedAt, job.completedAt) : null
  const status = job?.status ?? jobRef.status

  return (
    <Drawer
      label={t('{jobNo} summary', { jobNo: jobRef.jobNo })}
      kind="Job"
      code={jobRef.jobNo}
      status={status}
      tone={JOB_STATUS_TONE[status]}
      onClose={onClose}
    >
      <MetaList>
        <MetaRow label={t('Robot')}>{jobRef.robotCode ?? t('Unassigned')}</MetaRow>
        {elapsed !== null ? <MetaRow label={t('Elapsed')}>{formatDuration(elapsed)}</MetaRow> : null}
      </MetaList>

      {job ? (
        <>
          <div className="mt-5 flex flex-col gap-2 text-xs text-muted">
            <Meter percent={steps.length === 0 ? 0 : (done / steps.length) * 100} tone="blue" />
            <span>{t('{done} of {length} steps done', { done, length: steps.length })}</span>
          </div>

          {explainJobProblem(job) ? <FailureExplanation problem={explainJobProblem(job)!} message={job.failureMessage} className="mt-4" /> : null}

          {job.containers.length > 0 ? (
            <>
              <DrawerHeading>{t('Containers')}</DrawerHeading>
              <ol>
                {job.containers.map((container) => (
                  <LineItem
                    key={container.id}
                    sequence={container.sequenceNo}
                    title={containerBarcodes.get(container.containerId) ?? container.containerId.slice(0, 8)}
                    code
                    note={container.deliveredAt ? t('Delivered') : container.loadedAt ? t('On the robot') : t('Waiting for pickup')}
                    status={container.status}
                    tone={JOB_CONTAINER_STATUS_TONE[container.status]}
                  />
                ))}
              </ol>
            </>
          ) : null}

          <DrawerHeading>{t('Steps')}</DrawerHeading>
          <ol>
            {steps.map((step, index) => (
              <LineItem
                key={step.id}
                sequence={index + 1}
                title={step.name}
                note={step.errorMessage ?? humanize(step.stepType)}
                status={step.status}
                tone={STEP_STATUS_TONE[step.status]}
              />
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-6 text-xs text-muted">
          {jobQuery.isError ? (
            <>{t('The job could not be loaded.{value}', { value: ' ' })}<button type="button" className="font-medium text-ink underline" onClick={() => void jobQuery.refetch()}>{t('Retry')}</button>
            </>
          ) : (
            t('Loading job…')
          )}
        </p>
      )}

      {onOpenFull ? (
        <Button variant="primary" block className="mt-6" onClick={onOpenFull}>{t('View job detail')}{' '}<Icon name="arrowRight" size={14} />
        </Button>
      ) : null}
    </Drawer>
  )
}
