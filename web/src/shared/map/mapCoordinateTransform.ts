/**
 * ROS/Nav2 occupancy-grid transform between image pixels and world meters.
 *
 * Convention (matches Nav2 map_server / MapVersion fields):
 * - origin = world pose of the lower-left corner of the image (pixel 0, imageHeight-1)
 * - resolution = meters per pixel
 * - originYaw = rotation of the map frame relative to world (radians, CCW)
 * - pixel Y grows downward in the image; world Y grows with originYaw basis
 */

export interface MapTransformParams {
  resolution: number
  originX: number
  originY: number
  originYaw: number
  imageHeightPixels: number
}

export interface PixelCoord {
  u: number
  v: number
}

export interface WorldCoord {
  x: number
  y: number
}

export function pixelToWorld(params: MapTransformParams, pixel: PixelCoord): WorldCoord {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const mx = pixel.u * resolution
  const my = (imageHeightPixels - 1 - pixel.v) * resolution
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  return {
    x: originX + cos * mx - sin * my,
    y: originY + sin * mx + cos * my,
  }
}

export function worldToPixel(params: MapTransformParams, world: WorldCoord): PixelCoord {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const dx = world.x - originX
  const dy = world.y - originY
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  const mx = cos * dx + sin * dy
  const my = -sin * dx + cos * dy
  return {
    u: mx / resolution,
    v: imageHeightPixels - 1 - my / resolution,
  }
}
