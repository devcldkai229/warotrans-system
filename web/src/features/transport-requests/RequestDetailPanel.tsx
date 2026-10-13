import type { TransportRequestView } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { formatDateTimeWithYear, formatDuration, secondsBetween } from '@/shared/lib/format'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, REQUEST_DETAIL_STATUS_TONE, REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { detailProgress } from './derive'
import { Drawer, DrawerHeading, FailureNote, LineItem, MetaList, MetaRow } from './panelParts'

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
    <Drawer
      label={`${request.requestCode} detail`}
      kind="Transport request"
      code={request.requestCode}
      status={request.status}
      tone={REQUEST_STATUS_TONE[request.status]}
      onClose={onClose}
    >
      <div className="mb-5 flex flex-col gap-2 text-xs text-muted">
        <Meter percent={progress.percent} tone="blue" />
        <span>
          {progress.done} of {progress.total} containers delivered
        </span>
      </div>

      <MetaList>
        <MetaRow label="Workflow">{request.workflowName}</MetaRow>
        <MetaRow label="Requested by">{request.requestedByName}</MetaRow>
        <MetaRow label="Submitted">{formatDateTimeWithYear(request.submittedAt)}</MetaRow>
        <MetaRow label="Queued">{formatDateTimeWithYear(request.queuedAt)}</MetaRow>
        <MetaRow label={request.completedAt ? 'Finished' : 'Elapsed'}>
          {request.completedAt ? formatDateTimeWithYear(request.completedAt) : elapsed === null ? '—' : formatDuration(elapsed)}
        </MetaRow>
        {request.note ? <MetaRow label="Note">{request.note}</MetaRow> : null}
      </MetaList>

      {request.failureMessage ? <FailureNote>{request.failureMessage}</FailureNote> : null}

      <DrawerHeading>Movement plan</DrawerHeading>
      <ol>
        {request.details.map((detail) => (
          <LineItem
            key={detail.id}
            sequence={detail.sequenceNo}
            title={detail.containerBarcode}
            code
            note={`${detail.sourceLabel} → ${detail.destinationLabel}`}
            status={detail.status}
            tone={REQUEST_DETAIL_STATUS_TONE[detail.status]}
          />
        ))}
      </ol>

      <DrawerHeading>Jobs ({request.jobs.length})</DrawerHeading>
      {request.jobs.length === 0 ? (
        <p className="text-xs text-muted">No job has been planned for this request yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {request.jobs.map((job) => (
            <li key={job.jobNo}>
              <button
                type="button"
                className={cx(
                  'flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left transition-colors duration-200',
                  selectedJobNo === job.jobNo ? 'bg-container-high ring-2 ring-ink' : 'bg-container hover:bg-container-high',
                )}
                aria-pressed={selectedJobNo === job.jobNo}
                onClick={() => onSelectJob(job.jobNo)}
              >
                <span className="flex min-w-0 flex-1 flex-col text-xs">
                  <strong className="font-mono font-medium">{job.jobNo}</strong>
                  <span className="text-muted">{job.robotCode ?? 'Unassigned'}</span>
                </span>
                <StatusBadge tone={JOB_STATUS_TONE[job.status]}>{job.status}</StatusBadge>
                <Icon name="chevronRight" size={14} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
