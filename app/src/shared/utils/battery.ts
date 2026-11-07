import type { RobotBattery } from '../types/contracts';

/** Fallback for Fleet:Battery:LowPercent when the API does not provide it. */
export const DEFAULT_LOW_BATTERY_PERCENT = 20;

export function isBatteryKnown(percent: number | null | undefined): percent is number {
  return typeof percent === 'number' && Number.isFinite(percent);
}

/** "64%" or "Unknown" — an unknown battery is never shown as 0 %. */
export function formatBatteryPercent(percent: number | null | undefined): string {
  return isBatteryKnown(percent) ? `${Math.round(percent)}%` : 'Unknown';
}

export function isBatteryLow(percent: number | null | undefined, lowPercent = DEFAULT_LOW_BATTERY_PERCENT): boolean {
  return isBatteryKnown(percent) && percent <= lowPercent;
}

const MODE_LABEL: Record<RobotBattery['estimationMode'], string> = {
  VOLTAGE_ONLY: 'Voltage estimate',
  SIMULATED: 'Simulated',
  REPORTED: 'Reported',
  UNAVAILABLE: 'No sensor reading',
};

/** "11.43 V · Voltage estimate · Low confidence · Stale". Charging only when confirmed. */
export function batteryDetail(battery: RobotBattery | null | undefined): string {
  if (!battery) return '';
  const parts: string[] = [];
  if (isBatteryKnown(battery.voltage)) parts.push(`${battery.voltage.toFixed(2)} V`);
  parts.push(MODE_LABEL[battery.estimationMode] ?? battery.estimationMode);
  if (battery.confidence === 'LOW' || battery.confidence === 'MEDIUM') {
    parts.push(`${battery.confidence === 'LOW' ? 'Low' : 'Medium'} confidence`);
  }
  if (battery.chargingState === 'CHARGING') parts.push('Charging');
  if (isBatteryKnown(battery.percent) && battery.isStale) parts.push('Stale');
  return parts.join(' · ');
}
