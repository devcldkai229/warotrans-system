import { useState } from 'react'
import type { CaseView, IssueProposal } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { useApproveAndExecute, usePropose } from '../api/hooks'
import { OWNER_LABEL } from '../model/labels'

/** "What should be done, by whom?" — the plan, and a reviewed, server-approved IssueReport (never automatic). */
export function TicketPanel({ view }: { view: CaseView }) {
  const res = view.result?.resolution
  const id = view.case.id
  const propose = usePropose(id)
  const approve = useApproveAndExecute(id)
  const [draft, setDraft] = useState<IssueProposal | null>(null)
  const canTicket = view.availableActions.includes('CREATE_TICKET')
  if (!res) return null
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('What to do, and who does it')}</h2>
        <span className="text-xs text-ink-2">{`${t('Owner')}: ${OWNER_LABEL[res.owner] ?? res.owner}`}</span>
      </div>
      <p className="mb-3 text-sm">{res.summary}</p>
      {res.technician && (
        <div className="mb-3">
          <h3 className="text-xs font-semibold text-ink-2">{res.technician.title}</h3>
          <ol className="mt-1 grid gap-1.5 text-sm">
            {res.technician.checklist.map((s) => (
              <li key={s.order} className="rounded-sm bg-container px-3 py-2">
                <p><span className="font-semibold">{s.order}.</span> {s.instruction}</p>
                {s.safety_precondition && <p className="text-xs text-red-ink">⚠ {s.safety_precondition}</p>}
                <p className="text-xs text-ink-2">{t('Expect')}: {s.expected_observation}</p>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-ink-2">{t('Escalate if')}: {res.technician.escalate_if}</p>
        </div>
      )}
      {res.engineering && (
        <div className="mb-3 rounded-sm border border-outline p-3 text-sm">
          <h3 className="font-semibold">{t('Engineering defect draft')}: {res.engineering.title}</h3>
          <p className="text-xs text-ink-2">{t('Suspected module')}: <span className="font-mono">{res.engineering.suspected_module}</span></p>
          <p className="mt-1"><span className="font-medium">{t('Expected')}:</span> {res.engineering.expected_behaviour}</p>
          <p><span className="font-medium">{t('Observed')}:</span> {res.engineering.observed_behaviour}</p>
          <p className="mt-1 font-medium">{t('Reproduction')}</p>
          <ol className="list-inside list-decimal text-xs">{res.engineering.reproduction.map((r, i) => <li key={i}>{r}</li>)}</ol>
          <p className="mt-1 text-xs"><span className="font-medium">{t('Regression test')}:</span> {res.engineering.regression_test}</p>
        </div>
      )}
      <div className="rounded-sm bg-teal-soft px-3 py-2 text-xs text-teal-ink">
        <p className="font-semibold">{t('How we will know it is fixed')}: {res.verification.method}</p>
        <ul className="list-inside list-disc">{res.verification.pass_criteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <p>{t('Monitoring')}: {res.verification.monitoring_window}</p>
      </div>
      {view.case.issue_report_id && <p className="mt-3 text-sm text-green-ink">✓ {t('IssueReport created')}: <span className="font-mono">{view.case.issue_report_id}</span></p>}
      {canTicket && (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={propose.isPending} onClick={async () => setDraft(await propose.mutateAsync(undefined))}>
            {t('Review & create ticket…')}
          </Button>
        </div>
      )}
      {draft && (
        <Modal title={t('Create IssueReport')} subtitle={t('You approve exactly this content. The AI never creates tickets by itself.')} onClose={() => setDraft(null)} width="w-[640px]">
          <div className="grid gap-2 text-sm">
            <p><span className="font-medium">{t('Type')}:</span> {String(draft.payload.issueType)} · <span className="font-medium">{t('Severity')}:</span> {String(draft.payload.severity)}</p>
            <textarea className="h-56 w-full rounded-sm border border-outline bg-container p-2 font-mono text-xs" readOnly value={String(draft.payload.description)} />
            {approve.error && <p className="rounded-sm bg-red-soft px-3 py-2 text-xs text-red-ink">{(approve.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>{t('Cancel')}</Button>
              <Button variant="primary" disabled={approve.isPending} onClick={async () => { await approve.mutateAsync(draft); setDraft(null) }}>
                {approve.isPending ? t('Creating…') : t('Approve and create')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
