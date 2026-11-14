import type { Point } from '@/shared/api/contracts'
import type { RobotPosePoint } from '@/shared/api/fleet'
import { formatClock, formatDateTimeFull } from '@/shared/lib/format'

export const PERIODS = {
  '1h': { hours: 1, label: 'Last hour' },
  '8h': { hours: 8, label: 'Last 8 hours' },
  '24h': { hours: 24, label: 'Last 24 hours' },
  '7d': { hours: 24 * 7, label: 'Last 7 days' },
} as const

export type PeriodKey = keyof typeof PERIODS

/**
 * Two points further apart than this in time AND in space were not joined by anything recorded (the robot was lost,
 * offline, or the backend was down): the map draws that stretch as unknown instead of as a straight drive.
 */
export const GAP_SECONDS = 30
export const GAP_METERS = 0.5

/**
 * The points that belong on the map being shown. A point without a map code is kept (older robots send none); points
 * on another map are left out and counted, so the page can say so instead of drawing them in the wrong place.
 */
export function pathOnMap(points: RobotPosePoint[], mapCode: string | null): { points: RobotPosePoint[]; elsewhere: number } {
  if (!mapCode) return { points, elsewhere: 0 }
  const kept = points.filter((point) => point.mapVersionCode === null || point.mapVersionCode === mapCode)
  return { points: kept, elsewhere: points.length - kept.length }
}

/** The path cut where nothing was recorded between two points (see GAP_SECONDS / GAP_METERS). */
export function trailSegments(points: RobotPosePoint[]): Point[][] {
  const segments: Point[][] = []
  let current: Point[] = []
  points.forEach((point, index) => {
    const previous = points[index - 1]
    if (previous) {
      const seconds = (Date.parse(point.at) - Date.parse(previous.at)) / 1000
      const meters = Math.hypot(point.x - previous.x, point.y - previous.y)
      if (seconds > GAP_SECONDS && meters > GAP_METERS) {
        segments.push(current)
        current = []
      }
    }
    current.push({ x: point.x, y: point.y })
  })
  if (current.length > 0) segments.push(current)
  return segments
}

/**
 * The two ends of a path as people read them: `14/11/2026 10:19:05` and, on the same day, only `10:19:58`, so a Job of
 * a minute does not read "10:19 to 10:19".
 */
export function rangeEnds(fromIso: string, toIso: string): { from: string; to: string } {
  const from = formatDateTimeFull(fromIso)
  const to = formatDateTimeFull(toIso)
  return { from, to: from.slice(0, 10) === to.slice(0, 10) ? formatClock(toIso) : to }
}
