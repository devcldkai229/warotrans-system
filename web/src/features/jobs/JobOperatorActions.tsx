import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { cancelJob, pauseJob, resumeJob, type JobDetailDto } from '@/shared/api/jobs'
import { Button } from '@/shared/ui/Button'
import { t } from '@/shared/i18n'
/**

 * WFX-03: operator pause / resume / cancel. A pause stops the robot (STOP mode PAUSE); whether it really stopped is
 * shown in the robot's Control card (requested → accepted → verified, or unknown). Which buttons show is the
 * server's availableActions (BOTH-04): state and permission are decided there, and checked again on click.
 */
export function JobOperatorActions({
  jobId,
  actions,
  failureCode,
}: {
  jobId: string
  actions: JobDetailDto['availableActions']
  failureCode: string | null
}) {
  const allowed = (action: string) => actions.some((a) => a.action === action && a.allowed)
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
    onError: (failure) => setError(failure instanceof ApiError ? failure.message : t('The job could not be changed.')),
  })

  const mayPause = allowed('PAUSE')
  const mayResume = allowed('RESUME')
  const mayCancel = allowed('CANCEL')
  if (!mayPause && !mayResume && !mayCancel) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {mayPause ? (
          <Button
            size="sm"
            variant="primary"
            disabled={act.isPending}
            onClick={() => {
              const reason = window.prompt(t('Why pause this job? (optional)')) ?? undefined
              act.mutate(() => pauseJob(jobId, reason || undefined))
            }}
          >{t('Pause')}</Button>
        ) : null}
        {mayResume ? (
          <Button size="sm" variant="surface" disabled={act.isPending} onClick={() => act.mutate(() => resumeJob(jobId))}>
            {failureCode === 'operator_paused'
              ? t('Resume (release the robot)')
              : failureCode === 'request_cancelled_cargo_onboard'
                ? t('Resume (deliver the cargo)')
                : t('Resume')}
          </Button>
        ) : null}
        {mayCancel ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => {
              const reason = window.prompt(
                failureCode === 'request_cancelled_cargo_onboard'
                  ? t('Cancel this job? Containers are still on the robot: say where they are now.')
                  : t('Cancel this job? Give a reason.'),
              )
              if (reason) act.mutate(() => cancelJob(jobId, reason))
            }}
          >{t('Cancel job')}</Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-ink">{error}</p> : null}
    </div>
  )
}
