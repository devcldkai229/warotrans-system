import { describe, expect, it } from 'vitest'
import type { PlanResponse, PlaybackSpan, TrajectoryResponse } from '@/shared/api/evidence'
import {
  cameraState,
  correctDrift,
  currentEventId,
  footage,
  formatElapsed,
  incidentJump,
  mediaAt,
  pathUntil,
  planAt,
  poseAt,
} from './replayModel'

const T0 = Date.parse('2026-11-17T10:00:00Z')
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()

// 0..1 s valid, 1.2 s invalid (localization lost), 1.4..2 s valid again, then silence until 10 s.
const points: TrajectoryResponse['points'] = [
  [T0, 0, 0, 0, 1],
  [T0 + 500, 0.5, 0, 0, 1],
  [T0 + 1000, 1, 0, Math.PI - 0.1, 1],
  [T0 + 1200, 9, 9, 0, 0],
  [T0 + 1400, 1.4, 0, -Math.PI + 0.1, 1],
  [T0 + 2000, 2, 0, 0, 1],
  [T0 + 10_000, 3, 0, 0, 1],
]

describe('poseAt', () => {
  it('interpolates between two valid samples', () => {
    expect(poseAt(points, T0 + 250)).toEqual({ x: 0.25, y: 0, yaw: 0 })
  })

  it('never crosses an invalid sample or a long silence', () => {
    expect(poseAt(points, T0 + 1100)).toBeNull()
    expect(poseAt(points, T0 + 1300)).toBeNull()
    expect(poseAt(points, T0 + 5000)).toBeNull()
  })

  it('turns the short way round when interpolating yaw', () => {
    const p = poseAt(
      [
        [T0, 0, 0, Math.PI - 0.1, 1],
        [T0 + 100, 0, 0, -Math.PI + 0.1, 1],
      ],
      T0 + 50,
    )
    expect(Math.abs(Math.abs(p!.yaw) - Math.PI)).toBeLessThan(1e-9)
  })

  it('is null before the first sample', () => {
    expect(poseAt(points, T0 - 1)).toBeNull()
  })
})

describe('pathUntil', () => {
  it('splits the driven path at every gap', () => {
    const stretches = pathUntil(points, T0 + 20_000)
    expect(stretches.map((s) => s.length)).toEqual([3, 2])
    expect(pathUntil(points, T0 + 600)).toEqual([[{ x: 0, y: 0 }, { x: 0.5, y: 0 }]])
  })
})

describe('planAt', () => {
  const plans: PlanResponse[] = [
    { planVersion: 1, plannerName: 'nav2', generatedAtUtc: iso(0), validUntilUtc: iso(12_000), reason: 'initial', pathPoints: [[0, 0], [1, 0]] },
    { planVersion: 2, plannerName: 'nav2', generatedAtUtc: iso(12_000), validUntilUtc: null, reason: 'replan', pathPoints: [[0, 0], [1, 1]] },
  ]
  it('shows the plan of the moment, old ones included', () => {
    expect(planAt(plans, T0 + 5000)?.planVersion).toBe(1)
    expect(planAt(plans, T0 + 12_000)?.planVersion).toBe(2)
    expect(planAt(plans, T0 - 1)).toBeNull()
  })
})

describe('mediaAt and cameraState', () => {
  const spans: PlaybackSpan[] = [
    { mediaAssetId: 'a', utcStart: iso(0), utcEnd: iso(30_000), mediaStartMs: 0, mediaEndMs: 30_000, timeErrorBoundMs: 110, mappingMethod: 'CFR_SLOT_V1' },
    { mediaAssetId: 'a', utcStart: iso(40_000), utcEnd: iso(70_000), mediaStartMs: 30_000, mediaEndMs: 60_000, timeErrorBoundMs: 900, mappingMethod: 'CFR_SLOT_V1' },
  ]

  it('maps a UTC instant to the media time of the span holding it', () => {
    expect(mediaAt(spans, T0 + 12_500)).toMatchObject({ assetId: 'a', seconds: 12.5 })
    expect(mediaAt(spans, T0 + 45_000)?.seconds).toBe(35)
  })

  it('reports no video in a gap instead of a frozen frame, and an uncertain sync honestly', () => {
    expect(cameraState(mediaAt(spans, T0 + 35_000), false, true)).toBe('NO_VIDEO_AT_TIME')
    expect(cameraState(mediaAt(spans, T0 + 35_000), true, true)).toBe('PROCESSING')
    expect(cameraState(mediaAt(spans, T0 + 1000), false, true)).toBe('PLAYING')
    expect(cameraState(mediaAt(spans, T0 + 45_000), false, true)).toBe('SYNC_UNCERTAIN')
    expect(cameraState(null, false, false)).toBe('NO_CAMERA')
  })

  it('gives each camera its own offset for the same instant', () => {
    const cameraB: PlaybackSpan[] = [{ ...spans[0], mediaAssetId: 'b', utcStart: iso(40_000), utcEnd: iso(100_000) }]
    expect(mediaAt(spans, T0 + 50_000)!.seconds).toBe(40)
    expect(mediaAt(cameraB, T0 + 50_000)!.seconds).toBe(10)
  })

  it('draws footage ranges on the timeline', () => {
    expect(footage(spans, T0, T0 + 100_000)).toEqual([
      [0, 0.3],
      [0.4, 0.7],
    ])
  })
})

describe('correctDrift', () => {
  it('seeks when far off, nudges the speed when slightly off, leaves it alone otherwise', () => {
    expect(correctDrift(10, 10.5, 1)).toEqual({ kind: 'seek', to: 10 })
    expect(correctDrift(10, 10.1, 1)).toEqual({ kind: 'rate', rate: 0.95 })
    expect(correctDrift(10, 9.9, 2)).toEqual({ kind: 'rate', rate: 2.1 })
    expect(correctDrift(10, 10.05, 1)).toEqual({ kind: 'none' })
  })
})

describe('player helpers', () => {
  const ev = (id: string, offsetMs: number, severity = 'WARNING') => ({ id, severity, occurredAtUtc: iso(offsetMs) })
  const events = [ev('a', 10_000), ev('info', 15_000, 'INFO'), ev('b', 30_000, 'ERROR')]

  it('shows elapsed time as m:ss, and hours when long', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(83_400)).toBe('1:23')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
  })

  it('jumps to the next or previous incident a few seconds early, skipping INFO and the one under the cursor', () => {
    expect(incidentJump(events, T0, 1)).toBe(T0 + 7000)
    expect(incidentJump(events, T0 + 7000, 1)).toBe(T0 + 27_000)
    expect(incidentJump(events, T0 + 27_000, 1)).toBeNull()
    expect(incidentJump(events, T0 + 27_000, -1)).toBe(T0 + 7000)
    expect(incidentJump(events, T0 + 7000, -1)).toBeNull()
  })

  it('knows which event the cursor is at', () => {
    expect(currentEventId(events, T0 + 11_000)).toBe('a')
    expect(currentEventId(events, T0 + 16_000)).toBe('info')
    expect(currentEventId(events, T0 + 25_000)).toBeNull()
  })
})
