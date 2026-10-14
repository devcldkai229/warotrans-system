/**
 * ROS/Nav2 occupancy-grid transform between image pixels and world meters.
 *
 * ## Continuous image coordinates (Map Editor / canvas)
 *
 * `(u, v)` are continuous image pixels measured from the **top-left edge** of the
 * occupancy image / preview PNG:
 * - `(0, 0)` = top-left corner
 * - `(W, H)` = bottom-right corner
 * - `(0, H)` = ROS map origin (lower-left corner of the lower-left cell)
 * - `v` increases downward (image / SVG Y)
 *
 * There is **no** +0.5 cell-center shift. Admin clicks are poses, not raster cells.
 *
 * ```text
 * localX = u * resolution
 * localY = (imageHeight - v) * resolution   // continuous: use H - v, NOT H - 1 - v
 * worldX = originX + cos(yaw)*localX - sin(yaw)*localY
 * worldY = originY + sin(yaw)*localX + cos(yaw)*localY
 * ```
 *
 * Inverse: rotate (world − origin) by −yaw, then `u = lx/res`, `v = H − ly/res`.
 *
 * ## Discrete raster cells
 *
 * For occupancy-grid cell inspection only, use {@link cellCenterToWorld}.
 * Do not mix that helper with Map Editor clicks.
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

/** Continuous image pixel → world meters. */
export function pixelToWorld(params: MapTransformParams, pixel: PixelCoord): WorldCoord {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const localX = pixel.u * resolution
  const localY = (imageHeightPixels - pixel.v) * resolution
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  return {
    x: originX + cos * localX - sin * localY,
    y: originY + sin * localX + cos * localY,
  }
}

/** World meters → continuous image pixel. Exact inverse of {@link pixelToWorld}. */
export function worldToPixel(params: MapTransformParams, world: WorldCoord): PixelCoord {
  const { resolution, originX, originY, originYaw, imageHeightPixels } = params
  const dx = world.x - originX
  const dy = world.y - originY
  const cos = Math.cos(originYaw)
  const sin = Math.sin(originYaw)
  const localX = cos * dx + sin * dy
  const localY = -sin * dx + cos * dy
  return {
    u: localX / resolution,
    v: imageHeightPixels - localY / resolution,
  }
}

/**
 * Discrete OccupancyGrid cell center → world meters.
 *
 * `col` / `row` are integer cell indices (0-based). Row 0 is the top row of the image.
 * Uses `row + 0.5` / `col + 0.5` — NOT for Map Editor continuous clicks.
 */
export function cellCenterToWorld(
  params: MapTransformParams,
  col: number,
  row: number,
): WorldCoord {
  return pixelToWorld(params, { u: col + 0.5, v: row + 0.5 })
}
