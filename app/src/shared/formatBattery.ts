/** HW-04: a battery the robot never reported is "Unknown", never 0 %. */
export function formatBattery(percent: number | null | undefined): string {
  return typeof percent === 'number' && Number.isFinite(percent) ? `${Math.round(percent)}%` : 'Unknown';
}
