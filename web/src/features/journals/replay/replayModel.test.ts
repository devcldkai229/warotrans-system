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
  STEP_EVENT_TYPE,
  stepAt,
  stepJump,
  stepTimeline,
  activityAt,
  holeAt,
  tickerPosition,
  videoHoles,
  type StepSpan,
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

describe('step timeline', () => {
  const step = (offsetMs: number, jobStepId: string, status: string, extra: Record<string, unknown> = {}) => ({
    eventType: STEP_EVENT_TYPE,
    occurredAtUtc: iso(offsetMs),
    payload: { jobId: 'J1', jobStepId, stepKey: jobStepId.toLowerCase(), status, ...extra },
  })
  const events = [
    step(0, 'S1', 'EXECUTING', { stepName: 'Move to inbound', stepType: 'MOVE', stepPosition: 1, stepCount: 3, targetEndpointCode: 'EP-INBOUND' }),
    step(20_000, 'S1', 'COMPLETED'),
    step(20_000, 'S2', 'EXECUTING', { stepName: 'Confirm pickup', stepType: 'HUMAN_INTERACTION', stepPosition: 2, stepCount: 3 }),
    step(21_000, 'S2', 'WAITING'),
    step(45_000, 'S3', 'EXECUTING', { stepName: 'Move to shelf', stepType: 'MOVE', stepPosition: 3, stepCount: 3 }),
    step(46_000, 'X9', 'SKIPPED'),
    { eventType: 'robot.command-lifecycle', occurredAtUtc: iso(1000), payload: {} },
  ]

  it('builds one span per step, closing a step that never said so at the next start', () => {
    const spans = stepTimeline(events)
    expect(spans.map((s) => [s.stepId, s.startMs - T0, s.endMs == null ? null : s.endMs - T0, s.status])).toEqual([
      ['S1', 0, 20_000, 'COMPLETED'],
      ['S2', 20_000, 45_000, 'WAITING'],
      ['S3', 45_000, null, 'EXECUTING'],
    ])
    expect(spans[0]).toMatchObject({ name: 'Move to inbound', type: 'MOVE', position: 1, count: 3, targetCode: 'EP-INBOUND' })
  })

  it('falls back to the step key on old journals', () => {
    expect(stepTimeline([step(0, 'MOVE_A', 'EXECUTING')])[0]!.name).toBe('move_a')
  })

  it('finds the step at any second, and none before the first', () => {
    const spans = stepTimeline(events)
    expect(stepAt(spans, T0 - 1)).toBeNull()
    expect(stepAt(spans, T0 + 19_999)?.stepId).toBe('S1')
    expect(stepAt(spans, T0 + 20_000)?.stepId).toBe('S2')
    expect(stepAt(spans, T0 + 30_000)?.stepId).toBe('S2')
    expect(stepAt(spans, T0 + 90_000)?.stepId).toBe('S3')
  })

  it('jumps to the next step start, and back to the current start first', () => {
    const spans = stepTimeline(events)
    expect(stepJump(spans, T0 + 5000, 1)).toBe(T0 + 20_000)
    expect(stepJump(spans, T0 + 30_000, -1)).toBe(T0 + 20_000)
    expect(stepJump(spans, T0 + 20_500, -1)).toBe(T0)
    expect(stepJump(spans, T0 + 50_000, 1)).toBeNull()
  })

  it('reads the envelope the Recorder returns (core event under payload, status as sourceStatusCode)', () => {
    // Shape copied from GET /api/evidence/journals/{id}/events of the real RBT-001 trip R211126002.
    const envelope = (offsetMs: number, status: string, inner: Record<string, unknown>) => ({
      eventType: STEP_EVENT_TYPE,
      occurredAtUtc: iso(offsetMs),
      payload: {
        jobId: 'J1',
        jobNo: 'J211126002',
        source: 'warotrans-core',
        jobStepId: 'S1',
        sourceStatusCode: status,
        eventType: STEP_EVENT_TYPE,
        payload: { jobId: 'J1', jobStepId: 'S1', status, stepKey: 'MOVE_TO_PICKUP', ...inner },
      },
    })
    const spans = stepTimeline([
      envelope(0, 'EXECUTING', { stepName: 'Move to Pickup', stepType: 'MOVE', stepPosition: 1, stepCount: 4, targetEndpointCode: 'EP-SHELF-C-1', targetEndpointName: 'Shelf C 1' }),
      envelope(24_000, 'COMPLETED', { stepName: 'Move to Pickup', stepType: 'MOVE', stepPosition: 1, stepCount: 4 }),
    ])
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      stepId: 'S1',
      jobId: 'J1',
      name: 'Move to Pickup',
      type: 'MOVE',
      position: 1,
      count: 4,
      targetCode: 'EP-SHELF-C-1',
      targetName: 'Shelf C 1',
      status: 'COMPLETED',
    })
    expect(spans[0]!.endMs! - spans[0]!.startMs).toBe(24_000)
  })

  it('takes the status from sourceStatusCode when the core event has none', () => {
    const spans = stepTimeline([
      { eventType: STEP_EVENT_TYPE, occurredAtUtc: iso(0), payload: { jobStepId: 'S9', sourceStatusCode: 'EXECUTING', payload: { stepKey: 'X' } } },
      { eventType: STEP_EVENT_TYPE, occurredAtUtc: iso(5000), payload: { jobStepId: 'S9', sourceStatusCode: 'COMPLETED', payload: { stepKey: 'X' } } },
    ])
    expect(spans[0]).toMatchObject({ name: 'X', status: 'COMPLETED' })
    expect(spans[0]!.endMs! - spans[0]!.startMs).toBe(5000)
  })
})

describe('video holes', () => {
  const span = (a: number, b: number) => ({ utcStart: iso(a), utcEnd: iso(b) })

  it('finds the start, the holes between pieces of video and the end of a run (trip R211126002)', () => {
    // Real shape: camera 0.4 s late, a 4 s hole between two recordings, a 1 s hole the server explains, video to the end.
    const holes = videoHoles(
      [span(400, 40_000), span(44_000, 54_600), span(57_200, 87_200), span(88_300, 118_000)],
      [{ fromUtc: iso(87_200), toUtc: iso(88_300), reason: 'FRAME_GAP' }],
      T0,
      T0 + 118_000,
    )
    expect(holes.map((h) => [h.fromMs - T0, h.toMs - T0, h.reason, h.nextVideoMs == null ? null : h.nextVideoMs - T0])).toEqual([
      [0, 400, 'NOT_YET_RECORDED', 400],
      [40_000, 44_000, 'RECORDING_STOPPED', 44_000],
      [54_600, 57_200, 'RECORDING_STOPPED', 57_200],
      [87_200, 88_300, 'FRAME_GAP', 88_300],
    ])
  })

  it('says a run without any video has no recording, and ignores slivers', () => {
    expect(videoHoles([], [], T0, T0 + 60_000)).toEqual([{ fromMs: T0, toMs: T0 + 60_000, reason: 'NO_RECORDING', nextVideoMs: null }])
    expect(videoHoles([span(100, 10_000), span(10_150, 20_000)], [], T0, T0 + 20_000)).toEqual([])
  })

  it('finds the hole under the cursor', () => {
    const holes = videoHoles([span(0, 10_000), span(14_000, 20_000)], [], T0, T0 + 20_000)
    expect(holeAt(holes, T0 + 12_000)?.reason).toBe('RECORDING_STOPPED')
    expect(holeAt(holes, T0 + 15_000)).toBeNull()
  })
})

describe('activity', () => {
  const places = [
    { code: 'EP-PARKING-A', name: 'Parking A', x: -0.61, y: -0.71 },
    { code: 'EP-SHELF-B-2', name: 'Shelf B 2', x: 1.24, y: 1.07 },
  ]
  const step = (id: string, type: string, extra: Partial<StepSpan>): StepSpan => ({
    stepId: id, jobId: 'J', key: id, name: id, type, taskName: null, position: null, count: null, targetCode: null, targetName: null,
    purpose: null, operationCode: null, startMs: 0, endMs: null, status: 'EXECUTING', ...extra,
  })
  const steps = [
    step('S1', 'MOVE', { purpose: 'PICKUP', targetCode: 'EP-SHELF-B-2', targetName: 'Shelf B 2' }),
    step('S2', 'HUMAN_INTERACTION', { operationCode: 'PICKUP_CONFIRM' }),
    step('S3', 'MOVE', { purpose: 'DROPOFF', targetCode: 'EP-SHELF-C-1', targetName: 'Shelf C 1' }),
    step('S4', 'HUMAN_INTERACTION', { key: 'CONFIRM_DROPOFF', name: 'Confirm Dropoff' }),
  ]

  it('names the first leg from where the robot stood', () => {
    expect(activityAt(steps, steps[0]!, { x: -0.58, y: -0.74 }, places)).toEqual({
      kind: 'TO_PICKUP', from: 'Parking A (EP-PARKING-A)', to: 'Shelf B 2 (EP-SHELF-B-2)',
    })
  })

  it('names a later leg from the previous stop, and a staff step where the robot stands', () => {
    expect(activityAt(steps, steps[2]!, null, places)).toMatchObject({ kind: 'TO_DROPOFF', from: 'Shelf B 2 (EP-SHELF-B-2)', to: 'Shelf C 1 (EP-SHELF-C-1)' })
    expect(activityAt(steps, steps[1]!, null, places)).toMatchObject({ kind: 'AT_PICKUP', to: 'Shelf B 2 (EP-SHELF-B-2)' })
    expect(activityAt(steps, steps[3]!, null, places)).toMatchObject({ kind: 'AT_DROPOFF', to: 'Shelf C 1 (EP-SHELF-C-1)' })
  })
})

describe('ticker position', () => {
  it('slides steadily between events', () => {
    const times = [T0, T0 + 10_000, T0 + 12_000]
    expect(tickerPosition(times, T0 - 5)).toBe(0)
    expect(tickerPosition(times, T0 + 5_000)).toBeCloseTo(0.5)
    expect(tickerPosition(times, T0 + 11_000)).toBeCloseTo(1.5)
    expect(tickerPosition(times, T0 + 99_000)).toBe(2)
  })
})
