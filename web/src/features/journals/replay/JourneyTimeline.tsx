import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Annotation, EvidenceEvent, RecordingSpans, ReplayRun } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { footage, formatElapsed, fraction, ms, type StepSpan, type VideoHole } from './replayModel'

interface JourneyTimelineProps {
  fromMs: number
  toMs: number
  cursorMs: number
  runs: ReplayRun[]
  colors: string[]
  spansByRecording: Record<string, RecordingSpans | undefined>
  events: EvidenceEvent[]
  annotations: Annotation[]
  /** The trips' steps; each run shows those of its own Job on a row under it. */
  steps: StepSpan[]
  activeStepId: string | null
  /** Stretches of each run without picture: amber hatching on the video bar, click to go to where video resumes. */
  holesByRun?: Record<string, VideoHole[]>
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onSeek: (t: number) => void
}

/** Plain colours: the theme has no amber-500 / red-600 classes. */
export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#e11d48',
  ERROR: '#dc2626',
  WARNING: '#f59e0b',
}

export const NOTE_COLOR = '#9333ea'

/** Step blocks: driving in the run's colour, waiting for people in amber, everything else (checks, scans) grey. */
export const STEP_TYPE_COLOR: Record<string, string> = {
  HUMAN_INTERACTION: '#f59e0b',
}
export const STEP_OTHER_COLOR = '#94a3b8'

export const stepColor = (type: string | null, runColor: string) =>
  type === 'MOVE' ? runColor : (type && STEP_TYPE_COLOR[type]) || STEP_OTHER_COLOR

/** Steps of a run: those of its Job; on journals whose events carry no job, every step goes to the only run. */
export function stepsOfRun(steps: StepSpan[], run: ReplayRun, runCount: number): StepSpan[] {
  const own = steps.filter((s) => s.jobId != null && s.jobId === run.sourceJobId)
  return own.length > 0 || runCount > 1 ? own : steps
}

const clock = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * One UTC time ruler for every robot (spec §11.3). Per robot: the trip (thin bar), the video it has (thick bar; what is
 * not covered is a gap) and its incidents as marks; notes on their own row. Click or drag anywhere to move the global
 * cursor; hovering shows the time under the pointer. Arrow keys move 5 s (Shift: 1 s), Home / End jump to the ends.
 */
export function JourneyTimeline({
  fromMs,
  toMs,
  cursorMs,
  runs,
  colors,
  spansByRecording,
  events,
  annotations,
  steps,
  activeStepId,
  holesByRun = {},
  selectedRunId,
  onSelectRun,
  onSeek,
}: JourneyTimelineProps) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hover, setHover] = useState<number | null>(null)
  const span = Math.max(1, toMs - fromMs)
  const left = (time: number) => `${fraction(time, fromMs, toMs) * 100}%`
  const ticks = Array.from({ length: 6 }, (_, i) => fromMs + (span * i) / 5)

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return fromMs
    return fromMs + Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * span
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-mark]')) return
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(timeAt(event.clientX))
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const time = timeAt(event.clientX)
    setHover(time)
    if (dragging.current) onSeek(time)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1000 : 5000
    if (event.key === 'ArrowRight') onSeek(cursorMs + step)
    else if (event.key === 'ArrowLeft') onSeek(cursorMs - step)
    else if (event.key === 'Home') onSeek(fromMs)
    else if (event.key === 'End') onSeek(toMs)
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="flex select-none gap-3 text-xs">
      {/* Lane labels: one per robot; choosing one makes it the main camera. */}
      <div className="flex w-36 shrink-0 flex-col pt-6">
        {runs.map((run, lane) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelectRun(run.id)}
            aria-pressed={run.id === selectedRunId}
            className={cx(
              'flex h-9 items-center gap-2 rounded-sm px-2 text-left transition-colors',
              run.id === selectedRunId ? 'bg-surface font-semibold text-ink' : 'text-ink-2 hover:bg-surface',
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[lane % colors.length] }} />
            <span className="truncate font-mono">{run.robotCode}</span>
          </button>
        )).flatMap((button, lane) =>
          stepsOfRun(steps, runs[lane]!, runs.length).length > 0
            ? [button, <span key={`${runs[lane]!.id}-steps`} className="flex h-7 items-center pl-6 text-muted">{t('Steps')}</span>]
            : [button],
        )}
        {annotations.length > 0 ? <span className="flex h-6 items-center px-2 text-muted">{t('Notes')}</span> : null}
      </div>

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={t('Timeline')}
        aria-valuemin={fromMs}
        aria-valuemax={toMs}
        aria-valuenow={Math.round(cursorMs)}
        aria-valuetext={`${formatElapsed(cursorMs - fromMs)} / ${formatElapsed(span)}`}
        className="relative min-w-0 flex-1 cursor-pointer touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {/* Ruler */}
        <div className="relative h-6">
          {ticks.map((tick, i) => (
            <span
              key={tick}
              className={cx(
                'absolute top-0.5 whitespace-nowrap font-mono text-[11px] text-muted',
                i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: left(tick) }}
            >
              {clock(tick)}
            </span>
          ))}
        </div>

        {runs.map((run, lane) => {
          const color = colors[lane % colors.length]
          const start = ms(run.startedAtUtc) ?? fromMs
          const end = ms(run.endedAtUtc) ?? toMs
          const runSteps = stepsOfRun(steps, run, runs.length)
          return (
            <div key={run.id}>
            <div className="relative h-9 border-t border-outline-variant/60">
              {/* The trip */}
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-30"
                style={{ left: left(start), width: `${(fraction(end, fromMs, toMs) - fraction(start, fromMs, toMs)) * 100}%`, background: color }}
              />
              {/* Video */}
              {run.recordings.flatMap((recording) =>
                footage(spansByRecording[recording.id]?.spans ?? [], fromMs, toMs).map(([a, b], i) => (
                  <div
                    key={`${recording.id}-${i}`}
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm"
                    style={{ left: `${a * 100}%`, width: `${Math.max(0.2, (b - a) * 100)}%`, background: color }}
                    title={t('Video')}
                  />
                )),
              )}
              {/* No video: amber hatching where the run has no picture */}
              {(holesByRun[run.id] ?? []).map((h) => {
                const a = fraction(h.fromMs, fromMs, toMs)
                const b = fraction(h.toMs, fromMs, toMs)
                return (
                  <button
                    key={`hole-${h.fromMs}`}
                    type="button"
                    data-mark
                    data-testid="video-hole-mark"
                    title={`${clock(h.fromMs)} → ${clock(h.toMs)} · ${t('No video')} (${formatElapsed(h.toMs - h.fromMs)})`}
                    onClick={() => onSeek(h.nextVideoMs ?? h.fromMs)}
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm"
                    style={{
                      left: `${a * 100}%`,
                      width: `max(3px, ${Math.max(0, b - a) * 100}%)`,
                      background: 'repeating-linear-gradient(135deg, rgb(245 158 11 / 0.85) 0 3px, rgb(245 158 11 / 0.25) 3px 6px)',
                    }}
                  />
                )
              })}
              {/* Incidents */}
              {events
                .filter((e) => e.runId === run.id && e.severity !== 'INFO')
                .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    data-mark
                    title={`${clock(Date.parse(e.occurredAtUtc))} · ${e.message ?? e.eventType}`}
                    onClick={() => onSeek(Date.parse(e.occurredAtUtc) - 3000)}
                    className="absolute bottom-0.5 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] ring-2 ring-container hover:scale-125"
                    style={{ left: left(Date.parse(e.occurredAtUtc)), background: SEVERITY_COLOR[e.severity] ?? '#94a3b8' }}
                  />
                ))}
            </div>
            {runSteps.length > 0 ? (
              <div className="relative h-7" data-testid="step-lane">
                {runSteps.map((s) => {
                  const a = fraction(s.startMs, fromMs, toMs)
                  const b = fraction(s.endMs ?? Math.max(cursorMs, s.startMs), fromMs, toMs)
                  const active = s.stepId === activeStepId
                  const label = `${s.position != null && s.count != null ? `${s.position}/${s.count} ` : ''}${s.name}${s.targetCode ? ` · ${s.targetCode}` : ''}`
                  return (
                    <button
                      key={s.stepId}
                      type="button"
                      data-mark
                      data-step-id={s.stepId}
                      data-active={active || undefined}
                      title={`${clock(s.startMs)} · ${label} · ${formatElapsed((s.endMs ?? cursorMs) - s.startMs)}`}
                      aria-label={label}
                      onClick={() => onSeek(s.startMs)}
                      className={cx(
                        'absolute top-1/2 h-4 -translate-y-1/2 rounded-[3px] border border-container transition-[opacity,box-shadow]',
                        active ? 'z-10 opacity-100 shadow-[0_0_0_2px_var(--color-ink)]' : 'opacity-55 hover:opacity-90',
                        s.status === 'FAILED' && 'bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(0,0,0,.25)_3px_6px)]',
                      )}
                      style={{
                        left: `${a * 100}%`,
                        width: `max(4px, ${Math.max(0, b - a) * 100}%)`,
                        backgroundColor: s.status === 'FAILED' ? SEVERITY_COLOR.ERROR : stepColor(s.type, color),
                      }}
                    />
                  )
                })}
              </div>
            ) : null}
            </div>
          )
        })}

        {annotations.length > 0 ? (
          <div className="relative h-6 border-t border-outline-variant/60">
            {annotations.map((a) => (
              <button
                key={a.id}
                type="button"
                data-mark
                title={`${clock(Date.parse(a.atUtc))} · ${a.note}`}
                onClick={() => onSeek(Date.parse(a.atUtc))}
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-container hover:scale-125"
                style={{ left: left(Date.parse(a.atUtc)), background: NOTE_COLOR }}
              />
            ))}
          </div>
        ) : null}

        {/* Hover line + time */}
        {hover != null ? (
          <div className="pointer-events-none absolute top-6 bottom-0 w-px bg-ink/30" style={{ left: left(hover) }}>
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[11px] text-surface">
              {clock(hover)}
            </span>
          </div>
        ) : null}

        {/* Cursor */}
        <div className="pointer-events-none absolute top-5 bottom-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: left(cursorMs) }}>
          <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-primary ring-2 ring-container" />
        </div>
      </div>
    </div>
  )
}
