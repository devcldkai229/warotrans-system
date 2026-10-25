import { describe, expect, it } from 'vitest'
import { chevronsAlong, laneGlyphs, offsetPolyline } from './laneGlyphs'

describe('laneGlyphs', () => {
  const eastward = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]

  it('one-way lane: one row of chevrons on the centre line, pointing the drawing direction', () => {
    const glyphs = laneGlyphs(eastward, 2, 'ONE_WAY')
    expect(glyphs.divider).toBeNull()
    expect(glyphs.chevrons.length).toBeGreaterThan(1)
    for (const c of glyphs.chevrons) {
      expect(c.y).toBeCloseTo(0)
      expect(c.angle).toBeCloseTo(0)
    }
  })

  it('two-way lane: forward chevrons in the right half, backward ones in the left half, and a divider', () => {
    const glyphs = laneGlyphs(eastward, 2, 'BIDIRECTIONAL')
    expect(glyphs.divider).toEqual(eastward)
    const forward = glyphs.chevrons.filter((c) => Math.abs(c.angle) < 1)
    const back = glyphs.chevrons.filter((c) => Math.abs(c.angle - 180) < 1)
    expect(forward.length).toBeGreaterThan(0)
    expect(back.length).toBe(forward.length)
    // y grows downwards: right of an eastward lane is +y
    forward.forEach((c) => expect(c.y).toBeCloseTo(0.5))
    back.forEach((c) => expect(c.y).toBeCloseTo(-0.5))
  })

  it('band sides are half the width away, mitred at a corner', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    const right = offsetPolyline(corner, 1)
    expect(right[0]).toEqual({ x: 0, y: 1 })
    expect(right[1].x).toBeCloseTo(9)
    expect(right[1].y).toBeCloseTo(1)
    expect(right[2]).toEqual({ x: 9, y: 10 })
  })

  it('a lane shorter than the spacing still gets one chevron in the middle', () => {
    const short = chevronsAlong(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      5,
    )
    expect(short).toHaveLength(1)
    expect(short[0].x).toBeCloseTo(0.5)
  })
})
