import type { RobotBattery } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Meter } from './Meter'
import { batteryDetail, batteryTone, formatBatteryPercent, isBatteryKnown } from './battery'

interface BatteryIndicatorProps {
  percent: number | null | undefined
  battery?: RobotBattery | null
  lowPercent?: number
  /** Show the voltage / mode / confidence / stale line under the value. */
  showDetail?: boolean
  meterClassName?: string
  className?: string
}

/** Battery value + meter. Unknown shows "Unknown" with no meter — never a fake 0 % or 100 %. */
export function BatteryIndicator({
  percent,
  battery,
  lowPercent,
  showDetail = false,
  meterClassName = 'w-12',
  className,
}: BatteryIndicatorProps) {
  const known = isBatteryKnown(percent)
  const detail = showDetail ? batteryDetail(battery) : ''
  return (
    <span className={cx('inline-flex flex-col gap-0.5', className)}>
      <span className="inline-flex items-center gap-2">
        <span className={cx('tabular-nums', !known && 'text-muted')}>{formatBatteryPercent(percent)}</span>
        {known ? <Meter percent={percent} tone={batteryTone(percent, lowPercent)} className={meterClassName} /> : null}
      </span>
      {detail ? <span className="text-[11px] text-muted">{detail}</span> : null}
    </span>
  )
}
