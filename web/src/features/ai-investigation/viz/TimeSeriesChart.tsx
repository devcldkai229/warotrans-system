import { useMemo, useRef, useState } from 'react'
import type { Series, TimeSeriesSpec } from '@/shared/api/ai'
import { t } from '@/shared/i18n'
import { fmtTime, MARKER_STYLE } from '../model/labels'
import { extent, linearScale, nearestValue, stepPath, timeScale } from './scales'

const W = 760
const BAND = 64
const LEFT = 120
const RIGHT = 12
const TOP = 26

interface Props {
  spec: TimeSeriesSpec
  series: Series[]
  cursor: number | null
  onCursor: (ms: number | null) => void
  onSelectEvidence: (id: string) => void
}

/**
 * One band per series (they have different units), a shared time axis, the AI's markers (onset ●, cause ▲,
 * effect ■) with their evidence, a highlighted anomaly window and a cursor synced with the other charts.
 */
export function TimeSeriesChart({ spec, series, cursor, onCursor, onSelectEvidence }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [hoverMarker, setHoverMarker] = useState<number | null>(null)
  const shown = useMemo(() => spec.series_ids.map((id) => series.find((s) => s.id === id)).filter(Boolean) as Series[], [spec, series])
  const height = TOP + shown.length * BAND + 26
  const ts = timeScale(spec.window_from, spec.window_to, LEFT, W - RIGHT)

  const toMs = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return null
    const px = ((e.clientX - box.left) / box.width) * W
    return px < LEFT || px > W - RIGHT ? null : ts.invert(px)
  }

  return (
    <figure className="rounded-md border border-outline bg-surface p-3">
      <figcaption className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
        <span>{spec.title}</span>
        <span className="flex gap-3 text-xs text-muted">
          {(['ONSET', 'CAUSE', 'EFFECT'] as const).map((r) => (
            <span key={r} className={MARKER_STYLE[r].className}>{markerGlyph(r)} {MARKER_STYLE[r].label}</span>
          ))}
        </span>
      </figcaption>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full select-none"
        role="img"
        aria-label={spec.title}
        onMouseMove={(e) => onCursor(toMs(e))}
        onMouseLeave={() => onCursor(null)}
      >
        {spec.highlight_from && spec.highlight_to && (
          <rect
            x={ts.x(spec.highlight_from) - 2}
            y={TOP - 6}
            width={Math.max(4, ts.x(spec.highlight_to) - ts.x(spec.highlight_from) + 4)}
            height={shown.length * BAND + 6}
            className="fill-amber/10"
          />
        )}
        {shown.map((s, i) => {
          const y0 = TOP + i * BAND
          const [lo, hi] = extent(s.points.map((p) => p.v))
          const y = linearScale(lo, hi, y0 + BAND - 10, y0 + 6)
          const v = cursor === null ? null : nearestValue(s.points, cursor)
          return (
            <g key={s.id}>
              <line x1={LEFT} x2={W - RIGHT} y1={y0 + BAND - 4} y2={y0 + BAND - 4} className="stroke-outline" strokeWidth={0.5} />
              <text x={8} y={y0 + 22} className="fill-ink text-[11px]">{s.label}</text>
              <text x={8} y={y0 + 36} className="fill-muted text-[10px]">{s.unit} · {lo.toFixed(2)}–{hi.toFixed(2)}</text>
              {v !== null && <text x={8} y={y0 + 50} className="fill-primary text-[11px] font-semibold">{v.toFixed(3)}</text>}
              <path d={stepPath(s.points, (t2) => ts.x(t2), y)} fill="none" className="stroke-primary" strokeWidth={1.6} />
            </g>
          )
        })}
        {ts.ticks.map((tk) => (
          <g key={tk}>
            <line x1={ts.x(tk)} x2={ts.x(tk)} y1={TOP - 6} y2={height - 20} className="stroke-outline" strokeWidth={0.4} strokeDasharray="2 3" />
            <text x={ts.x(tk)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">{fmtTime(new Date(tk).toISOString())}</text>
          </g>
        ))}
        {spec.markers.map((m, i) => {
          const x = ts.x(m.at)
          const style = MARKER_STYLE[m.role] ?? MARKER_STYLE.CONTEXT
          return (
            <g
              key={`${m.at}-${i}`}
              className={`${style.className} cursor-pointer`}
              onMouseEnter={() => setHoverMarker(i)}
              onMouseLeave={() => setHoverMarker(null)}
              onClick={() => m.evidence_ids[0] && onSelectEvidence(m.evidence_ids[0])}
            >
              <line x1={x} x2={x} y1={TOP - 8} y2={height - 20} stroke="currentColor" strokeWidth={1.4} />
              <text x={x} y={TOP - 10} textAnchor="middle" fill="currentColor" className="text-[13px]">{markerGlyph(m.role)}</text>
              {hoverMarker === i && (
                <g>
                  <rect x={Math.min(x + 6, W - 250)} y={TOP} width={240} height={44} rx={4} className="fill-surface stroke-outline" />
                  <text x={Math.min(x + 12, W - 244)} y={TOP + 16} className="fill-ink text-[11px] font-semibold">{style.label} · {fmtTime(m.at)}</text>
                  <text x={Math.min(x + 12, W - 244)} y={TOP + 32} className="fill-ink-2 text-[10px]">{m.label.slice(0, 44)}</text>
                </g>
              )}
            </g>
          )
        })}
        {cursor !== null && (
          <line x1={ts.x(cursor)} x2={ts.x(cursor)} y1={TOP - 6} y2={height - 20} className="stroke-ink" strokeWidth={0.8} />
        )}
      </svg>
      {spec.markers.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs">
          {spec.markers.map((m, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2">
              <span className={MARKER_STYLE[m.role]?.className}>{markerGlyph(m.role)} {fmtTime(m.at)}</span>
              <span className="text-ink-2">{m.label}</span>
              {m.evidence_ids.map((e) => (
                <button key={e} type="button" className="rounded bg-container px-1.5 font-mono text-[10px] text-ink-2 hover:bg-container-high" onClick={() => onSelectEvidence(e)}>{e}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {shown.length === 0 && <p className="text-xs text-muted">{t('No series for this chart.')}</p>}
    </figure>
  )
}

function markerGlyph(role: string): string {
  return role === 'ONSET' ? '●' : role === 'CAUSE' ? '▲' : role === 'EFFECT' ? '■' : '◆'
}
