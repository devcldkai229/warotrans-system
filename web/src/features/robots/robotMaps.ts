import type { Robot } from '@/shared/api/contracts'
import type { AutoLocalizeStatus } from '@/shared/api/fleet'

export const autoLocalizeKey = (robotId: string) => ['robot-auto-localize', robotId] as const
export const warehouseMapsKey = (warehouseId: string) => ['warehouse-maps', warehouseId] as const

/** The robots of a warehouse that are not on its published map: they get no Job until they are moved to it. */
export function robotsOffPublishedMap<T extends Pick<Robot, 'warehouseId' | 'currentMapVersionId'>>(
  robots: T[],
  warehouseId: string | null,
  publishedMapId: string | null,
): T[] {
  if (!warehouseId || !publishedMapId) return []
  return robots.filter((robot) => robot.warehouseId === warehouseId && robot.currentMapVersionId !== publishedMapId)
}

/** The robot reports another map than the one it is assigned: it is refused every Job (ReportedMapMismatch). */
export function reportsOtherMap(robot: Pick<Robot, 'isOnline' | 'mapVersionCode'>, assignedCode: string | null): boolean {
  const reported = robot.mapVersionCode?.trim()
  if (!robot.isOnline || !reported || !assignedCode) return false
  return reported.toLowerCase() !== assignedCode.trim().toLowerCase()
}

export type AutoLocalizeTone = 'grey' | 'blue' | 'green' | 'amber' | 'red'

/** How an auto-localize ended, in a word the panel shows: running, sure, unsure (look at the suggestions), refused. */
export function autoLocalizeTone(status: Pick<AutoLocalizeStatus, 'state' | 'errorCode'> | null | undefined): AutoLocalizeTone {
  switch (status?.state) {
    case 'RUNNING':
      return 'blue'
    case 'SUCCEEDED':
      return 'green'
    case 'FAILED':
      return status.errorCode === 'LOCALIZATION_AMBIGUOUS' || status.errorCode === 'LOCALIZATION_NO_MATCH' ? 'amber' : 'red'
    case 'REJECTED':
    case 'TIMEOUT':
      return 'red'
    default:
      return 'grey'
  }
}

/** A match score 0..1 as a percentage, for people. */
export function scorePercent(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—'
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
}
