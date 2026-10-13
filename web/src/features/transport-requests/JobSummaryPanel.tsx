import type { TransportRequestView } from '@/shared/api/contracts'
import { formatDuration } from '@/shared/lib/format'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, STEP_STATUS_TONE } from '@/shared/ui/statusTones'
import { elapsedSeconds, stepProgress } from '../jobs/derive'
import { JOBS } from '../jobs/mock'

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
    <aside className="rpanel rpanel--job" aria-label={`${jobRef.jobNo} summary`}>
      <header className="rpanel__head">
        <div>
          <small>Job</small>
          <strong className="mono">{jobRef.jobNo}</strong>
        </div>
        <StatusBadge tone={JOB_STATUS_TONE[jobRef.status]}>{jobRef.status}</StatusBadge>
        <button type="button" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>

      <div className="rpanel__scroll">
        <dl className="rpanel__meta">
          <div>
            <dt>Robot</dt>
            <dd>
              {jobRef.robotCode ?? 'Unassigned'}
              {job?.assignedRobot ? ` · ${job.assignedRobot.batteryPercent}%` : ''}
            </dd>
          </div>
          {job?.routeLabel ? (
            <div>
              <dt>Route</dt>
              <dd>{job.routeLabel}</dd>
            </div>
          ) : null}
          {job?.container ? (
            <div>
              <dt>Container</dt>
              <dd>{job.container.barcode}</dd>
            </div>
          ) : null}
          {elapsed !== null ? (
            <div>
              <dt>Elapsed</dt>
              <dd>{formatDuration(elapsed)}</dd>
            </div>
          ) : null}
        </dl>

        {job && progress ? (
          <>
            <div className="rpanel__progress">
              <div className="jcard__bar">
                <i style={{ width: `${progress.percent}%` }} />
              </div>
              <span>
                {progress.done}/{progress.total} steps done
              </span>
            </div>

            {job.failureMessage ? <p className="rpanel__failure">{job.failureMessage}</p> : null}

            <h4>Steps</h4>
            <ol className="rpanel__lines">
              {steps.map((step) => (
                <li key={step.id}>
                  <span className="rpanel__seq">{step.sequenceNo}</span>
                  <span className="rpanel__line">
                    <strong>{step.name}</strong>
                    <small>{step.stepType}</small>
                  </span>
                  <StatusBadge tone={STEP_STATUS_TONE[step.status]}>{step.status}</StatusBadge>
                </li>
              ))}
            </ol>

            <button type="button" className="btn btn--primary btn--block rpanel__open" onClick={onOpenFull}>
              Open full detail <Icon name="arrowRight" size={14} />
            </button>
          </>
        ) : (
          <p className="rpanel__none">Step detail for this Job is not available yet.</p>
        )}
      </div>
    </aside>
  )
}
