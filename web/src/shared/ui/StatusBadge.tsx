import { cx } from '@/shared/lib/cx'
import { humanize } from '@/shared/lib/format'
import { TONE_SOLID, type Tone } from './statusTones'

const TONE_FILL: Record<Tone, string> = {
  green: 'bg-green-soft',
  blue: 'bg-blue-soft',
  amber: 'bg-amber-soft',
  red: 'bg-red-soft',
  purple: 'bg-purple-soft',
  grey: 'bg-container-high',
  teal: 'bg-teal-soft',
  rose: 'bg-rose-soft',
}

const TONE_TEXT: Record<Tone, string> = {
  green: 'text-green-ink',
  blue: 'text-blue-ink',
  amber: 'text-amber-ink',
  red: 'text-red-ink',
  purple: 'text-purple-ink',
  grey: 'text-ink-2',
  teal: 'text-teal-ink',
  rose: 'text-rose-ink',
}

interface StatusBadgeProps {
  tone: Tone
  children: string
  withDot?: boolean
  /** White instead of tinted: for a badge that sits on a grey or coloured background. */
  surface?: boolean
  /** Positioning only (margins, `absolute`); colours come from `tone` and `surface`. */
  className?: string
}

export function StatusBadge({ tone, children, withDot = false, surface = false, className }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        surface ? 'bg-surface' : TONE_FILL[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      {withDot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {humanize(children)}
    </span>
  )
}

export function ToneDot({ tone, size = 'md' }: { tone: Tone; size?: 'sm' | 'md' }) {
  return <span className={cx('shrink-0 rounded-full', size === 'sm' ? 'size-1.5' : 'size-2', TONE_SOLID[tone])} />
}
