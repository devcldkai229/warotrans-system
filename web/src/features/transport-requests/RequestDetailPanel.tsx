import type { TransportRequestView } from '@/shared/api/contracts'
import { formatDateTimeWithYear, formatDuration, secondsBetween } from '@/shared/lib/format'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, REQUEST_DETAIL_STATUS_TONE, REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { detailProgress } from './derive'

interface RequestDetailPanelProps {
  request: TransportRequestView
  selectedJobNo: string | null
  onSelectJob: (jobNo: string) => void
  onClose: () => void
}

/** Second column: everything about one Request. Its Jobs open a third column. */
export function RequestDetailPanel({ request, selectedJobNo, onSelectJob, onClose }: RequestDetailPanelProps) {
  const progress = detailProgress(request)
  const elapsed = secondsBetween(request.submittedAt, request.completedAt)

  return (
    <aside className="rpanel" aria-label={`${request.requestCode} detail`}>
      <header className="rpanel__head">
        <div>
          <small>Transport Request</small>
          <strong className="mono">{request.requestCode}</strong>
        </div>
        <StatusBadge tone={REQUEST_STATUS_TONE[request.status]}>{request.status}</StatusBadge>
        <button type="button" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>

      <div className="rpanel__scroll">
        <div className="rpanel__progress">
          <div className="jcard__bar">
            <i style={{ width: `${progress.percent}%` }} />
          </div>
          <span>
            {progress.done}/{progress.total} containers delivered
          </span>
        </div>

        <dl className="rpanel__meta">
          <div>
            <dt>Workflow</dt>
            <dd>{request.workflowName}</dd>
          </div>
          <div>
            <dt>Requested by</dt>
            <dd>{request.requestedByName}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDateTimeWithYear(request.submittedAt)}</dd>
          </div>
          <div>
            <dt>Queued</dt>
            <dd>{formatDateTimeWithYear(request.queuedAt)}</dd>
          </div>
          <div>
            <dt>{request.completedAt ? 'Finished' : 'Elapsed'}</dt>
            <dd>{request.completedAt ? formatDateTimeWithYear(request.completedAt) : elapsed === null ? '—' : formatDuration(elapsed)}</dd>
          </div>
          {request.note ? (
            <div>
              <dt>Note</dt>
              <dd>{request.note}</dd>
            </div>
          ) : null}
        </dl>

        {request.failureMessage ? <p className="rpanel__failure">{request.failureMessage}</p> : null}

        <h4>Movement plan</h4>
        <ol className="rpanel__lines">
          {request.details.map((detail) => (
            <li key={detail.id}>
              <span className="rpanel__seq">{detail.sequenceNo}</span>
              <span className="rpanel__line">
                <strong className="mono">{detail.containerBarcode}</strong>
                <small>
                  {detail.sourceLabel} → {detail.destinationLabel}
                </small>
              </span>
              <StatusBadge tone={REQUEST_DETAIL_STATUS_TONE[detail.status]}>{detail.status}</StatusBadge>
            </li>
          ))}
        </ol>

        <h4>Jobs ({request.jobs.length})</h4>
        {request.jobs.length === 0 ? (
          <p className="rpanel__none">No Job has been planned for this request yet.</p>
        ) : (
          <ul className="rpanel__jobs">
            {request.jobs.map((job) => (
              <li key={job.jobNo}>
                <button
                  type="button"
                  className={selectedJobNo === job.jobNo ? 'is-selected' : undefined}
                  onClick={() => onSelectJob(job.jobNo)}
                >
                  <span>
                    <strong className="mono">{job.jobNo}</strong>
                    <small>{job.robotCode ?? 'Unassigned'}</small>
                  </span>
                  <StatusBadge tone={JOB_STATUS_TONE[job.status]}>{job.status}</StatusBadge>
                  <Icon name="chevronRight" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
