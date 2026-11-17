/**
 * Pure replay logic (spec §6.4, §11.4), kept apart from React so it is unit tested:
 * one global UTC cursor; each robot's pose and each camera's media time are derived from it, never from another
 * camera's player. A gap stays a gap: no pose is interpolated across invalid samples or long silences, and no video
 * is shown where no span covers the cursor.
 */
import type { PlanResponse, PlaybackSpan, TrajectoryResponse } from '@/shared/api/evidence'

export interface Pose {
  x: number
  y: number
  yaw: number
}

export interface Point {
  x: number
  y: number
}

/** Samples further apart than this are not joined (the robot was not observed in between). */
export const MAX_JOIN_MS = 2000

export const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null)

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * f
}

/** Index of the last sample at or before t (binary search); -1 when t is before the first. */
function lastAtOrBefore(points: TrajectoryResponse['points'], t: number): number {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/**
 * The robot's pose at t: interpolated between the two valid samples around t; null in a gap (invalid sample on either
 * side, samples too far apart) or outside the recorded path.
 */
export function poseAt(points: TrajectoryResponse['points'], t: number): Pose | null {
  const i = lastAtOrBefore(points, t)
  if (i < 0) return null
  const a = points[i]
  if (a[4] !== 1) return null
  if (a[0] === t || i === points.length - 1) return t - a[0] <= MAX_JOIN_MS ? { x: a[1], y: a[2], yaw: a[3] } : null
  const b = points[i + 1]
  if (b[4] !== 1 || b[0] - a[0] > MAX_JOIN_MS) return null
  const f = (t - a[0]) / (b[0] - a[0])
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, yaw: lerpAngle(a[3], b[3], f) }
}

/** The driven path up to t as separate stretches (a new stretch after every gap). */
export function pathUntil(points: TrajectoryResponse['points'], t: number): Point[][] {
  const out: Point[][] = []
  let current: Point[] = []
  let prev: number | null = null
  for (const p of points) {
    if (p[0] > t) break
    if (p[4] !== 1 || (prev !== null && p[0] - prev > MAX_JOIN_MS)) {
      if (current.length > 1) out.push(current)
      current = []
    }
    if (p[4] === 1) current.push({ x: p[1], y: p[2] })
    prev = p[4] === 1 ? p[0] : null
  }
  if (current.length > 1) out.push(current)
  return out
}

/** The plan the robot followed at t (generated before t, not yet replaced). */
export function planAt(plans: PlanResponse[], t: number): PlanResponse | null {
  let best: PlanResponse | null = null
  for (const p of plans) {
    const from = Date.parse(p.generatedAtUtc)
    const until = p.validUntilUtc ? Date.parse(p.validUntilUtc) : Number.POSITIVE_INFINITY
    if (from <= t && t < until && (!best || p.planVersion > best.planVersion)) best = p
  }
  return best
}

export interface MediaPosition {
  assetId: string
  seconds: number
  errorMs: number
  verified: boolean
}

/** Where a camera's video is at UTC t, from the measured spans; null when no video covers t. */
export function mediaAt(spans: PlaybackSpan[], t: number): MediaPosition | null {
  for (const s of spans) {
    const a = Date.parse(s.utcStart)
    const b = Date.parse(s.utcEnd)
    if (a <= t && t < b) {
      return {
        assetId: s.mediaAssetId,
        seconds: (s.mediaStartMs + (t - a)) / 1000,
        errorMs: s.timeErrorBoundMs ?? Number.POSITIVE_INFINITY,
        verified: s.mappingMethod === 'CFR_SLOT_V1',
      }
    }
  }
  return null
}

/** A cursor this uncertain is labelled "sync uncertain" instead of claiming an exact match (spec §6.2). */
export const SYNC_UNCERTAIN_MS = 500

export type CameraState = 'PLAYING' | 'NO_VIDEO_AT_TIME' | 'PROCESSING' | 'SYNC_UNCERTAIN' | 'NO_CAMERA'

export function cameraState(position: MediaPosition | null, processing: boolean, hasRecording: boolean): CameraState {
  if (!hasRecording) return 'NO_CAMERA'
  if (!position) return processing ? 'PROCESSING' : 'NO_VIDEO_AT_TIME'
  return position.errorMs > SYNC_UNCERTAIN_MS || !position.verified ? 'SYNC_UNCERTAIN' : 'PLAYING'
}

export type DriftAction = { kind: 'none' } | { kind: 'seek'; to: number } | { kind: 'rate'; rate: number }

/** Keeps a player on the global cursor: seek when far off, nudge the speed when slightly off (spec §11.4). */
export function correctDrift(wantedSeconds: number, playerSeconds: number, baseRate: number): DriftAction {
  const drift = playerSeconds - wantedSeconds
  const abs = Math.abs(drift)
  if (abs > 0.25) return { kind: 'seek', to: wantedSeconds }
  if (abs > 0.08) return { kind: 'rate', rate: baseRate * (drift > 0 ? 0.95 : 1.05) }
  return { kind: 'none' }
}

/** Position of an instant on the timeline, 0..1. */
export function fraction(t: number, from: number, to: number): number {
  return to <= from ? 0 : Math.min(1, Math.max(0, (t - from) / (to - from)))
}

/** Ranges with video of one recording, as fractions of the timeline (gaps are what is not covered). */
export function footage(spans: PlaybackSpan[], from: number, to: number): [number, number][] {
  return spans
    .map((s) => [fraction(Date.parse(s.utcStart), from, to), fraction(Date.parse(s.utcEnd), from, to)] as [number, number])
    .filter(([a, b]) => b > a)
}
