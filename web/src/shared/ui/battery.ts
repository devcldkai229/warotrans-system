import type { RobotBattery } from '@/shared/api/contracts'
import type { Tone } from './statusTones'

/** Default Fleet:Battery:LowPercent when the API does not say (statistics return the configured value). */
export const DEFAULT_LOW_BATTERY_PERCENT = 20

export function isBatteryKnown(percent: number | null | undefined): percent is number {
  return typeof percent === 'number' && Number.isFinite(percent)
}

/** "64%" or "Unknown" — an unknown battery is never shown as 0 %. */
export function formatBatteryPercent(percent: number | null | undefined): string {
  return isBatteryKnown(percent) ? `${Math.round(percent)}%` : 'Unknown'
}

export function batteryTone(percent: number | null | undefined, lowPercent = DEFAULT_LOW_BATTERY_PERCENT): Tone {
  if (!isBatteryKnown(percent)) return 'grey'
  if (percent <= lowPercent) return 'red'
  if (percent <= lowPercent * 2) return 'amber'
  return 'green'
}

const MODE_LABEL: Record<RobotBattery['estimationMode'], string> = {
  VOLTAGE_ONLY: 'Voltage estimate',
  SIMULATED: 'Simulated',
  REPORTED: 'Reported',
  UNAVAILABLE: 'No sensor reading',
}

/** Secondary line: "11.43 V · Voltage estimate · Low confidence · Stale". Charging is shown only when confirmed. */
export function batteryDetail(battery: RobotBattery | null | undefined): string {
  if (!battery) return ''
  const parts: string[] = []
  if (isBatteryKnown(battery.voltage)) parts.push(`${battery.voltage.toFixed(2)} V`)
  parts.push(MODE_LABEL[battery.estimationMode] ?? battery.estimationMode)
  if (battery.confidence === 'LOW' || battery.confidence === 'MEDIUM') {
    parts.push(`${battery.confidence === 'LOW' ? 'Low' : 'Medium'} confidence`)
  }
  if (battery.chargingState === 'CHARGING') parts.push('Charging')
  if (isBatteryKnown(battery.percent) && battery.isStale) parts.push('Stale')
  return parts.join(' · ')
}

const DISPATCH_LABEL: Record<RobotBattery['dispatchStatus'], string> = {
  ELIGIBLE: 'Can take Jobs',
  UNKNOWN: 'Battery unknown — not dispatched',
  STALE: 'Battery reading stale — not dispatched',
  LOW: 'Battery too low for new Jobs',
}

export function batteryDispatchLabel(battery: RobotBattery | null | undefined): string | null {
  if (!battery) return null
  return battery.dispatchAllowed && battery.dispatchStatus !== 'ELIGIBLE'
    ? `${DISPATCH_LABEL[battery.dispatchStatus]} (development override on)`
    : DISPATCH_LABEL[battery.dispatchStatus]
}

/** Backend Start Job errors caused by the battery gate, in words an operator can act on. */
export const BATTERY_START_ERRORS: Record<string, string> = {
  no_robot_battery_eligible: 'No free robot has a usable battery reading. The Job stays queued — start it again later.',
  robot_battery_unknown: 'This robot has no battery reading, so it cannot take a Job.',
  robot_battery_stale: 'This robot’s battery reading is out of date, so it cannot take a Job.',
  robot_battery_low: 'This robot’s battery is too low for a new Job.',
}
