import type { CaseView } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EvidenceChip } from '../components/EvidenceChip'
import { fmtTime, GROUP_LABEL, OWNER_LABEL, SEVERITY_TONE } from '../model/labels'

/** "What is abnormal, and since when?" plus the rule violations that opened the case. */
export function AnomalySummary({ view, onSelectEvidence }: { view: CaseView; onSelectEvidence: (id: string) => void }) {
  const r = view.result
  const inv = r?.investigation
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t('What is abnormal, and since when?')}</h2>
        <StatusBadge tone={SEVERITY_TONE[view.case.severity] ?? 'grey'}>{view.case.severity}</StatusBadge>
        <StatusBadge tone="blue">{GROUP_LABEL[view.case.group] ?? view.case.group}</StatusBadge>
        {r?.diagnosis && <StatusBadge tone="purple">{`${t('Owner')}: ${OWNER_LABEL[r.diagnosis.owner] ?? r.diagnosis.owner}`}</StatusBadge>}
      </div>
      {inv ? (
        <>
          <p className="text-sm">{inv.anomaly}</p>
          {inv.is_anomalous && inv.onset_at && (
            <p className="mt-2 text-sm">
              <span className="font-medium text-amber-ink">● {t('Onset')} {fmtTime(inv.onset_at)}</span>{' '}
              <span className="text-ink-2">{inv.onset_description}</span>{' '}
              {inv.onset_evidence_ids.map((e) => <EvidenceChip key={e} id={e} onSelect={onSelectEvidence} />)}
            </p>
          )}
          {inv.ordering_notes && <p className="mt-1 text-xs text-amber-ink">⚠ {inv.ordering_notes}</p>}
          <ul className="mt-3 grid gap-1.5 text-sm">
            {inv.facts.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-1">
                <span className="rounded bg-container px-1.5 text-[10px] font-semibold text-ink-2">{t('OBSERVED')}</span>
                <span>{f.claim}</span>
                {f.evidence_ids.map((e) => <EvidenceChip key={e} id={e} onSelect={onSelectEvidence} />)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">{t('Not investigated yet.')}</p>
      )}
      {r && r.detectors.length > 0 && (
        <div className="mt-3 border-t border-outline pt-3">
          <h3 className="mb-1 text-xs font-semibold text-ink-2">{t('Rule violations (deterministic detectors)')}</h3>
          <ul className="grid gap-1 text-xs">
            {r.detectors.map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-1">
                <span className="rounded bg-red-soft px-1.5 font-mono text-red-ink">{d.code}</span>
                <span className="text-ink-2">{d.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {inv && inv.missing_evidence.length > 0 && (
        <div className="mt-3 rounded-sm bg-amber-soft px-3 py-2 text-xs text-amber-ink">
          <p className="font-semibold">{t('Missing evidence')}</p>
          <ul className="list-inside list-disc">{inv.missing_evidence.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
