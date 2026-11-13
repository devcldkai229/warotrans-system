import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import { releaseTrafficAfterClearance } from '@/shared/api/fleet'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { Button } from '@/shared/ui/Button'
import { t } from '@/shared/i18n'

/**
 * WEB-FLEET-06: frees the zones a robot holds. Two steps, and the code must be typed. A silent robot cannot say where
 * it is, so this rests on what the operator checked; the screen says so and the audit trail keeps the reason.
 */
export function TrafficClearanceCard({ robotId, robotCode }: { robotId: string; robotCode: string }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)
  const [reason, setReason] = useState('')
  const release = useMutation({
    mutationFn: () => releaseTrafficAfterClearance(robotId, { robotCode: typed, clearanceConfirmed: checked, reason }),
    onSuccess: () => {
      setOpen(false)
      setTyped('')
      setChecked(false)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['robot', robotId] })
    },
  })

  if (!can(PERMISSIONS.trafficManage)) return null
  if (!open) {
    return (
      <div className="mb-4">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {t('Release traffic zones…')}
        </Button>
      </div>
    )
  }

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-md border border-red-ink/40 p-4 text-sm">
      <p className="text-red-ink">
        {t('Another robot may drive into these zones as soon as they are free. The system cannot verify this for a robot that does not report: it relies on you. Go and look first.')}
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        {t('I checked on site that {robotCode} is out of the zones it holds.', { robotCode })}
      </label>
      <label className="flex flex-col gap-1">
        {t('What did you check?')}
        <textarea className="rounded-md border border-outline-soft bg-surface p-2" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        {t('Type {robotCode} to confirm', { robotCode })}
        <input className="rounded-md border border-outline-soft bg-surface p-2 font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!checked || !reason.trim() || typed.trim() !== robotCode || release.isPending} onClick={() => release.mutate()}>
          {t('Release zones')}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t('Cancel')}
        </Button>
      </div>
      {release.error ? <p className="text-xs text-red-ink">{release.error instanceof ApiError ? release.error.message : t('The release failed.')}</p> : null}
    </section>
  )
}
