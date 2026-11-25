// Lane drawing shared by the monitor map and the Map Editor (OTTO style): a translucent band as wide as the lane
// with a dense row of small arrows along it. A one-way lane has one row of chevrons down the middle; a two-way lane is split by a
// dashed centre line into two half lanes whose chevrons point opposite ways (travel on the right of the drawing
// direction, like a road). Everything works in drawing coordinates (y down), whatever the unit.

export interface DrawPoint {
  x: number
  y: number
}

export interface Chevron {
  x: number
  y: number
  /** Degrees, SVG rotation (y down): 0 points right. */
  angle: number
}

/** The polyline shifted sideways by `offset` (positive = right of the drawing direction on screen), mitred joints. */
export function offsetPolyline(points: DrawPoint[], offset: number): DrawPoint[] {
  if (points.length < 2 || offset === 0) return points
  const normals = points.slice(1).map((b, i) => {
    const a = points[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // right of travel with y down: (-dy, dx)
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  })
  return points.map((p, i) => {
    const before = normals[i - 1]
    const after = normals[i]
    if (!before || !after) {
      const n = before ?? after
      return { x: p.x + n.x * offset, y: p.y + n.y * offset }
    }
    // mitre: the bisector, lengthened so both sides stay `offset` away (capped at 4x for very sharp turns)
    const mx = before.x + after.x
    const my = before.y + after.y
    const dot = mx * before.x + my * before.y
    if (Math.abs(dot) < 1e-6) return { x: p.x + after.x * offset, y: p.y + after.y * offset }
    const scale = Math.min(4, 1 / dot) * offset
    return { x: p.x + mx * scale, y: p.y + my * scale }
  })
}

/** Length of a polyline (drawing units). */
export function polylineLength(points: DrawPoint[]): number {
  return points.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0)
}

/**
 * Chevrons `spacing` apart along the polyline, `offset` to the right of the drawing direction; `reverse` points them
 * back. They are spread evenly between the two ends and each keeps `size / 2` of room before an end, so an arrow of
 * length `size` never sticks out of its lane; a lane too short for two gets one, in the middle.
 */
export function chevronsAlong(points: DrawPoint[], spacing: number, offset = 0, reverse = false, size = 0): Chevron[] {
  const line = offsetPolyline(points, offset)
  const lengths = line.slice(1).map((b, i) => Math.hypot(b.x - line[i].x, b.y - line[i].y))
  const total = lengths.reduce((s, l) => s + l, 0)
  if (total <= 0 || spacing <= 0) return []
  const room = Math.max(0, total - size)
  const count = Math.floor(room / spacing) + 1
  const first = (total - (count - 1) * spacing) / 2
  const stations = Array.from({ length: count }, (_, i) => first + i * spacing)

  const out: Chevron[] = []
  let segment = 0
  let start = 0
  for (const s of stations) {
    while (segment < lengths.length - 1 && s > start + lengths[segment]) {
      start += lengths[segment]
      segment++
    }
    const a = line[segment]
    const b = line[segment + 1]
    const t = lengths[segment] > 0 ? (s - start) / lengths[segment] : 0
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + (reverse ? 180 : 0)
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), angle })
  }
  return out
}

/**
 * Slim arrow in a unit box (length 1, pointing right, centred), filled: a thin shaft and a short head, like a "→"
 * glyph. Drawn with `scale(size)`; `size` is the arrow length. Many small arrows read the direction better than a
 * few big ones and do not hide the robots and plans drawn on top.
 */
export const LANE_ARROW_PATH = 'M-0.5 -0.06 L0.16 -0.06 L0.16 -0.24 L0.5 0 L0.16 0.24 L0.16 0.06 L-0.5 0.06 Z'
/** @deprecated the open chevron; lanes draw LANE_ARROW_PATH now. */
export const CHEVRON_PATH = LANE_ARROW_PATH

export interface LaneGlyphs {
  /** Rows of chevrons: one for a one-way lane, two (opposite) for a two-way lane. */
  chevrons: Chevron[]
  /** Length of one arrow (drawing units), for `scale(size)` on LANE_ARROW_PATH. */
  chevronSize: number
  /** Dashed centre divider of a two-way lane. */
  divider: DrawPoint[] | null
  /** The two long sides of the band. */
  sides: [DrawPoint[], DrawPoint[]]
}

/** Arrow length and spacing as fractions of the lane width: small arrows, close together. */
export const ONE_WAY_SIZE = 0.42
export const ONE_WAY_SPACING = 0.85
export const TWO_WAY_SIZE = 0.32
export const TWO_WAY_SPACING = 0.7

/** An arrow is never longer than this share of its lane, so a short lane still shows it whole. */
export const MAX_ARROW_SHARE_OF_LENGTH = 0.6

export function laneGlyphs(points: DrawPoint[], width: number, direction: 'ONE_WAY' | 'BIDIRECTIONAL'): LaneGlyphs {
  const half = width / 2
  const sides: [DrawPoint[], DrawPoint[]] = [offsetPolyline(points, -half), offsetPolyline(points, half)]
  const length = polylineLength(points)
  if (direction === 'ONE_WAY') {
    const size = Math.min(width * ONE_WAY_SIZE, length * MAX_ARROW_SHARE_OF_LENGTH)
    return { chevrons: chevronsAlong(points, width * ONE_WAY_SPACING, 0, false, size), chevronSize: size, divider: null, sides }
  }
  // Two-way: a row per half lane; the head (0.48 of the size wide) fits inside the half.
  const spacing = width * TWO_WAY_SPACING
  const size = Math.min(width * TWO_WAY_SIZE, length * MAX_ARROW_SHARE_OF_LENGTH)
  return {
    chevrons: [
      ...chevronsAlong(points, spacing, width / 4, false, size), // right half: drawing direction
      ...chevronsAlong(points, spacing, -width / 4, true, size), // left half: back
    ],
    chevronSize: size,
    divider: points,
    sides,
  }
}
