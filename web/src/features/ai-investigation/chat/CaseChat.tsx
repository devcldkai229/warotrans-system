import { useState } from 'react'
import type { CaseView } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { useAsk } from '../api/hooks'
import { EvidenceChip } from '../components/EvidenceChip'
import { fmtTime } from '../model/labels'

const QUICK = [
  t('What happened first, and when?'),
  t('Why did the robot stop?'),
  t('Which evidence argues against the top hypothesis?'),
  t('Can a technician fix this, or is it a software defect?'),
  t('What should I check on the robot, step by step?'),
]

/** Grounded chat: every sentence cites evidence; uncited sentences are dropped server-side. */
export function CaseChat({ view, onSelectEvidence }: { view: CaseView; onSelectEvidence: (id: string) => void }) {
  const ask = useAsk(view.case.id)
  const [q, setQ] = useState('')
  const enabled = view.availableActions.includes('ASK')
  const send = (text: string) => {
    if (!text.trim()) return
    ask.mutate(text.trim())
    setQ('')
  }
  return (
    <section className="flex flex-col rounded-md border border-outline bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">{t('Ask the AI about this case')}</h2>
      <ul className="mb-3 grid max-h-96 gap-2 overflow-auto">
        {view.chat.length === 0 && <li className="text-xs text-muted">{t('Answers only use this case’s evidence and cite it.')}</li>}
        {view.chat.map((m, i) => (
          <li key={i} className={cx('rounded-md px-3 py-2 text-sm', m.role === 'user' ? 'ml-8 bg-primary/10' : 'mr-8 bg-container')}>
            <p className="mb-0.5 text-[10px] text-muted">{m.role === 'user' ? m.actor : 'AI'} · {fmtTime(m.at)}</p>
            {m.role === 'user' ? <p>{m.text}</p> : (
              <>
                {(m.sentences ?? []).map((s, j) => (
                  <p key={j} className="mb-1">{s.text} {s.evidence_ids.map((e) => <EvidenceChip key={e} id={e} onSelect={onSelectEvidence} />)}</p>
                ))}
                {m.insufficient && <p className="text-xs text-amber-ink">{t('The evidence does not answer this fully.')}</p>}
                {!!m.dropped && <p className="text-[10px] text-muted">{t('Uncited sentences removed')}: {m.dropped}</p>}
              </>
            )}
          </li>
        ))}
        {ask.isPending && <li className="mr-8 animate-pulse rounded-md bg-container px-3 py-2 text-sm text-muted">{t('Thinking over the evidence…')}</li>}
      </ul>
      {enabled ? (
        <>
          <div className="mb-2 flex flex-wrap gap-1">
            {QUICK.map((x) => <button key={x} type="button" className="rounded-full bg-container px-2.5 py-1 text-xs hover:bg-container-high" onClick={() => send(x)}>{x}</button>)}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q) }}>
            <input className={cx(controlClass(), 'flex-1')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ask, e.g. “why did RBT-002 stop at 10:42?”')} maxLength={1000} />
            <Button type="submit" variant="primary" disabled={ask.isPending || !q.trim()}>{t('Send')}</Button>
          </form>
          {ask.error && <p className="mt-1 text-xs text-red-ink">{(ask.error as Error).message}</p>}
        </>
      ) : <p className="text-xs text-muted">{t('Chat opens once the case has been investigated.')}</p>}
    </section>
  )
}
