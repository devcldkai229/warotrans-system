// Converts map coordinates (metres, origin bottom-left, y up) to CSS percentages inside a map canvas.

export interface MapBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Bounds of the map in metres. The real values come from the MapVersion image size × resolution + origin
 * (TODO(backend): MapVersion does not expose the image size yet).
 */
export const DEFAULT_MAP_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: 50, maxY: 50 }

export function poseToPercent(x: number, y: number, bounds: MapBounds = DEFAULT_MAP_BOUNDS) {
  const left = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100
  const top = (1 - (y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100
  return { left: `${left}%`, top: `${top}%` }
}
