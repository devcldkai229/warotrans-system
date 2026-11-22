import type { StateTimelineSpec } from '@/shared/api/ai'
import { fmtTime, MARKER_STYLE } from '../model/labels'
import { timeScale } from './scales'

const W = 760
const LANE = 24
const LEFT = 150
const TOP = 18

const BAD = /(CLOSED|OFFLINE|DeadlockRisk|Quarantined|FAILED|CANCELLED|Capacity)/i
const OK = /(OPEN|ONLINE|COMPLETED|RUNNING|Moving|Authorized|EXECUTING)/i

/** Swimlanes: each entity / signal and its states over time, the AI markers as vertical lines. */
export function StateTimelineChart({ spec, windowFrom, windowTo, cursor, onCursor, onSelectEvidence }: {
  spec: StateTimelineSpec
  windowFrom: string
  windowTo: string
  cursor: number | null
  onCursor: (ms: number | null) => void
  onSelectEvidence: (id: string) => void
}) {
  const height = TOP + spec.lanes.length * LANE + 22
  const ts = timeScale(windowFrom, windowTo, LEFT, W - 8)
  return (
    <figure className="rounded-md border border-outline bg-surface p-3">
      <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" onMouseLeave={() => onCursor(null)}>
        {spec.lanes.map((lane, i) => {
          const y = TOP + i * LANE
          return (
            <g key={lane.name}>
              <text x={6} y={y + 15} className="fill-ink-2 text-[11px]">{lane.name}</text>
              {lane.segments.map((s, j) => {
                const x0 = ts.x(s.start)
                const w = Math.max(2, ts.x(s.end) - x0)
                const tone = BAD.test(s.state) ? 'fill-red-soft stroke-red' : OK.test(s.state) ? 'fill-green-soft stroke-green' : 'fill-container-high stroke-outline'
                return (
                  <g key={j} className="cursor-pointer" onClick={() => s.evidence_ids[0] && onSelectEvidence(s.evidence_ids[0])}
                    onMouseMove={() => onCursor(Date.parse(s.start))}>
                    <rect x={x0} y={y + 3} width={w} height={LANE - 6} rx={3} className={tone} strokeWidth={0.6} />
                    {w > 60 && <text x={x0 + 4} y={y + 15} className="fill-ink text-[10px]">{s.state.slice(0, Math.floor(w / 6))}</text>}
                    <title>{`${s.state} · ${fmtTime(s.start)} → ${fmtTime(s.end)}`}</title>
                  </g>
                )
              })}
            </g>
          )
        })}
        {spec.markers.map((m, i) => (
          <line key={i} x1={ts.x(m.at)} x2={ts.x(m.at)} y1={TOP} y2={height - 20} stroke="currentColor"
            className={MARKER_STYLE[m.role]?.className} strokeWidth={1.2} strokeDasharray="4 2" />
        ))}
        {cursor !== null && <line x1={ts.x(cursor)} x2={ts.x(cursor)} y1={TOP} y2={height - 20} className="stroke-ink" strokeWidth={0.8} />}
        {ts.ticks.map((tk) => (
          <text key={tk} x={ts.x(tk)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">{fmtTime(new Date(tk).toISOString())}</text>
        ))}
      </svg>
    </figure>
  )
}
