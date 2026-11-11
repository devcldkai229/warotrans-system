import { cx } from '@/shared/lib/cx'
import { formatBattery } from '@/shared/lib/format'

interface BatteryLevelProps {
  /** 0–100 from Fleet API, or null/undefined when never measured. */
  percent: number | null | undefined
  /** Show "36%" / "Unknown" next to the glyph. */
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Laptop-style battery: outline + tip, green fill from the left by SOC %.
 * Unknown (null) keeps an empty shell — never fake 0 %.
 */
export function BatteryLevel({ percent, showLabel = true, size = 'md', className }: BatteryLevelProps) {
  const known = percent !== null && percent !== undefined && Number.isFinite(percent)
  const clamped = known ? Math.min(100, Math.max(0, percent)) : 0
  const fillClass = !known
    ? 'bg-transparent'
    : clamped <= 15
      ? 'bg-red'
      : clamped <= 30
        ? 'bg-amber'
        : 'bg-green'
  const shellClass = !known ? 'border-muted text-muted' : 'border-ink/40 text-ink'
  const tipClass = !known ? 'bg-muted' : 'bg-ink/40'
  const height = size === 'sm' ? 'h-3' : 'h-3.5'
  const width = size === 'sm' ? 'w-6' : 'w-7'
  const tipH = size === 'sm' ? 'h-1.5' : 'h-2'

  return (
    <span
      className={cx('inline-flex items-center gap-1.5 tabular-nums', className)}
      title={known ? `${Math.round(clamped)}%` : 'Battery unknown'}
      aria-label={known ? `Battery ${Math.round(clamped)} percent` : 'Battery unknown'}
    >
      <span className={cx('inline-flex items-center', height)}>
        <span
          className={cx(
            'relative box-border overflow-hidden rounded-[3px] border',
            width,
            height,
            shellClass,
          )}
        >
          {known ? (
            <span
              className={cx('absolute inset-y-[2px] left-[2px] rounded-[1px]', fillClass)}
              style={{ width: `calc((100% - 4px) * ${clamped / 100})` }}
            />
          ) : null}
        </span>
        <span className={cx('ml-px w-0.5 shrink-0 rounded-r-sm', tipH, tipClass)} aria-hidden />
      </span>
      {showLabel ? (
        <span className={cx('text-xs font-medium', !known && 'text-muted')}>{formatBattery(percent)}</span>
      ) : null}
    </span>
  )
}
