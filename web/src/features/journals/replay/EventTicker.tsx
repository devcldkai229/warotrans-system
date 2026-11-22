import { useMemo } from 'react'
import type { EvidenceEvent } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { describeEvent } from './eventText'
import { SEVERITY_COLOR } from './JourneyTimeline'
import { tickerPosition } from './replayModel'

const ROW = 30
const VISIBLE_ROWS = 5

const clock = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * What happened, under the video, in time with it: the event at the cursor sits on the middle row, earlier ones above,
 * coming ones below (faded). Between two events the list drifts at a steady pace (no jumps while playing); seeking
 * glides there. Click a line to go to that moment.
 */
export function EventTicker({ events, cursorMs, onSeek }: { events: EvidenceEvent[]; cursorMs: number; onSeek: (t: number) => void }) {
  const rows = useMemo(
    () =>
      [...events]
        .sort((a, b) => Date.parse(a.occurredAtUtc) - Date.parse(b.occurredAtUtc))
        .map((e) => ({ e, at: Date.parse(e.occurredAtUtc), text: describeEvent(e) })),
    [events],
  )
  if (rows.length === 0) return null
  const position = tickerPosition(rows.map((r) => r.at), cursorMs)
  let current = -1
  rows.forEach((r, i) => {
    if (r.at <= cursorMs) current = i
  })
  const middle = Math.floor(VISIBLE_ROWS / 2)
  const offset = (middle - position) * ROW

  return (
    <section
      aria-label={t('What happened')}
      className="relative overflow-hidden rounded-lg border border-outline-soft bg-container"
      style={{ height: ROW * VISIBLE_ROWS + 8 }}
      data-testid="event-ticker"
    >
      {/* The line the feed is at. */}
      <div className="pointer-events-none absolute inset-x-0 z-0 bg-primary/8" style={{ top: 4 + middle * ROW, height: ROW }} />
      <ol
        className="relative z-1 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateY(${4 + offset}px)` }}
      >
        {rows.map((r, i) => {
          const past = i < current
          const now = i === current
          return (
            <li key={r.e.id} style={{ height: ROW }}>
              <button
                type="button"
                onClick={() => onSeek(r.at)}
                data-current={now || undefined}
                className={cx(
                  'flex h-full w-full items-center gap-3 px-3 text-left text-xs transition-opacity duration-300',
                  now ? 'font-semibold text-ink' : past ? 'text-ink-2 opacity-70 hover:opacity-100' : 'text-ink-2 opacity-40 hover:opacity-90',
                )}
              >
                <span className="w-16 shrink-0 font-mono tabular-nums text-muted">{clock(r.at)}</span>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: SEVERITY_COLOR[r.e.severity] ?? (now ? 'var(--color-primary)' : 'var(--color-outline-variant)') }}
                  aria-hidden
                />
                <span className="truncate">{r.text}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {/* Soft fade at both edges so lines slide in and out. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-2 h-6 bg-gradient-to-b from-container to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-6 bg-gradient-to-t from-container to-transparent" />
    </section>
  )
}
