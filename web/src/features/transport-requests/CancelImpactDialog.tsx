import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { cancelTransportRequest, getCancelPreview } from '@/shared/api/transportRequests'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { humanize } from '@/shared/lib/format'
import { t } from '@/shared/i18n'

interface CancelImpactDialogProps {
  requestId: string
  requestCode: string
  onClose: () => void
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * TRN-03 Cancel Impact Preview: what cancelling does right now (delivered stays delivered, cargo on a robot is stopped
 * and has to be delivered or unloaded by scan), the reason, and optionally only some details not picked up yet.
 * The preview is a picture of now; the server checks everything again when the cancel is sent.
 */
export function CancelImpactDialog({ requestId, requestCode, onClose }: CancelImpactDialogProps) {
  const queryClient = useQueryClient()
  // One key per dialog: a double click or a retry of the same confirmation never starts two cancellations.
  const [idempotencyKey] = useState(newKey)
  const [reasonCode, setReasonCode] = useState('OPERATOR_REQUESTED')
  const [reason, setReason] = useState('')
  const [onlySome, setOnlySome] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const preview = useQuery({ queryKey: ['transport-requests', requestId, 'cancel-preview'], queryFn: () => getCancelPreview(requestId) })
  const cancel = useMutation({
    mutationFn: () =>
      cancelTransportRequest(requestId, reason.trim(), {
        reasonCode,
        idempotencyKey,
        detailIds: onlySome ? chosen : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transport-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      onClose()
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('The request could not be cancelled.')),
  })

  const data = preview.data
  const cancellable = data?.details.filter((detail) => detail.canCancelAlone) ?? []
  const canSubmit = !!data?.canCancel && reason.trim().length > 0 && (!onlySome || chosen.length > 0) && !cancel.isPending

  return (
    <Modal title={t('Cancel {requestCode}', { requestCode })} subtitle={t('Check what this cancel does before you confirm it.')} onClose={onClose} width="w-[560px]">
      <div className="flex flex-col gap-4 px-6 py-5 text-sm">
        {preview.isLoading ? <p className="text-muted">{t('Loading…')}</p> : null}
        {preview.isError ? <FormError>{t('The preview could not be loaded.')}</FormError> : null}
        {data ? (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Tile value={data.totalContainers} label={t('Containers')} />
              <Tile value={data.delivered} label={t('Delivered')} tone="text-green-ink" />
              <Tile value={data.onRobot} label={t('On a robot')} tone={data.onRobot > 0 ? 'text-amber-ink' : undefined} />
              <Tile value={data.notPickedUp} label={t('Not picked up')} />
            </div>

            {data.jobs.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md bg-container p-3 text-xs">
                {data.jobs.map((job) => (
                  <li key={job.jobId} className="flex justify-between gap-3">
                    <span className="font-mono">{job.robotCode ?? t('No robot yet')}</span>
                    <span className="text-ink-2">
                      {job.onRobot > 0
                        ? t('Carrying {onRobot} of {total}', { onRobot: job.onRobot, total: job.total })
                        : t('Delivered {delivered} of {total}', { delivered: job.delivered, total: job.total })}
                      {job.robotCode && !job.robotOnline ? ` · ${t('offline')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-ink-2">
              <li>{t('Containers already delivered stay delivered; nothing is undone.')}</li>
              {data.onRobot > 0 ? (
                <li>{t('Robots carrying cargo are told to stop. Afterwards the cargo is either delivered anyway or unloaded by scanning each container in the mobile app.')}</li>
              ) : null}
              <li>{t('This is not an emergency stop. If a robot is unsafe, use its physical E-stop.')}</li>
            </ul>

            {!data.canCancel ? (
              <FormError>{t('This request cannot be cancelled now ({reason}).', { reason: humanize(data.cannotCancelReason ?? 'unknown') })}</FormError>
            ) : null}

            {cancellable.length > 0 && data.details.length > 1 ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={onlySome} onChange={(event) => setOnlySome(event.target.checked)} />
                {t('Cancel only some containers (not picked up yet)')}
              </label>
            ) : null}
            {onlySome ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-auto text-xs">
                {data.details.map((detail) => (
                  <li key={detail.detailId}>
                    <label className={detail.canCancelAlone ? 'flex items-center gap-2' : 'flex items-center gap-2 text-muted'}>
                      <input
                        type="checkbox"
                        disabled={!detail.canCancelAlone}
                        checked={chosen.includes(detail.detailId)}
                        onChange={(event) =>
                          setChosen((current) =>
                            event.target.checked ? [...current, detail.detailId] : current.filter((id) => id !== detail.detailId),
                          )
                        }
                      />
                      <span className="font-mono">{detail.containerBarcode ?? detail.containerId.slice(0, 8)}</span>
                      <span>{humanize(detail.jobContainerStatus ?? detail.detailStatus)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}

            <Field label={t('Reason')}>
              <select className={controlClass('md')} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
                {data.reasonCodes.map((code) => (
                  <option key={code} value={code}>{humanize(code)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Explain')}>
              <textarea
                className={controlClass('area')}
                rows={2}
                maxLength={500}
                value={reason}
                placeholder={t('e.g. the customer cancelled the order')}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
      </div>
      <footer className="flex justify-end gap-2 px-6 pb-6">
        <Button variant="ghost" onClick={onClose}>{t('Keep the request')}</Button>
        <Button variant="danger" disabled={!canSubmit} onClick={() => cancel.mutate()}>
          {cancel.isPending ? t('Cancelling…') : onlySome ? t('Cancel {count} container(s)', { count: chosen.length }) : t('Cancel the request')}
        </Button>
      </footer>
    </Modal>
  )
}

function Tile({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-md bg-container px-2 py-3">
      <div className={`text-2xl font-book ${tone ?? ''}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}
