import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { useCases, useOpenScenario, useScenarios } from '../api/hooks'
import { fmtTime, GROUP_LABEL, SEVERITY_TONE, STAGE_LABEL, STATUS_TONE } from '../model/labels'

const FILTERS = ['', 'DETECTED', 'INVESTIGATING', 'DIAGNOSED', 'TICKETED', 'IN_RESOLUTION', 'NEEDS_MORE_EVIDENCE', 'CLOSED']

/** Incident inbox: every AI case with its loop stage; open a synthetic scenario for training / demos. */
export function IncidentInboxPage() {
  const [status, setStatus] = useState('')
  const cases = useCases(status || undefined)
  const scenarios = useScenarios()
  const open = useOpenScenario()
  const navigate = useNavigate()
  const [scenario, setScenario] = useState('')

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-16 sm:px-10">
        <header className="mb-5">
          <h1 className="text-xl font-semibold">{t('AI incident investigation')}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-2">
            {t('Detect → Investigate → Diagnose → Ticket → Resolve → Verify. Rules detect; AI agents order the evidence, rank hypotheses with evidence for and against, and draft a ticket that a person approves.')}
          </p>
        </header>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-container p-1">
            {FILTERS.map((f) => (
              <button key={f || 'all'} type="button" onClick={() => setStatus(f)}
                className={`rounded-full px-3 py-1 text-xs ${status === f ? 'bg-surface font-semibold shadow-sm' : 'text-ink-2'}`}>{f || t('All')}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select className={controlClass()} value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label={t('Scenario')}>
              <option value="">{t('Run a test scenario…')}</option>
              {scenarios.data?.items.map((s) => <option key={s.id} value={s.id}>{`${s.id} · ${s.category} · ${s.title}`}</option>)}
            </select>
            <Button variant="primary" disabled={!scenario || open.isPending}
              onClick={async () => { const r = await open.mutateAsync(scenario); navigate(r.caseId) }}>{t('Open & investigate')}</Button>
          </div>
        </div>
        {cases.isLoading && <p className="text-sm text-muted">{t('Loading…')}</p>}
        {cases.error && <p className="rounded-sm bg-red-soft px-3 py-2 text-sm text-red-ink">{(cases.error as Error).message}</p>}
        <ul className="grid gap-2">
          {cases.data?.items.length === 0 && <li className="text-sm text-muted">{t('No incidents.')}</li>}
          {cases.data?.items.map((c) => (
            <li key={c.id}>
              <Link to={c.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-outline bg-surface p-3 hover:bg-container">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="mt-0.5 text-xs text-ink-2">{GROUP_LABEL[c.group] ?? c.group} · {c.robots.join(', ') || '—'} · {c.detector_codes.join(', ') || t('manual')} · {fmtTime(c.updated_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={SEVERITY_TONE[c.severity] ?? 'grey'}>{c.severity}</StatusBadge>
                  <StatusBadge tone={STATUS_TONE[c.status]} withDot>{`${STAGE_LABEL[c.loopStage]} · ${c.status}`}</StatusBadge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
