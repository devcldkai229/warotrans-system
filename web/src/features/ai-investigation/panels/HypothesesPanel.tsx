import type { InvestigationResult } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EvidenceChip } from '../components/EvidenceChip'
import { GROUP_LABEL } from '../model/labels'

/** "Why, and in which layer?" — ranked hypotheses with the evidence for and against each. Never "verified". */
export function HypothesesPanel({ result, onSelectEvidence }: { result: InvestigationResult; onSelectEvidence: (id: string) => void }) {
  const d = result.diagnosis
  if (!d) return null
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{t('Why did it happen?')}</h2>
        {d.needs_more_evidence && <StatusBadge tone="amber">{t('Needs more evidence')}</StatusBadge>}
      </div>
      {d.reasoning_summary && <p className="mb-3 text-sm text-ink-2">{d.reasoning_summary}</p>}
      {d.hypotheses.length === 0 && <p className="text-sm text-muted">{t('No hypothesis: nothing abnormal, or not enough evidence.')}</p>}
      <ol className="grid gap-3">
        {d.hypotheses.map((h) => (
          <li key={h.id} className="rounded-sm border border-outline p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">#{h.rank} {h.title}</span>
              <StatusBadge tone="purple">{t('HYPOTHESIS · unverified')}</StatusBadge>
              <StatusBadge tone="blue">{`${GROUP_LABEL[h.group] ?? h.group} / ${h.subsystem}`}</StatusBadge>
            </div>
            <p className="mt-1.5 text-sm">{h.mechanism}</p>
            <div className="mt-2 grid gap-1 text-xs">
              <p className="flex flex-wrap items-baseline gap-1"><span className="font-semibold text-green-ink">{t('Supports')}:</span>
                {h.supports.map((e) => <EvidenceChip key={e} id={e} onSelect={onSelectEvidence} />)}</p>
              <p className="flex flex-wrap items-baseline gap-1"><span className="font-semibold text-red-ink">{t('Refutes')}:</span>
                {h.refutes.length ? h.refutes.map((e) => <EvidenceChip key={e} id={e} onSelect={onSelectEvidence} />) : <span className="text-muted">{t('none found')}</span>}</p>
              {h.unknowns.length > 0 && <p><span className="font-semibold text-ink-2">{t('Unknowns')}:</span> {h.unknowns.join('; ')}</p>}
              <p><span className="font-semibold text-ink-2">{t('Test to confirm')}:</span> {h.test_to_confirm}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
