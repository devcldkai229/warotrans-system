import type { Annotation, EvidenceEvent, RecordingSpans, ReplayRun } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { footage, fraction, ms } from './replayModel'

interface JourneyTimelineProps {
  fromMs: number
  toMs: number
  cursorMs: number
  runs: ReplayRun[]
  colors: string[]
  spansByRecording: Record<string, RecordingSpans | undefined>
  events: EvidenceEvent[]
  annotations: Annotation[]
  onSeek: (t: number) => void
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#b91c1c',
  ERROR: '#dc2626',
  WARNING: '#d97706',
  INFO: '#94a3b8',
}

function label(t0: number): string {
  return new Date(t0).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * One UTC time ruler for every robot (spec §11.3): per robot, the run (thin bar), the video it has (thick bar: what
 * is not covered is a gap), incidents and notes as marks. Click anywhere to put the global cursor there.
 */
export function JourneyTimeline({ fromMs, toMs, cursorMs, runs, colors, spansByRecording, events, annotations, onSeek }: JourneyTimelineProps) {
  const laneHeight = 30
  const top = 22
  const height = top + runs.length * laneHeight + 26
  const ticks = Array.from({ length: 7 }, (_, i) => fromMs + ((toMs - fromMs) * i) / 6)
  const x = (time: number) => `${fraction(time, fromMs, toMs) * 100}%`

  return (
    <svg
      role="slider"
      aria-label={t('Timeline')}
      aria-valuemin={fromMs}
      aria-valuemax={toMs}
      aria-valuenow={cursorMs}
      tabIndex={0}
      className="w-full cursor-pointer select-none"
      height={height}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        onSeek(fromMs + ((event.clientX - box.left) / box.width) * (toMs - fromMs))
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') onSeek(cursorMs + 1000)
        if (event.key === 'ArrowLeft') onSeek(cursorMs - 1000)
      }}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={14} y2={height - 20} stroke="currentColor" className="text-outline-soft" />
          <text x={x(tick)} y={10} fontSize={10} textAnchor="middle" className="fill-ink-2">
            {label(tick)}
          </text>
        </g>
      ))}
      {runs.map((run, lane) => {
        const y = top + lane * laneHeight
        const start = ms(run.startedAtUtc) ?? fromMs
        const end = ms(run.endedAtUtc) ?? toMs
        const color = colors[lane % colors.length]
        return (
          <g key={run.id}>
            <text x={2} y={y + 9} fontSize={10} className="fill-ink-2">
              {run.robotCode}
            </text>
            <rect x={x(start)} y={y + 12} width={`${(fraction(end, fromMs, toMs) - fraction(start, fromMs, toMs)) * 100}%`} height={3} fill={color} opacity={0.35} />
            {run.recordings.flatMap((recording) =>
              footage(spansByRecording[recording.id]?.spans ?? [], fromMs, toMs).map(([a, b], i) => (
                <rect key={`${recording.id}-${i}`} x={`${a * 100}%`} y={y + 10} width={`${(b - a) * 100}%`} height={7} rx={2} fill={color} />
              )),
            )}
            {events
              .filter((e) => e.runId === run.id && e.severity !== 'INFO')
              .map((e) => (
                <rect key={e.id} x={x(Date.parse(e.occurredAtUtc))} y={y + 19} width={3} height={8} fill={SEVERITY_COLOR[e.severity]}>
                  <title>{e.message ?? e.eventType}</title>
                </rect>
              ))}
          </g>
        )
      })}
      {annotations.map((a) => (
        <circle key={a.id} cx={x(Date.parse(a.atUtc))} cy={height - 12} r={4} fill="#7c3aed">
          <title>{a.note}</title>
        </circle>
      ))}
      <line x1={x(cursorMs)} x2={x(cursorMs)} y1={12} y2={height - 6} stroke="#0f172a" strokeWidth={2} />
    </svg>
  )
}
