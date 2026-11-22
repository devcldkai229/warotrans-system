import type { LoopStage } from '@/shared/api/ai'
import { cx } from '@/shared/lib/cx'
import { STAGE_HINT, STAGE_LABEL } from '../model/labels'

/** Detect → Investigate → Diagnose → Ticket → Resolve → Verify → Closed, with the current step and what it means. */
export function LoopStepper({ stages, current }: { stages: LoopStage[]; current: LoopStage }) {
  const at = stages.indexOf(current)
  return (
    <nav aria-label="Incident loop" className="rounded-md border border-outline bg-surface p-3">
      <ol className="flex flex-wrap items-center gap-1">
        {stages.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <span
              className={cx(
                'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
                i < at && 'bg-green-soft text-green-ink',
                i === at && 'bg-primary text-white',
                i > at && 'bg-container text-muted',
              )}
              aria-current={i === at ? 'step' : undefined}
            >
              <span>{i < at ? '✓' : i + 1}</span>
              {STAGE_LABEL[s]}
            </span>
            {i < stages.length - 1 && <span className="text-muted">›</span>}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ink-2">{STAGE_HINT[current]}</p>
    </nav>
  )
}
