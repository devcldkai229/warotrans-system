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

/** Elapsed time on the player: m:ss, or h:mm:ss past an hour. */
export function formatElapsed(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

interface TimedEvent {
  id: string
  severity: string
  occurredAtUtc: string
}

/** Incidents (anything above INFO) in time order. */
export function incidents<T extends TimedEvent>(events: T[]): T[] {
  return events.filter((e) => e.severity !== 'INFO').sort((a, b) => Date.parse(a.occurredAtUtc) - Date.parse(b.occurredAtUtc))
}

/**
 * Where "next / previous incident" jumps: a few seconds before it, so the lead-up is seen. Incidents within half a
 * second of the cursor are skipped (the one being looked at). Null when there is none in that direction.
 */
export function incidentJump<T extends TimedEvent>(events: T[], cursorMs: number, direction: 1 | -1, leadMs = 3000): number | null {
  const times = incidents(events).map((e) => Date.parse(e.occurredAtUtc))
  if (direction === 1) {
    const next = times.find((t) => t - leadMs > cursorMs + 500)
    return next == null ? null : next - leadMs
  }
  const previous = [...times].reverse().find((t) => t - leadMs < cursorMs - 500)
  return previous == null ? null : previous - leadMs
}

/** The event the cursor is at: the last one at or before it, within a window. */
export function currentEventId<T extends TimedEvent>(events: T[], cursorMs: number, windowMs = 4000): string | null {
  let best: T | null = null
  for (const e of events) {
    const at = Date.parse(e.occurredAtUtc)
    if (at <= cursorMs && cursorMs - at <= windowMs && (!best || at >= Date.parse(best.occurredAtUtc))) best = e
  }
  return best?.id ?? null
}

/** Ranges with video of one recording, as fractions of the timeline (gaps are what is not covered). */
export function footage(spans: PlaybackSpan[], from: number, to: number): [number, number][] {
  return spans
    .map((s) => [fraction(Date.parse(s.utcStart), from, to), fraction(Date.parse(s.utcEnd), from, to)] as [number, number])
    .filter(([a, b]) => b > a)
}

/** What the core said about a step (job.step-status-changed payload). Older journals carry only the key. */
interface StepPayload {
  jobId?: string
  jobStepId?: string
  stepKey?: string
  status?: string
  stepType?: string
  stepName?: string
  taskName?: string
  stepPosition?: number
  stepCount?: number
  targetEndpointCode?: string
  targetEndpointName?: string
  errorCode?: string | null
}

export const STEP_EVENT_TYPE = 'job.step-status-changed'

/**
 * The Recorder returns the whole core envelope as the event payload: correlation fields on top (jobStepId,
 * sourceStatusCode …) and the core's own event under `payload`. Flatten both, the core event winning, so a payload
 * that is already flat (older shapes) reads the same.
 */
function stepPayload(raw: unknown): StepPayload {
  const envelope = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const inner = (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {}) as StepPayload
  const top = envelope as StepPayload & { sourceStatusCode?: string }
  return {
    ...top,
    ...inner,
    status: inner.status ?? top.status ?? top.sourceStatusCode,
    jobStepId: inner.jobStepId ?? top.jobStepId,
    jobId: inner.jobId ?? top.jobId,
  }
}

const STEP_DONE = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'])

/** One step of a trip as it ran: from its first status to its end (or the next step when it never said so). */
export interface StepSpan {
  stepId: string
  jobId: string | null
  key: string
  name: string
  type: string | null
  taskName: string | null
  position: number | null
  count: number | null
  targetCode: string | null
  targetName: string | null
  startMs: number
  /** Null while it still ran when the journal ends. */
  endMs: number | null
  /** Last status seen: EXECUTING, WAITING, COMPLETED, FAILED … */
  status: string
}

/**
 * The trip's steps on the timeline, in start order, built from the step events. A step that never reported its end
 * ends when the next step of the same trip starts. Skipped steps that never ran (no time on the clock) are left out.
 */
export function stepTimeline(events: { eventType: string; occurredAtUtc: string; payload: unknown }[]): StepSpan[] {
  const byStep = new Map<string, StepSpan>()
  const sorted = events.filter((e) => e.eventType === STEP_EVENT_TYPE).sort((a, b) => Date.parse(a.occurredAtUtc) - Date.parse(b.occurredAtUtc))
  for (const e of sorted) {
    const p = stepPayload(e.payload)
    if (!p.jobStepId) continue
    const at = Date.parse(e.occurredAtUtc)
    const status = p.status ?? ''
    let span = byStep.get(p.jobStepId)
    if (!span) {
      if (STEP_DONE.has(status) && status !== 'FAILED' && status !== 'COMPLETED') continue
      span = {
        stepId: p.jobStepId,
        jobId: p.jobId ?? null,
        key: p.stepKey ?? '',
        name: p.stepName || p.stepKey || '',
        type: p.stepType ?? null,
        taskName: p.taskName ?? null,
        position: p.stepPosition ?? null,
        count: p.stepCount ?? null,
        targetCode: p.targetEndpointCode ?? null,
        targetName: p.targetEndpointName ?? null,
        startMs: at,
        endMs: null,
        status,
      }
      byStep.set(p.jobStepId, span)
    }
    span.status = status
    span.targetCode ??= p.targetEndpointCode ?? null
    span.targetName ??= p.targetEndpointName ?? null
    if (STEP_DONE.has(status)) span.endMs = at
    else if (span.endMs != null) span.endMs = null // reopened (paused, then resumed)
  }
  const spans = [...byStep.values()].sort((a, b) => a.startMs - b.startMs || (a.position ?? 0) - (b.position ?? 0))
  for (const span of spans) {
    if (span.endMs != null) continue
    const next = spans.find((s) => s !== span && s.jobId === span.jobId && s.startMs > span.startMs)
    if (next) span.endMs = next.startMs
  }
  return spans
}

/** The step running at an instant: the latest-started one that covers it. Null between trips or before the first. */
export function stepAt(spans: StepSpan[], t: number): StepSpan | null {
  let best: StepSpan | null = null
  for (const s of spans) {
    if (s.startMs <= t && (s.endMs == null || t < s.endMs) && (!best || s.startMs >= best.startMs)) best = s
  }
  return best
}

/** Where "previous / next step" goes: the start of the step before or after the one at the cursor. */
export function stepJump(spans: StepSpan[], cursorMs: number, direction: 1 | -1): number | null {
  const starts = [...new Set(spans.map((s) => s.startMs))].sort((a, b) => a - b)
  if (direction === 1) return starts.find((t) => t > cursorMs + 250) ?? null
  const current = stepAt(spans, cursorMs)
  // From inside a step that has run a while, "previous" first goes back to its own start, like a media player.
  if (current && cursorMs - current.startMs > 1500) return current.startMs
  return [...starts].reverse().find((t) => t < cursorMs - 250 && t !== current?.startMs) ?? starts[0] ?? null
}
