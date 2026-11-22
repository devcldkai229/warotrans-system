import type { StateDiagramSpec } from '@/shared/api/ai'
import { t } from '@/shared/i18n'

const W = 760
const BOX_W = 132
const BOX_H = 32

/**
 * Observed path through an entity's state machine: states left to right in the order they occurred; observed
 * transitions solid (red when the state machine does not allow them); the expected next step dashed, so a missing
 * transition (e.g. TR never closed after its Jobs) is visible.
 */
export function StateDiagram({ spec, onSelectEvidence }: { spec: StateDiagramSpec; onSelectEvidence: (id: string) => void }) {
  const cols = Math.max(1, Math.min(spec.states.length, 5))
  const gap = (W - cols * BOX_W) / (cols + 1)
  const pos = new Map(spec.states.map((s, i) => [s, {
    x: gap + (i % cols) * (BOX_W + gap),
    y: 18 + Math.floor(i / cols) * 76,
  }]))
  const height = 18 + Math.ceil(spec.states.length / cols) * 76
  return (
    <figure className="rounded-md border border-outline bg-surface p-3">
      <figcaption className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{spec.title}</span>
        <span className="text-xs text-muted">{t('solid = observed · dashed = expected next · red = not allowed')}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
          </marker>
        </defs>
        {spec.transitions.map((tr, i) => {
          const a = pos.get(tr.source)
          const b = pos.get(tr.target)
          if (!a || !b) return null
          const cls = !tr.observed ? 'text-muted' : tr.expected ? 'text-primary' : 'text-red'
          const sameRow = a.y === b.y
          const x1 = a.x + (b.x >= a.x ? BOX_W : 0)
          const x2 = b.x + (b.x >= a.x ? 0 : BOX_W)
          return (
            <g key={i} className={`${cls} ${tr.evidence_ids[0] ? 'cursor-pointer' : ''}`} onClick={() => tr.evidence_ids[0] && onSelectEvidence(tr.evidence_ids[0])}>
              <path
                d={sameRow ? `M${x1},${a.y + BOX_H / 2} L${x2},${b.y + BOX_H / 2}` : `M${a.x + BOX_W / 2},${a.y + BOX_H} L${b.x + BOX_W / 2},${b.y}`}
                stroke="currentColor" fill="none" strokeWidth={tr.observed ? 1.8 : 1.2} strokeDasharray={tr.observed ? undefined : '5 4'} markerEnd="url(#arrow)"
              />
            </g>
          )
        })}
        {spec.states.map((s) => {
          const p = pos.get(s)!
          const current = s === spec.current_state
          return (
            <g key={s}>
              <rect x={p.x} y={p.y} width={BOX_W} height={BOX_H} rx={8}
                className={current ? 'fill-amber-soft stroke-amber' : 'fill-container stroke-outline'} strokeWidth={current ? 2 : 1} />
              <text x={p.x + BOX_W / 2} y={p.y + 20} textAnchor="middle" className="fill-ink text-[11px] font-medium">{s}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
