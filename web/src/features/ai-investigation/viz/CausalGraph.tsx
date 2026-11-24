import type { CausalGraphSpec, Hypothesis } from '@/shared/api/ai'
import { t } from '@/shared/i18n'

const W = 760

/** Hypotheses (left) and the evidence that supports (green) or refutes (red) them (right). */
export function CausalGraph({ spec, hypotheses, onSelectEvidence }: {
  spec: CausalGraphSpec
  hypotheses: Hypothesis[]
  onSelectEvidence: (id: string) => void
}) {
  const hyps = [...new Set(spec.edges.map((e) => e.hypothesis_id))]
  const evidence = [...new Set(spec.edges.map((e) => e.evidence_id))]
  const rowH = 26
  const height = Math.max(hyps.length, evidence.length) * rowH + 24
  const hy = (id: string) => 16 + hyps.indexOf(id) * ((height - 24) / Math.max(1, hyps.length)) + 8
  const ey = (id: string) => 16 + evidence.indexOf(id) * rowH + 8
  const title = (id: string) => hypotheses.find((h) => h.id === id)?.title ?? id
  return (
    <figure className="rounded-md border border-outline bg-surface p-3">
      <figcaption className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{spec.title}</span>
        <span className="text-xs"><span className="text-green">— {t('supports')}</span> · <span className="text-red">— {t('refutes')}</span></span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
        {spec.edges.map((e, i) => (
          <path key={i} d={`M300,${hy(e.hypothesis_id)} C430,${hy(e.hypothesis_id)} 430,${ey(e.evidence_id)} 560,${ey(e.evidence_id)}`}
            fill="none" stroke="currentColor" className={e.relation === 'SUPPORTS' ? 'text-green' : 'text-red'} strokeWidth={1.3} />
        ))}
        {hyps.map((h) => (
          <g key={h}>
            <rect x={4} y={hy(h) - 12} width={296} height={24} rx={6} className="fill-purple-soft stroke-purple" strokeWidth={0.8} />
            <text x={12} y={hy(h) + 4} className="fill-ink text-[11px]">{`${h} · ${title(h)}`.slice(0, 46)}</text>
          </g>
        ))}
        {evidence.map((e) => (
          <g key={e} className="cursor-pointer" onClick={() => onSelectEvidence(e)}>
            <rect x={560} y={ey(e) - 10} width={196} height={20} rx={4} className="fill-container stroke-outline" strokeWidth={0.8} />
            <text x={568} y={ey(e) + 4} className="fill-ink-2 font-mono text-[10px]">{e}</text>
          </g>
        ))}
      </svg>
    </figure>
  )
}
