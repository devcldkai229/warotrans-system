import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import type { TransportRequestView } from '@/shared/api/contracts'
import { rejectTransportRequest } from '@/shared/api/transportRequests'
import { Button } from '@/shared/ui/Button'
import { CancelImpactDialog } from './CancelImpactDialog'
import { t } from '@/shared/i18n'
/**

 * TRN-01 / TRN-02 buttons. Whether each one shows comes from the server's availableActions (BOTH-04), and the
 * server checks again on click, so this component never decides on the request state itself.
 */
export function RequestCloseActions({ request }: { request: TransportRequestView }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['transport-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('The request could not be changed.')),
  })

  const cancel = request.availableActions.find((a) => a.action === 'CANCEL')
  const reject = request.availableActions.find((a) => a.action === 'REJECT')
  const cancelling = request.status === 'CANCELLING'
  if (!cancel?.allowed && !reject?.allowed && !cancelling) return null

  const ask = (question: string, run: (reason: string) => Promise<unknown>) => {
    const reason = window.prompt(question)?.trim()
    if (reason) act.mutate(() => run(reason))
  }

  return (
    <span className="flex flex-col items-end gap-1" onClick={(event) => event.stopPropagation()}>
      <span className="flex gap-2">
        {reject?.allowed ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={act.isPending}
            onClick={() => ask(t('Reject {requestCode}? Give the reason the requester will see.', { requestCode: request.requestCode }), (r) => rejectTransportRequest(request.id, r))}
          >{t('Reject')}</Button>
        ) : null}
        {cancel?.allowed ? (
          <Button
            variant="danger"
            size="sm"
            disabled={act.isPending}
            onClick={() => setPreviewing(true)}
          >{t('Cancel')}</Button>
        ) : null}
      </span>
      {previewing ? (
        <CancelImpactDialog requestId={request.id} requestCode={request.requestCode} onClose={() => setPreviewing(false)} />
      ) : null}
      {error ? <span className="text-xs text-red-ink">{error}</span> : null}
      {!error && cancelling ? (
        <span className="text-xs text-muted">{t('Cancelling: cargo on a robot is waiting to be delivered or unloaded by scan.')}</span>
      ) : null}
    </span>
  )
}
