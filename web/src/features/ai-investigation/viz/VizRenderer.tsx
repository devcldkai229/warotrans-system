import type { Hypothesis, Series, VisualizationSpec } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { fmtTime } from '../model/labels'
import { CausalGraph } from './CausalGraph'
import { StateDiagram } from './StateDiagram'
import { StateTimelineChart } from './StateTimelineChart'
import { TimeSeriesChart } from './TimeSeriesChart'

interface Props {
  specs: VisualizationSpec[]
  series: Series[]
  hypotheses: Hypothesis[]
  windowFrom: string
  windowTo: string
  cursor: number | null
  onCursor: (ms: number | null) => void
  onSelectEvidence: (id: string) => void
}

/** Renders every spec the AI produced; the data always come from the case evidence, never from the model. */
export function VizRenderer({ specs, series, hypotheses, windowFrom, windowTo, cursor, onCursor, onSelectEvidence }: Props) {
  if (specs.length === 0) return <p className="text-sm text-muted">{t('No visualization for this case yet.')}</p>
  return (
    <div className="grid gap-4">
      {specs.map((spec, i) => {
        switch (spec.kind) {
          case 'TIME_SERIES':
            return <TimeSeriesChart key={i} spec={spec} series={series} cursor={cursor} onCursor={onCursor} onSelectEvidence={onSelectEvidence} />
          case 'STATE_TIMELINE':
            return spec.lanes.length > 0
              ? <StateTimelineChart key={i} spec={spec} windowFrom={windowFrom} windowTo={windowTo} cursor={cursor} onCursor={onCursor} onSelectEvidence={onSelectEvidence} />
              : null
          case 'STATE_DIAGRAM':
            return <StateDiagram key={i} spec={spec} onSelectEvidence={onSelectEvidence} />
          case 'CAUSAL_GRAPH':
            return <CausalGraph key={i} spec={spec} hypotheses={hypotheses} onSelectEvidence={onSelectEvidence} />
          case 'MAP_MOMENT':
            return (
              <div key={i} className="rounded-md border border-outline bg-surface p-3 text-sm">
                <p className="font-medium">{spec.title}</p>
                <p className="text-ink-2">{fmtTime(spec.at)} · {spec.robots.join(', ')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {spec.evidence_ids.map((e) => (
                    <button key={e} type="button" onClick={() => onSelectEvidence(e)} className="rounded bg-container px-1.5 font-mono text-[10px]">{e}</button>
                  ))}
                </div>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
