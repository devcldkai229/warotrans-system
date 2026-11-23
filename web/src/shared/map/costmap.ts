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
