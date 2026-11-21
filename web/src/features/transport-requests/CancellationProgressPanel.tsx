import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import {
  deliverCancelledCargo,
  getCancellation,
  getRecoveryPoints,
  requestManualCargoHandover,
  sendCancelledCargoToRecovery,
  type Cancellation,
  type CancellationAction,
  type CancellationItem,
  type CancellationStage,
  type CancellationStatus,
} from '@/shared/api/transportRequests'
import { Button } from '@/shared/ui/Button'
import { FormError } from '@/shared/ui/Field'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { cx } from '@/shared/lib/cx'
import { formatDateTime, humanize } from '@/shared/lib/format'
import { t } from '@/shared/i18n'

const STATUS_TONE: Record<CancellationStatus, Tone> = {
  REQUESTED: 'blue',
  STOPPING: 'amber',
  WAITING_ROBOT: 'amber',
  RECOVERING: 'blue',
  MANUAL_INTERVENTION: 'red',
  PARKING_ROBOTS: 'teal',
  FINALIZED: 'green',
}

const STAGE: Record<CancellationStage, { text: string; tone: Tone }> = {
  PENDING: { text: 'Being cancelled', tone: 'grey' },
  STOP_REQUESTED: { text: 'Stopping', tone: 'amber' },
  WAITING_ROBOT: { text: 'Waiting for the robot', tone: 'red' },
  CARGO_ON_ROBOT: { text: 'Stopped with cargo', tone: 'amber' },
  DELIVERING: { text: 'Delivering', tone: 'blue' },
  TO_RECOVERY: { text: 'To recovery point', tone: 'blue' },
  AT_RECOVERY: { text: 'At recovery point', tone: 'purple' },
  AT_DROPOFF: { text: 'At the drop-off', tone: 'amber' },
  HANDOVER_REQUESTED: { text: 'Handover requested', tone: 'purple' },
  SAFE_STOP: { text: 'Safe stop', tone: 'red' },
  MANUAL: { text: 'Needs a person', tone: 'red' },
  DONE: { text: 'Done', tone: 'green' },
}

const BLOCKED_TEXT: Record<string, string> = {
  reason_forbids_delivery: 'The cancel reason does not allow delivering this cargo.',
  robot_offline: 'The robot is offline.',
  robot_not_localized: 'The robot is not localized: it must not drive.',
  robot_telemetry_stale: 'No fresh position from the robot.',
  needs_technician: 'A technician has to look at the robot first.',
  already_at_recovery_point: 'Already at a recovery point.',
  at_dropoff_reconcile_first: 'At its drop-off: confirm the delivery or unload it there first.',
  recovery_needs_move: 'The robot stands where a person has to act first.',
  robot_driving_to_recovery: 'The robot is driving to the recovery point.',
  robot_not_stopped: 'The robot does not hold still yet.',
  already_requested: 'A person was already asked.',
}

/**
 * TRN-03 Cancellation Progress, one card per robot. The destination policy says where each robot goes: nothing picked
 * up → parking; on the way to a pickup → a wait point or parking; carrying cargo → a recovery (wait / queue) point; at
 * its drop-off → reconcile first; cannot drive safely → safe stop and a technician; everything accounted for → parking.
 * The server decides which next steps are open, and says why the others are not.
 */
export function CancellationProgressPanel({ requestId, requestStatus }: { requestId: string; requestStatus: string }) {
  const query = useQuery({
    queryKey: ['transport-requests', requestId, 'cancellation'],
    queryFn: () => getCancellation(requestId),
    enabled: requestStatus === 'CANCELLING' || requestStatus === 'CANCELLED' || requestStatus === 'PARTIALLY_COMPLETED',
    refetchInterval: (state) => (state.state.data && state.state.data.status !== 'FINALIZED' ? 3000 : false),
  })
  const cancellation = query.data
  if (!cancellation) return null
  return <ProgressBody cancellation={cancellation} requestId={requestId} />
}

function ProgressBody({ cancellation, requestId }: { cancellation: Cancellation; requestId: string }) {
  const tiles: { label: string; value: number; tone: string }[] = [
    { label: 'Delivered', value: cancellation.delivered, tone: 'text-green-ink' },
    { label: 'Unloaded by scan', value: cancellation.handedOver, tone: 'text-purple-ink' },
    { label: 'Never picked up', value: cancellation.notPickedUp, tone: 'text-ink-2' },
    { label: 'Still on a robot', value: cancellation.onRobot, tone: cancellation.onRobot > 0 ? 'text-amber-ink' : 'text-ink-2' },
  ]
  return (
    <section className="mt-4 flex flex-col gap-3 rounded-md bg-container p-3 text-xs" aria-label={t('Cancellation progress')}>
      <header className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {cancellation.scope === 'DETAILS' ? t('Containers cancelled') : t('Cancellation progress')}
        </span>
        <StatusBadge tone={STATUS_TONE[cancellation.status]}>{humanize(cancellation.status)}</StatusBadge>
      </header>
      <p className="text-ink-2">
        {humanize(cancellation.reasonCode)}
        {cancellation.reason ? `: ${cancellation.reason}` : ''} · {formatDateTime(cancellation.requestedAt)}
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-sm bg-surface px-2.5 py-2">
            <dt className="text-muted">{t(tile.label)}</dt>
            <dd className={cx('text-lg font-semibold tabular-nums', tile.tone)}>{tile.value}</dd>
          </div>
        ))}
      </dl>
      {cancellation.lastError ? <FormError>{cancellation.lastError}</FormError> : null}

      <ul className="flex flex-col gap-2">
        {cancellation.items.map((item) => (
          <RobotCard key={item.jobId} item={item} requestId={requestId} active={cancellation.status !== 'FINALIZED'} />
        ))}
      </ul>
    </section>
  )
}

/** Where the robot is, and where the policy sends it next. */
function whereAndNext(item: CancellationItem): { icon: IconName; where: string; next: string | null; warn?: boolean } {
  const point = item.recoveryPointCode ?? ''
  if (item.stage === 'SAFE_STOP') {
    return { icon: 'alert', where: t('Holds still but cannot drive safely (not localized).'), next: t('Safe stop · a technician checks the robot'), warn: true }
  }
  if (item.stage === 'WAITING_ROBOT') {
    return { icon: 'radio', where: t('Offline or not confirming its stop: not treated as stopped.'), next: t('Check the robot on the floor'), warn: true }
  }
  if (item.stage === 'MANUAL') {
    return { icon: 'wrench', where: t('Cannot finish by itself.'), next: t('A person sorts out the robot and its cargo'), warn: true }
  }
  if (item.stage === 'DONE') {
    switch (item.destinationStatus) {
      case 'SENT':
        return { icon: 'navigate', where: t('Nothing left on the robot.'), next: t('Sent to {code}', { code: item.destinationEndpointCode ?? '' }) }
      case 'PENDING':
        return { icon: 'clock', where: t('Nothing left on the robot.'), next: t('Sending to parking…') }
      case 'NOT_NEEDED':
        return {
          icon: 'check',
          where: t('Nothing left on the robot.'),
          next: item.destinationEndpointCode ? t('Already at {code}', { code: item.destinationEndpointCode }) : t('Stays where it is'),
        }
      case 'SKIPPED':
        return { icon: 'info', where: t('Nothing left on the robot.'), next: t('Not moved: {why}', { why: humanize(item.destinationNote ?? '') }) }
      default:
        return { icon: 'check', where: t('Nothing left on the robot.'), next: null }
    }
  }
  switch (item.phase) {
    case 'TO_RECOVERY':
      return { icon: 'navigate', where: t('Driving its cargo to {code}.', { code: point }), next: t('Unload by scan there') }
    case 'AT_RECOVERY':
      return { icon: 'target', where: t('Holds still at recovery point {code}.', { code: point }), next: t('Unload by scan, or continue the delivery') }
    case 'AT_DROPOFF':
      return { icon: 'box', where: t('At its drop-off, unload not confirmed.'), next: t('Reconcile the containers first: confirm the delivery or unload them') }
    case 'IN_TRANSIT':
    case 'AT_PICKUP':
      return { icon: 'route', where: t('Carrying containers between stops.'), next: t('Recovery point, where the cargo is handled') }
    case 'TO_PICKUP':
      return { icon: 'route', where: t('On its way to a pickup, nothing on board.'), next: t('A wait point or parking, whichever is nearer') }
    case 'NOT_STARTED':
      return { icon: 'pause', where: t('Had not started.'), next: t('Parking') }
    default:
      return { icon: 'info', where: t('Being cancelled'), next: null }
  }
}

function RobotCard({ item, requestId, active }: { item: CancellationItem; requestId: string; active: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const stage = STAGE[item.stage] ?? STAGE.PENDING
  const info = whereAndNext(item)
  const actions = new Set<CancellationAction>(item.actions ?? [])
  const blocked = item.blockedActions ?? {}

  const done = () => {
    setError(null)
    setChoosing(false)
    void queryClient.invalidateQueries({ queryKey: ['transport-requests'] })
    void queryClient.invalidateQueries({ queryKey: ['jobs'] })
  }
  const failed = (fallback: string) => (failure: unknown) => setError(failure instanceof ApiError ? failure.message : t(fallback))
  const deliver = useMutation({
    mutationFn: () => deliverCancelledCargo(requestId, item.jobId),
    onSuccess: done,
    onError: failed('The cargo could not be sent on.'),
  })
  const recovery = useMutation({
    mutationFn: (endpointId: string | null) => sendCancelledCargoToRecovery(requestId, item.jobId, endpointId),
    onSuccess: done,
    onError: failed('The robot could not be sent to the recovery point.'),
  })
  const handover = useMutation({
    mutationFn: () => requestManualCargoHandover(requestId, item.jobId),
    onSuccess: done,
    onError: failed('The handover could not be requested.'),
  })
  const busy = deliver.isPending || recovery.isPending || handover.isPending
  const onboard = item.containers.filter((c) => c.jobContainerStatus === 'ONBOARD').length
  const showActions = active && onboard > 0 && (actions.size > 0 || Object.keys(blocked).length > 0)

  return (
    <li className={cx('rounded-sm bg-surface p-3', info.warn && 'ring-1 ring-red/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold">{item.robotCode ?? t('No robot')}</span>
          <span className="text-muted">{item.jobNo}</span>
          {item.robotCode && !item.robotOnline ? <span className="text-red-ink">{t('offline')}</span> : null}
        </div>
        <StatusBadge tone={stage.tone}>{t(stage.text)}</StatusBadge>
      </div>

      <div className="mt-2 flex items-start gap-2">
        <Icon name={info.icon} size={14} className={cx('mt-0.5 shrink-0', info.warn ? 'text-red-ink' : 'text-ink-2')} />
        <div className="flex flex-col gap-0.5">
          <span className="text-ink">{info.where}</span>
          {info.next ? (
            <span className={info.warn ? 'text-red-ink' : 'text-ink-2'}>
              <span className="text-muted">{t('Next')}: </span>
              {info.next}
            </span>
          ) : null}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {item.containers.map((container) => (
          <li
            key={container.containerId}
            className={cx(
              'rounded-full px-2 py-0.5',
              container.jobContainerStatus === 'ONBOARD' ? 'bg-amber-soft text-amber-ink' : 'bg-container-high text-ink-2',
            )}
          >
            <span className="font-mono">{container.barcode ?? container.containerId.slice(0, 8)}</span>{' '}
            {humanize(container.resolution ?? container.jobContainerStatus)}
          </li>
        ))}
      </ul>

      {showActions ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-outline-variant pt-3">
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action="CONTINUE_DELIVERY"
              actions={actions}
              blocked={blocked}
              variant="primary"
              disabled={busy}
              onClick={() => deliver.mutate()}
              label={item.phase === 'AT_DROPOFF' ? 'Confirm at the drop-off' : 'Continue delivery'}
            />
            <ActionButton
              action="SEND_TO_RECOVERY"
              actions={actions}
              blocked={blocked}
              variant="tonal"
              disabled={busy}
              onClick={() => setChoosing((open) => !open)}
              label="Send to recovery point"
            />
            <ActionButton
              action="REQUEST_MANUAL_HANDOVER"
              actions={actions}
              blocked={blocked}
              variant="outline"
              disabled={busy}
              onClick={() => handover.mutate()}
              label="Request manual handover"
            />
          </div>
          {choosing ? (
            <RecoveryChooser
              requestId={requestId}
              jobId={item.jobId}
              pending={recovery.isPending}
              onSend={(endpointId) => recovery.mutate(endpointId)}
              onClose={() => setChoosing(false)}
            />
          ) : null}
          <BlockedReasons blocked={blocked} />
          {actions.has('UNLOAD_BY_SCAN') ? (
            <p className="flex items-center gap-1.5 text-muted">
              <Icon name="box" size={12} />
              {t('Unloading is done in the mobile app: Unload By Scan, one container at a time.')}
            </p>
          ) : null}
          {item.handoverRequestedAt ? (
            <p className="text-purple-ink">{t('A person was asked to unload it ({time}).', { time: formatDateTime(item.handoverRequestedAt) })}</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mt-2">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </li>
  )
}

function ActionButton({
  action,
  actions,
  blocked,
  label,
  variant,
  disabled,
  onClick,
}: {
  action: CancellationAction
  actions: Set<CancellationAction>
  blocked: Partial<Record<CancellationAction, string>>
  label: string
  variant: 'primary' | 'tonal' | 'outline'
  disabled: boolean
  onClick: () => void
}) {
  const open = actions.has(action)
  const why = blocked[action]
  if (!open && !why) return null
  return (
    <Button size="sm" variant={variant} disabled={!open || disabled} onClick={onClick} title={why ? t(BLOCKED_TEXT[why] ?? humanize(why)) : undefined}>
      {t(label)}
    </Button>
  )
}

function BlockedReasons({ blocked }: { blocked: Partial<Record<CancellationAction, string>> }) {
  const reasons = Array.from(new Set(Object.values(blocked).filter((why): why is string => !!why && why !== 'already_requested')))
  if (reasons.length === 0) return null
  return (
    <ul className="flex flex-col gap-0.5 text-muted">
      {reasons.map((why) => (
        <li key={why} className="flex items-center gap-1.5">
          <Icon name="info" size={12} />
          {t(BLOCKED_TEXT[why] ?? humanize(why))}
        </li>
      ))}
    </ul>
  )
}

function RecoveryChooser({
  requestId,
  jobId,
  pending,
  onSend,
  onClose,
}: {
  requestId: string
  jobId: string
  pending: boolean
  onSend: (endpointId: string | null) => void
  onClose: () => void
}) {
  const points = useQuery({
    queryKey: ['transport-requests', requestId, 'cancellation', jobId, 'recovery-points'],
    queryFn: () => getRecoveryPoints(requestId, jobId),
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const list = points.data ?? []
  const selected = chosen ?? list.find((p) => p.free)?.endpointId ?? null

  return (
    <div className="flex flex-col gap-2 rounded-sm bg-container p-2.5">
      <p className="text-ink-2">{t('Choose where the robot takes its cargo. It drives through traffic and holds still there.')}</p>
      {points.isLoading ? <p className="text-muted">{t('Loading…')}</p> : null}
      {!points.isLoading && list.length === 0 ? <p className="text-red-ink">{t('This map has no wait / queue point.')}</p> : null}
      <div role="radiogroup" className="flex flex-col gap-1">
        {list.map((point) => (
          <label
            key={point.endpointId}
            className={cx(
              'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5',
              selected === point.endpointId ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-surface',
              !point.free && 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={`recovery-${jobId}`}
                disabled={!point.free}
                checked={selected === point.endpointId}
                onChange={() => setChosen(point.endpointId)}
              />
              <span className="font-mono">{point.code}</span>
              <span className="text-muted">{point.name}</span>
            </span>
            <span className="text-muted tabular-nums">
              {point.free ? (point.distanceMeters != null ? `${point.distanceMeters.toFixed(1)} m` : '') : t('taken')}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('Close')}
        </Button>
        <Button size="sm" variant="primary" disabled={pending || !selected} onClick={() => onSend(selected)}>
          {pending ? t('Sending…') : t('Send robot')}
        </Button>
      </div>
    </div>
  )
}
