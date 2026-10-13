import { cx } from '@/shared/lib/cx'
import { TONE_SOLID, type Tone } from './statusTones'

interface MeterProps {
  percent: number
  tone?: Tone | 'ink'
  className?: string
}

/** A thin progress bar. Width comes from the caller (`w-12`, `flex-1`, ...). */
export function Meter({ percent, tone = 'ink', className }: MeterProps) {
  return (
    <span className={cx('block h-1.5 overflow-hidden rounded-full bg-container-higher', className)}>
      <span
        className={cx('block h-full rounded-full', tone === 'ink' ? 'bg-ink' : TONE_SOLID[tone])}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  )
}
