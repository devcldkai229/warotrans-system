/**
 * Costmap overlays for the map: the static masks of the semantic bundle (keep-out, speed) the robots plan with, and
 * the traffic cells each robot holds or was granted. Pure helpers; the image is drawn once per mask.
 */
import type { SemanticMaskLayer } from '../api/fleet'

/** An image in map metres: bottom-left corner at (originX, originY). */
export interface MapCostmapImage {
  id: string
  url: string
  originX: number
  originY: number
  widthM: number
  heightM: number
  opacity?: number
}

/** Square traffic cells (metres) of one robot. */
export interface MapCellSet {
  robotCode: string
  color: string
  kind: 'held' | 'granted'
  size: number
  cells: { x: number; y: number }[]
}

export type MaskStyle = 'keepout' | 'speed'

/** RGBA for one mask pixel; transparent where the mask says "nothing here". */
export function maskPixel(style: MaskStyle, value: number, mode: string): [number, number, number, number] {
  if (style === 'keepout') {
    // map_server trinary: dark = occupied (keep-out). Occupied when (255 - v) / 255 > 0.65.
    const occupied = (255 - value) / 255 > 0.65
    return occupied ? [229, 57, 53, 150] : [0, 0, 0, 0]
  }
  // Speed filter (raw mode): value = speed limit in %, 0 = no limit; trinary masks: dark = limited.
  const limit = mode === 'raw' ? value : 255 - value
  if (limit <= 0 || limit >= 100) return [0, 0, 0, 0]
  return [247, 185, 40, Math.round(60 + (1 - limit / 100) * 120)]
}

/** Decodes a base64 PGM-ordered mask (first row = top) into a PNG data URL. */
export function maskToDataUrl(layer: SemanticMaskLayer, style: MaskStyle): string | null {
  if (typeof document === 'undefined') return null
  const bytes = Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0))
  const canvas = document.createElement('canvas')
  canvas.width = layer.width
  canvas.height = layer.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(layer.width, layer.height)
  let any = false
  for (let i = 0; i < layer.width * layer.height; i++) {
    const [r, g, b, a] = maskPixel(style, bytes[i] ?? 255, layer.mode)
    img.data.set([r, g, b, a], i * 4)
    if (a > 0) any = true
  }
  if (!any) return null
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** "cell:ix:iy" → the cell's lower-left corner in metres (cell (ix, iy) covers [ix·s, (ix+1)·s)). */
export function cellCorner(resourceId: string, size: number): { x: number; y: number } | null {
  const m = /^cell:(-?\d+):(-?\d+)$/.exec(resourceId)
  if (!m) return null
  return { x: Number(m[1]) * size, y: Number(m[2]) * size }
}

/** One live Nav2 costmap as the robot sends it (rows bottom-up, ROS order; 0..100 cost, 255 unknown). */
export interface LiveCostmapBody {
  robotCode: string
  kind: 'global' | 'local'
  resolution: number
  originX: number
  originY: number
  width: number
  height: number
  rowOrder?: string
  data: string
}

/** Nav2 cost → RGBA: lethal dark purple, inscribed magenta, inflation blue (stronger near obstacles), unknown faint. */
export function costPixel(cost: number): [number, number, number, number] {
  if (cost === 255) return [120, 120, 120, 40]
  if (cost >= 100) return [74, 20, 140, 210]
  if (cost >= 99) return [216, 27, 96, 170]
  if (cost <= 0) return [0, 0, 0, 0]
  return [30, 136, 229, Math.round(30 + (cost / 98) * 140)]
}

/** A live costmap → PNG data URL, flipped so the image's first row is the top of the map. */
export function liveCostmapToDataUrl(body: LiveCostmapBody): string | null {
  if (typeof document === 'undefined' || body.width <= 0 || body.height <= 0) return null
  const bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0))
  const canvas = document.createElement('canvas')
  canvas.width = body.width
  canvas.height = body.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(body.width, body.height)
  const bottomUp = (body.rowOrder ?? 'bottom-up') === 'bottom-up'
  for (let row = 0; row < body.height; row++) {
    const src = bottomUp ? body.height - 1 - row : row
    for (let col = 0; col < body.width; col++) {
      img.data.set(costPixel(bytes[src * body.width + col] ?? 0), (row * body.width + col) * 4)
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
