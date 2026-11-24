import { useState } from 'react'
import type { CaseView } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { useReopen, useStartResolution, useVerify } from '../api/hooks'

/** Resolve → Verify → Closed. Closing needs a stated method and result; failing sends it back to resolution. */
export function VerificationPanel({ view }: { view: CaseView }) {
  const id = view.case.id
  const start = useStartResolution(id)
  const verify = useVerify(id)
  const reopen = useReopen(id)
  const plan = view.result?.resolution?.verification
  const [method, setMethod] = useState(plan?.method ?? '')
  const [notes, setNotes] = useState('')
  const acts = view.availableActions
  if (!acts.some((a) => a === 'START_RESOLUTION' || a === 'VERIFY' || a === 'REOPEN')) return null
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">{t('Resolve and verify')}</h2>
      {acts.includes('START_RESOLUTION') && (
        <Button variant="tonal" disabled={start.isPending} onClick={() => start.mutate(undefined)}>{t('Start resolution')}</Button>
      )}
      {acts.includes('VERIFY') && (
        <div className="mt-2 grid gap-2">
          <label className="text-xs text-ink-2">{t('Verification method')}
            <input className={controlClass()} value={method} onChange={(e) => setMethod(e.target.value)} placeholder={t('e.g. two-robot harness scenario 6, 3 lab runs')} />
          </label>
          <label className="text-xs text-ink-2">{t('Observed result / notes')}
            <textarea className={controlClass()} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="danger" disabled={!method || verify.isPending} onClick={() => verify.mutate({ method, passed: false, notes, evidence: [] })}>{t('Still failing')}</Button>
            <Button variant="primary" disabled={!method || !notes || verify.isPending} onClick={() => verify.mutate({ method, passed: true, notes, evidence: [] })}>{t('Verified: close case')}</Button>
          </div>
        </div>
      )}
      {acts.includes('REOPEN') && (
        <Button variant="outline" disabled={reopen.isPending} onClick={() => reopen.mutate(t('Problem seen again'))}>{t('Reopen (problem seen again)')}</Button>
      )}
    </section>
  )
}
