import type { ReactNode } from 'react'
import type { TransportRequestTripView, TransportRequestView } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { formatDateTimeWithYear, formatDuration, secondsBetween } from '@/shared/lib/format'
import { Icon } from '@/shared/ui/Icon'
import { Meter } from '@/shared/ui/Meter'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE, REQUEST_DETAIL_STATUS_TONE, REQUEST_STATUS_TONE } from '@/shared/ui/statusTones'
import { MAX_CONTAINERS_PER_TRIP } from './constants'
import { detailProgress } from './derive'
import { Drawer, DrawerHeading, FailureNote, LineItem, MetaList, MetaRow } from './panelParts'
import { t } from '@/shared/i18n'
import { humanize } from '@/shared/lib/format'

const CONTAINER_IN_TRIP: Record<string, { label: string; tone: 'grey' | 'blue' | 'green' | 'red' }> = {
  PENDING: { label: 'Waiting for pickup', tone: 'grey' },
  ASSIGNED: { label: 'Waiting for pickup', tone: 'grey' },
  ONBOARD: { label: 'On the robot', tone: 'blue' },
  DELIVERED: { label: 'Delivered', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'grey' },
}

/** "Collect at INBOUND (3) → Deliver at SHELF-A-01 (2) · SHELF-B-01 (1)" */
function stopsLine(trip: TransportRequestTripView): string | null {
  const stops = [...(trip.stops ?? [])].sort((a, b) => a.sequenceNo - b.sequenceNo)
  if (stops.length === 0) return null
  const part = (action: string) =>
    stops
      .filter((stop) => stop.action === action)
      .map((stop) => `${stop.endpointCode ?? '—'} (${stop.containerCount})`)
      .join(' · ')
  const collect = part('PICKUP')
  const deliver = part('DROPOFF')
  return [collect ? t('Collect at {stops}', { stops: collect }) : null, deliver ? t('Deliver at {stops}', { stops: deliver }) : null]
    .filter(Boolean)
    .join(' → ')
}

function TripCard({
  trip,
  fallbackNo,
  total,
  selected,
  onSelect,
}: {
  trip: TransportRequestTripView
  fallbackNo: number
  total: number
  selected: boolean
  onSelect: () => void
}) {
  const waiting = trip.status === 'CREATED' || trip.status === 'QUEUED'
  const robot = trip.robotCode ?? (waiting ? t('Waiting for a free robot') : t('Unassigned'))
  const line = stopsLine(trip)
  return (
    <button
      type="button"
      className={cx(
        'flex w-full flex-col gap-2 rounded-md px-3.5 py-3 text-left transition-colors duration-200',
        selected ? 'bg-container-high ring-2 ring-blue' : 'bg-container hover:bg-container-high',
      )}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="flex items-center gap-2 text-xs">
        <strong className="font-medium">{t('Trip {no} of {total}', { no: trip.tripNo ?? fallbackNo, total })}</strong>
        <span className="font-mono text-muted">{trip.jobNo}</span>
        <span className="flex-1" />
        <StatusBadge tone={JOB_STATUS_TONE[trip.status]}>{trip.status}</StatusBadge>
        <Icon name="chevronRight" size={14} className="text-muted" />
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Icon name="navigate" size={13} /> {robot}
        {waiting && trip.blockingReason ? <span>· {humanize(trip.blockingReason)}</span> : null}
      </span>
      {line ? <span className="text-xs">{line}</span> : null}
      {trip.containers && trip.containers.length > 0 ? (
        <span className="flex flex-wrap gap-1.5">
          {trip.containers.map((container) => {
            const state = CONTAINER_IN_TRIP[container.status] ?? { label: container.status, tone: 'grey' as const }
            return (
              <StatusBadge key={container.containerId} tone={state.tone}>
                {`${container.barcode ?? container.containerId.slice(0, 8)} · ${t(state.label)}`}
              </StatusBadge>
            )
          })}
        </span>
      ) : null}
    </button>
  )
}
interface RequestDetailPanelProps {

  request: TransportRequestView
  selectedJobNo: string | null
  onSelectJob: (jobNo: string) => void
  onClose: () => void
  /** Run controls (queue, start on a robot, open the live view), shown under the summary. */
  actions?: ReactNode
}

/** Second column: everything about one Request. Its Jobs open a third column. */
export function RequestDetailPanel({ request, selectedJobNo, onSelectJob, onClose, actions }: RequestDetailPanelProps) {
  const progress = detailProgress(request)
  const elapsed = secondsBetween(request.submittedAt, request.completedAt)
  // Which trip carries each container, for the movement plan.
  const tripOf = new Map<string, number>()
  request.jobs.forEach((job, index) => {
    for (const container of job.containers ?? []) tripOf.set(container.containerId, job.tripNo ?? index + 1)
  })

  return (
    <Drawer
      label={t('{requestCode} detail', { requestCode: request.requestCode })}
      kind="Transport request"
      code={request.requestCode}
      status={request.status}
      tone={REQUEST_STATUS_TONE[request.status]}
      onClose={onClose}
    >
      <div className="mb-5 flex flex-col gap-2 text-xs text-muted">
        <Meter percent={progress.percent} tone="blue" />
        <span>{t('{done} of {total} containers delivered', { done: progress.done, total: progress.total })}</span>
      </div>

      <MetaList>
        <MetaRow label={t('Workflow')}>{request.workflowName}</MetaRow>
        <MetaRow label={t('Requested by')}>{request.requestedByName}</MetaRow>
        <MetaRow label={t('Submitted')}>{formatDateTimeWithYear(request.submittedAt)}</MetaRow>
        <MetaRow label={t('Queued')}>{formatDateTimeWithYear(request.queuedAt)}</MetaRow>
        <MetaRow label={request.completedAt ? t('Finished') : t('Elapsed')}>
          {request.completedAt ? formatDateTimeWithYear(request.completedAt) : elapsed === null ? '—' : formatDuration(elapsed)}
        </MetaRow>
        {request.note ? <MetaRow label={t('Note')}>{request.note}</MetaRow> : null}
      </MetaList>

      {request.failureMessage ? <FailureNote>{request.failureMessage}</FailureNote> : null}

      {actions ? <div className="mt-4 flex flex-col gap-2">{actions}</div> : null}

      <DrawerHeading>{t('Trips ({length})', { length: request.jobs.length })}</DrawerHeading>
      {request.jobs.length === 0 ? (
        <p className="text-xs text-muted">{t('No trip has been planned for this request yet.')}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {t('A robot carries at most {max} containers per trip: it collects them all, then delivers them.', { max: MAX_CONTAINERS_PER_TRIP })}
          </p>
          <ul className="flex flex-col gap-2">
            {request.jobs.map((job, index) => (
              <li key={job.jobNo}>
                <TripCard
                  trip={job}
                  fallbackNo={index + 1}
                  total={job.tripCount ?? request.jobs.length}
                  selected={selectedJobNo === job.jobNo}
                  onSelect={() => onSelectJob(job.jobNo)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <DrawerHeading>{t('Movement plan')}</DrawerHeading>
      <ol>
        {request.details.map((detail) => {
          const trip = tripOf.get(detail.containerId)
          return (
            <LineItem
              key={detail.id}
              sequence={detail.sequenceNo}
              title={detail.containerBarcode}
              code
              note={
                trip
                  ? `${detail.sourceLabel} → ${detail.destinationLabel} · ${t('Trip {no}', { no: trip })}`
                  : `${detail.sourceLabel} → ${detail.destinationLabel}`
              }
              status={detail.status}
              tone={REQUEST_DETAIL_STATUS_TONE[detail.status]}
            />
          )
        })}
      </ol>
    </Drawer>
  )
}
