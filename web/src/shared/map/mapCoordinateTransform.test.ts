import { describe, expect, it } from 'vitest'
import { pixelToWorld, worldToPixel, type MapTransformParams } from './mapCoordinateTransform'

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

describe('mapCoordinateTransform', () => {
  it('round-trips with zero yaw', () => {
    const pixels = [
      { u: 0, v: 0 },
      { u: 100, v: 50 },
      { u: 399, v: 399 },
    ]
    for (const pixel of pixels) {
      const world = pixelToWorld(ZERO_YAW, pixel)
      const back = worldToPixel(ZERO_YAW, world)
      expect(back.u).toBeCloseTo(pixel.u, 9)
      expect(back.v).toBeCloseTo(pixel.v, 9)
    }
  })

  it('round-trips with non-zero yaw', () => {
    const pixels = [
      { u: 0, v: 0 },
      { u: 40, v: 80 },
      { u: 199, v: 199 },
    ]
    for (const pixel of pixels) {
      const world = pixelToWorld(ROTATED, pixel)
      const back = worldToPixel(ROTATED, world)
      expect(back.u).toBeCloseTo(pixel.u, 9)
      expect(back.v).toBeCloseTo(pixel.v, 9)
    }
  })

  it('maps lower-left pixel to origin when yaw is zero', () => {
    const world = pixelToWorld(ZERO_YAW, { u: 0, v: ZERO_YAW.imageHeightPixels - 1 })
    expect(world.x).toBeCloseTo(ZERO_YAW.originX, 9)
    expect(world.y).toBeCloseTo(ZERO_YAW.originY, 9)
  })
})
