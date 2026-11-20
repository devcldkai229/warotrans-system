import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import {
  deliverCancelledCargo,
  getCancellation,
  type Cancellation,
  type CancellationItem,
  type CancellationStatus,
} from '@/shared/api/transportRequests'
import { Button } from '@/shared/ui/Button'
import { FormError } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { formatDateTime, humanize } from '@/shared/lib/format'
import { t } from '@/shared/i18n'

const STATUS_TONE: Record<CancellationStatus, Tone> = {
  REQUESTED: 'blue',
  STOPPING: 'amber',
  WAITING_ROBOT: 'amber',
  RECOVERING: 'blue',
  MANUAL_INTERVENTION: 'red',
  FINALIZED: 'green',
}

const STAGE_TEXT: Record<CancellationItem['stage'], string> = {
  PENDING: 'Being cancelled',
  STOP_REQUESTED: 'Stop sent, waiting for the robot to hold still',
  WAITING_ROBOT: 'Robot offline or not confirming its stop',
  CARGO_ON_ROBOT: 'Stopped with cargo: deliver it or unload it by scan',
  DELIVERING: 'Delivering the cargo on board',
  MANUAL: 'Needs a person',
  DONE: 'Done',
}

/**
 * TRN-03 Cancellation Progress: which robot stopped, which containers are still on a robot, and what needs a person.
 * Polls while the cancellation is in progress; never says "cancelled" while cargo is still on a robot.
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
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const deliver = useMutation({
    mutationFn: (jobId: string) => deliverCancelledCargo(requestId, jobId),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['transport-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('The cargo could not be sent on.')),
  })

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-md bg-container p-3 text-xs" aria-label={t('Cancellation progress')}>
      <header className="flex items-center justify-between gap-2">
        <span className="font-medium">{cancellation.scope === 'DETAILS' ? t('Containers cancelled') : t('Cancellation')}</span>
        <StatusBadge tone={STATUS_TONE[cancellation.status]}>{humanize(cancellation.status)}</StatusBadge>
      </header>
      <p className="text-ink-2">
        {humanize(cancellation.reasonCode)}
        {cancellation.reason ? `: ${cancellation.reason}` : ''} · {formatDateTime(cancellation.requestedAt)}
      </p>
      <p className="text-ink-2">
        {t('{delivered} delivered · {handedOver} unloaded by scan · {notPickedUp} never picked up · {onRobot} still on a robot', {
          delivered: cancellation.delivered,
          handedOver: cancellation.handedOver,
          notPickedUp: cancellation.notPickedUp,
          onRobot: cancellation.onRobot,
        })}
      </p>
      {cancellation.lastError ? <FormError>{cancellation.lastError}</FormError> : null}

      <ul className="flex flex-col gap-2">
        {cancellation.items.map((item) => (
          <li key={item.jobId} className="rounded-sm bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{item.robotCode ?? item.jobNo}</span>
              <span className={item.stage === 'MANUAL' || item.stage === 'WAITING_ROBOT' ? 'text-red-ink' : 'text-ink-2'}>
                {t(STAGE_TEXT[item.stage])}
              </span>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted">
              {item.containers.map((container) => (
                <li key={container.containerId}>
                  <span className="font-mono">{container.barcode ?? container.containerId.slice(0, 8)}</span>{' '}
                  {humanize(container.resolution ?? container.jobContainerStatus)}
                </li>
              ))}
            </ul>
            {item.canHandOver || item.canDeliver ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.canDeliver ? (
                  <Button size="sm" variant="outline" disabled={deliver.isPending} onClick={() => deliver.mutate(item.jobId)}>
                    {t('Deliver anyway')}
                  </Button>
                ) : null}
                {item.canHandOver ? <span className="text-muted">{t('Or unload each container by scanning it in the mobile app.')}</span> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <FormError>{error}</FormError> : null}
    </section>
  )
}
