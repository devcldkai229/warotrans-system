import { describe, expect, it } from 'vitest'
import { extent, linearScale, nearestValue, stepPath, timeScale } from './scales'

const T0 = '2026-11-23T10:40:00Z'
const T1 = '2026-11-23T10:50:00Z'

describe('timeScale', () => {
  it('puts a marker at the right x for its timestamp', () => {
    const ts = timeScale(T0, T1, 100, 700)
    expect(ts.x(T0)).toBe(100)
    expect(ts.x(T1)).toBe(700)
    expect(ts.x('2026-11-23T10:45:00Z')).toBeCloseTo(400)
  })

  it('inverts pixels back to time (cursor sync)', () => {
    const ts = timeScale(T0, T1, 100, 700)
    expect(new Date(ts.invert(400)).toISOString()).toBe('2026-11-23T10:45:00.000Z')
  })
})

describe('value helpers', () => {
  it('pads a flat extent so a constant series is still drawable', () => {
    const [lo, hi] = extent([0, 0, 0])
    expect(lo).toBeLessThan(0)
    expect(hi).toBeGreaterThan(0)
  })

  it('maps values linearly, top is high', () => {
    const y = linearScale(0, 1, 100, 0)
    expect(y(0)).toBe(100)
    expect(y(1)).toBe(0)
  })

  it('draws robot signals as steps and finds the value under the cursor', () => {
    const pts = [{ t: T0, v: 0.3 }, { t: '2026-11-23T10:45:00Z', v: 0 }]
    const ts = timeScale(T0, T1, 0, 600)
    expect(stepPath(pts, (t) => ts.x(t), (v) => 100 - v * 100)).toBe('M0.0,70.0H300.0V100.0')
    expect(nearestValue(pts, Date.parse('2026-11-23T10:46:00Z'))).toBe(0)
  })
})
