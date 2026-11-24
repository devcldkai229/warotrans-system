import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { useCase, useDismiss, useInvestigate } from '../api/hooks'
import { CaseChat } from '../chat/CaseChat'
import { fmtTime, STATUS_TONE } from '../model/labels'
import { AnomalySummary } from '../panels/AnomalySummary'
import { EvidenceList } from '../panels/EvidenceList'
import { HypothesesPanel } from '../panels/HypothesesPanel'
import { LoopStepper } from '../panels/LoopStepper'
import { TicketPanel } from '../panels/TicketPanel'
import { VerificationPanel } from '../panels/VerificationPanel'
import { VizRenderer } from '../viz/VizRenderer'

/** Case workspace: the closed loop, the AI's answers, pictures with the problem points, evidence, chat, actions. */
export function IncidentCasePage() {
  const { caseId = '' } = useParams()
  const query = useCase(caseId)
  const investigate = useInvestigate(caseId)
  const dismiss = useDismiss(caseId)
  const [selected, setSelected] = useState<string | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const view = query.data

  if (query.isLoading) return <p className="p-8 text-sm text-muted">{t('Loading…')}</p>
  if (query.error || !view) return <p className="p-8 text-sm text-red-ink">{(query.error as Error)?.message ?? t('Not found')}</p>

  const items = view.evidence.items
  const selectEvidence = (id: string) => {
    setSelected(id)
    const item = items.find((i) => i.id === id)
    if (item) setCursor(Date.parse(item.at))
  }
  const c = view.case
  const working = c.status === 'INVESTIGATING'

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-8">
        <Link to=".." relative="path" className="text-xs text-ink-2 hover:underline">← {t('All incidents')}</Link>
        <header className="mt-2 mb-4 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{c.title}</h1>
            <p className="mt-1 text-xs text-ink-2">
              {c.id} · {c.robots.join(', ') || '—'} · {t('window')} {c.window_from ? fmtTime(c.window_from) : '—'}–{c.window_to ? fmtTime(c.window_to) : '—'}
              {' '}· {t('occurrences')} {c.occurrences}
              {view.result && <> · {t('AI cost')} ${view.result.cost_usd.toFixed(4)} · {view.result.seconds}s</>}
            </p>
          </div>
          <StatusBadge tone={STATUS_TONE[c.status]} withDot>{c.status}</StatusBadge>
          {view.availableActions.includes('INVESTIGATE') && (
            <Button variant={view.result ? 'outline' : 'primary'} disabled={investigate.isPending || working} onClick={() => investigate.mutate(undefined)}>
              {view.result ? t('Re-analyse') : t('Investigate with AI')}
            </Button>
          )}
          {view.availableActions.includes('DISMISS') && (
            <Button variant="ghost" onClick={() => { const r = window.prompt(t('Why is this a false positive?')); if (r) dismiss.mutate(r) }}>{t('Dismiss')}</Button>
          )}
        </header>

        <LoopStepper stages={view.loopStages} current={c.loopStage} />
        {working && <p className="mt-3 animate-pulse rounded-sm bg-blue-soft px-3 py-2 text-sm text-blue-ink">{t('AI agents are investigating: evidence investigator → diagnostician → resolution planner → visualizer → validator…')}</p>}
        {view.result?.issues && view.result.issues.length > 0 && (
          <details className="mt-3 rounded-sm bg-container px-3 py-2 text-xs text-ink-2">
            <summary>{t('Validator notes')} ({view.result.issues.length})</summary>
            <ul className="list-inside list-disc">{view.result.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </details>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid min-w-0 gap-4">
            <AnomalySummary view={view} onSelectEvidence={selectEvidence} />
            {view.result && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">{t('Where it goes wrong')}</h2>
                <VizRenderer specs={view.result.visualizations} series={view.evidence.series} hypotheses={view.result.diagnosis?.hypotheses ?? []}
                  windowFrom={view.evidence.windowFrom} windowTo={view.evidence.windowTo} cursor={cursor} onCursor={setCursor} onSelectEvidence={selectEvidence} />
              </section>
            )}
            {view.result && <HypothesesPanel result={view.result} onSelectEvidence={selectEvidence} />}
            {view.result && <TicketPanel view={view} />}
            <VerificationPanel view={view} />
          </div>
          <div className="grid content-start gap-4">
            <CaseChat view={view} onSelectEvidence={selectEvidence} />
            <EvidenceList items={items} selected={selected} onSelect={(id, at) => { setSelected(id); setCursor(Date.parse(at)) }} />
            <section className="rounded-md border border-outline bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold">{t('Audit trail')}</h2>
              <ul className="grid gap-1 text-xs">
                {(c.audit ?? []).map((a, i) => (
                  <li key={i}><span className="font-mono text-muted">{fmtTime(a.at)}</span> <span className="font-medium">{a.actor}</span> {a.action} <span className="text-ink-2">{a.detail}</span></li>
                ))}
              </ul>
              <p className="mt-2 break-all text-[10px] text-muted">{t('Evidence manifest')} sha256 {view.evidence.manifestSha256}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
