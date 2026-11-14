import { describe, expect, it } from 'vitest'
import type { RobotPosePoint } from '@/shared/api/fleet'
import { pathOnMap, rangeEnds, trailSegments } from './pathModel'

const point = (x: number, mapVersionCode: string | null): RobotPosePoint => ({
  at: '2026-11-13T08:00:00Z',
  x,
  y: 0,
  yaw: 0,
  linearVelocity: 0.2,
  angularVelocity: 0,
  mapVersionCode,
  jobId: null,
  commandId: null,
})

describe('pathOnMap', () => {
  it('keeps the points of the shown map and those without a map code', () => {
    const shown = pathOnMap([point(0, 'MAP-V6'), point(1, null), point(2, 'MAP-V5'), point(3, 'MAP-V6')], 'MAP-V6')
    expect(shown.points.map((p) => p.x)).toEqual([0, 1, 3])
    expect(shown.elsewhere).toBe(1)
  })

  it('keeps everything while the map is not known yet', () => {
    expect(pathOnMap([point(0, 'MAP-V5')], null)).toEqual({ points: [point(0, 'MAP-V5')], elsewhere: 0 })
  })
})

describe('trailSegments', () => {
  const at = (x: number, seconds: number): RobotPosePoint => ({ ...point(x, null), at: new Date(Date.UTC(2026, 10, 13, 8, 0, seconds)).toISOString() })

  it('keeps a continuous drive in one piece', () => {
    expect(trailSegments([at(0, 0), at(0.3, 2), at(0.6, 4)])).toEqual([[{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.6, y: 0 }]])
  })

  it('cuts where the robot jumped far after a long silence', () => {
    expect(trailSegments([at(0, 0), at(0.3, 2), at(3, 60), at(3.3, 62)]).map((s) => s.map((p) => p.x))).toEqual([[0, 0.3], [3, 3.3]])
  })

  it('does not cut a long stop where the robot starts again from the same place', () => {
    expect(trailSegments([at(0, 0), at(0.3, 2), at(0.4, 300), at(0.7, 302)])).toHaveLength(1)
  })

  it('does not cut a quick move, however far', () => {
    expect(trailSegments([at(0, 0), at(2, 10)])).toHaveLength(1)
  })
})

describe('rangeEnds', () => {
  it('writes only the time of the end when both ends are on the same day', () => {
    const { from, to } = rangeEnds('2026-11-14T03:19:05Z', '2026-11-14T03:19:58Z')
    expect(from).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:19:05$/)
    expect(to).toMatch(/^\d{2}:19:58$/)
  })

  it('writes both dates when the path spans days', () => {
    const { to } = rangeEnds('2026-11-13T09:00:00Z', '2026-11-14T09:00:00Z')
    expect(to).toMatch(/^\d{2}\/\d{2}\/2026 /)
  })
})
