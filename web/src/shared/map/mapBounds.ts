import type { MapBounds } from '@/shared/lib/mapView'
import { pixelToWorld, type MapTransformParams } from './mapCoordinateTransform'

/** Axis-aligned world bounds covering the occupancy image (handles non-zero originYaw). */
export function boundsFromMapMeta(params: MapTransformParams & { imageWidthPixels: number }): MapBounds {
  const { imageWidthPixels, imageHeightPixels } = params
  // Continuous corners: (0,0) top-left → (W,H) bottom-right. Do not use W-1/H-1.
  const corners = [
    pixelToWorld(params, { u: 0, v: 0 }),
    pixelToWorld(params, { u: imageWidthPixels, v: 0 }),
    pixelToWorld(params, { u: 0, v: imageHeightPixels }),
    pixelToWorld(params, { u: imageWidthPixels, v: imageHeightPixels }),
  ]
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  }
}
