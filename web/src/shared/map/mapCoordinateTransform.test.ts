import { describe, expect, it } from 'vitest'
import {
  cellCenterToWorld,
  pixelToWorld,
  worldToPixel,
  type MapTransformParams,
} from './mapCoordinateTransform'

const ZERO_YAW: MapTransformParams = {
  resolution: 0.05,
  originX: -10,
  originY: -20,
  originYaw: 0,
  imageHeightPixels: 400,
}

const ROTATED: MapTransformParams = {
  resolution: 0.05,
  originX: 1.5,
  originY: -3.25,
  originYaw: Math.PI / 4,
  imageHeightPixels: 200,
}

/** Bundled sample map fixture (web/public/test-maps/sample). */
const SAMPLE: MapTransformParams & { imageWidthPixels: number } = {
  resolution: 0.037721614,
  originX: -5,
  originY: -5,
  originYaw: 0,
  imageWidthPixels: 1192,
  imageHeightPixels: 918,
}

const EPS = 1e-9

describe('mapCoordinateTransform (continuous image coords)', () => {
  it('maps lower-left continuous corner (0, H) to origin when yaw is zero', () => {
    const world = pixelToWorld(ZERO_YAW, { u: 0, v: ZERO_YAW.imageHeightPixels })
    expect(world.x).toBeCloseTo(ZERO_YAW.originX, 12)
    expect(world.y).toBeCloseTo(ZERO_YAW.originY, 12)
  })

  it('maps top-left (0, 0) above the origin by image height in meters', () => {
    const world = pixelToWorld(ZERO_YAW, { u: 0, v: 0 })
    expect(world.x).toBeCloseTo(ZERO_YAW.originX, 12)
    expect(world.y).toBeCloseTo(ZERO_YAW.originY + ZERO_YAW.imageHeightPixels * ZERO_YAW.resolution, 12)
  })

  it('round-trips pixel → world → pixel with zero yaw (incl. fractional)', () => {
    const pixels = [
      { u: 0, v: 0 },
      { u: 0, v: ZERO_YAW.imageHeightPixels },
      { u: 100.25, v: 50.75 },
      { u: 200, v: 200 },
    ]
    for (const pixel of pixels) {
      const world = pixelToWorld(ZERO_YAW, pixel)
      const back = worldToPixel(ZERO_YAW, world)
      expect(Math.abs(back.u - pixel.u)).toBeLessThan(EPS)
      expect(Math.abs(back.v - pixel.v)).toBeLessThan(EPS)
    }
  })

  it('round-trips world → pixel → world with zero yaw', () => {
    const worlds = [
      { x: -10, y: -20 },
      { x: -5, y: -10 },
      { x: 3.333, y: 7.777 },
    ]
    for (const world of worlds) {
      const pixel = worldToPixel(ZERO_YAW, world)
      const back = pixelToWorld(ZERO_YAW, pixel)
      expect(Math.abs(back.x - world.x)).toBeLessThan(EPS)
      expect(Math.abs(back.y - world.y)).toBeLessThan(EPS)
    }
  })

  it('round-trips with non-zero yaw (top-left, bottom-left, center, fractional)', () => {
    const pixels = [
      { u: 0, v: 0 },
      { u: 0, v: ROTATED.imageHeightPixels },
      { u: 100, v: 100 },
      { u: 40.5, v: 80.25 },
      { u: 199, v: 199 },
    ]
    for (const pixel of pixels) {
      const world = pixelToWorld(ROTATED, pixel)
      const back = worldToPixel(ROTATED, world)
      expect(Math.abs(back.u - pixel.u)).toBeLessThan(EPS)
      expect(Math.abs(back.v - pixel.v)).toBeLessThan(EPS)
    }
  })

  it('sample fixture: (0, 918) → origin (-5, -5)', () => {
    const world = pixelToWorld(SAMPLE, { u: 0, v: SAMPLE.imageHeightPixels })
    expect(world.x).toBeCloseTo(-5, 12)
    expect(world.y).toBeCloseTo(-5, 12)
  })

  it('sample fixture round-trip at arbitrary fractional point', () => {
    const pixel = { u: 596.3, v: 459.7 }
    const world = pixelToWorld(SAMPLE, pixel)
    const back = worldToPixel(SAMPLE, world)
    expect(Math.abs(back.u - pixel.u)).toBeLessThan(EPS)
    expect(Math.abs(back.v - pixel.v)).toBeLessThan(EPS)
  })

  it('cellCenterToWorld uses +0.5 and is separate from continuous corner', () => {
    const continuous = pixelToWorld(ZERO_YAW, { u: 0, v: 0 })
    const cell = cellCenterToWorld(ZERO_YAW, 0, 0)
    expect(cell.x).toBeCloseTo(continuous.x + 0.5 * ZERO_YAW.resolution, 12)
    expect(cell.y).not.toBeCloseTo(continuous.y, 6)
  })
})
