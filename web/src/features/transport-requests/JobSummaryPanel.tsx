import type { TransportRequestView } from '@/shared/api/contracts'
import { formatDuration, humanize } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { elapsedSeconds, stepProgress } from '../jobs/derive'
import { JOBS } from '../jobs/mock'
import { Drawer, DrawerHeading, FailureNote, LineItem, MetaList, MetaRow } from './panelParts'

interface JobSummaryPanelProps {
  jobRef: TransportRequestView['jobs'][number]
  onClose: () => void
  onOpenFull: () => void
}

/** Third column: one Job of the selected Request, with its steps. "Open full detail" goes to Job Detail. */
export function JobSummaryPanel({ jobRef, onClose, onOpenFull }: JobSummaryPanelProps) {
  const job = JOBS.find((item) => item.jobNo === jobRef.jobNo)
  const progress = job ? stepProgress(job) : null
  const elapsed = job ? elapsedSeconds(job) : null
  const steps = job?.tasks.flatMap((task) => task.steps) ?? []

  return (
    <Drawer
      label={`${jobRef.jobNo} summary`}
      kind="Job"
      code={jobRef.jobNo}
      status={jobRef.status}
      tone={JOB_STATUS_TONE[jobRef.status]}
      onClose={onClose}
    >
      <MetaList>
        <MetaRow label="Robot">
          {jobRef.robotCode ?? 'Unassigned'}
          {job?.assignedRobot ? `, ${job.assignedRobot.batteryPercent}% battery` : ''}
        </MetaRow>
        {job?.routeLabel ? <MetaRow label="Route">{job.routeLabel}</MetaRow> : null}
        {job?.container ? <MetaRow label="Container">{job.container.barcode}</MetaRow> : null}
        {elapsed !== null ? <MetaRow label="Elapsed">{formatDuration(elapsed)}</MetaRow> : null}
      </MetaList>

      {job && progress ? (
        <>
          <div className="mt-5 flex flex-col gap-2 text-xs text-muted">
            <Meter percent={progress.percent} tone="blue" />
            <span>
              {progress.done} of {progress.total} steps done
            </span>
          </div>

          {job.failureMessage ? <FailureNote>{job.failureMessage}</FailureNote> : null}

          <DrawerHeading>Steps</DrawerHeading>
          <ol>
            {steps.map((step) => (
              <LineItem
                key={step.id}
                sequence={step.sequenceNo}
                title={step.name}
                note={humanize(step.stepType)}
                status={step.status}
                tone={STEP_STATUS_TONE[step.status]}
              />
            ))}
          </ol>

          <Button variant="primary" block className="mt-6" onClick={onOpenFull}>
            Open full detail <Icon name="arrowRight" size={14} />
          </Button>
        </>
      ) : (
        <p className="mt-5 text-xs text-muted">Step detail for this job is not available yet.</p>
      )}
    </Drawer>
  )
}
