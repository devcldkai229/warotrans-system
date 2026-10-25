// Lane drawing shared by the monitor map and the Map Editor (OTTO style): a translucent band as wide as the lane
// with large chevrons along it. A one-way lane has one row of chevrons down the middle; a two-way lane is split by a
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

/**
 * Chevrons every `spacing` along the polyline (the first half a spacing in, one in the middle when the lane is
 * shorter than a spacing), `offset` to the right of the drawing direction; `reverse` points them back.
 */
export function chevronsAlong(points: DrawPoint[], spacing: number, offset = 0, reverse = false): Chevron[] {
  const line = offsetPolyline(points, offset)
  const lengths = line.slice(1).map((b, i) => Math.hypot(b.x - line[i].x, b.y - line[i].y))
  const total = lengths.reduce((s, l) => s + l, 0)
  if (total <= 0 || spacing <= 0) return []
  const stations: number[] = []
  if (total < spacing) stations.push(total / 2)
  else for (let s = spacing / 2; s < total; s += spacing) stations.push(s)

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

/** Chevron outline in a unit box (points right), drawn with `scale(size)`: an open, wide "›". */
export const CHEVRON_PATH = 'M-0.32 -0.5 L0.18 0 L-0.32 0.5'

export interface LaneGlyphs {
  /** Rows of chevrons: one for a one-way lane, two (opposite) for a two-way lane. */
  chevrons: Chevron[]
  /** Size of one chevron (drawing units), for `scale(size)` on CHEVRON_PATH. */
  chevronSize: number
  /** Dashed centre divider of a two-way lane. */
  divider: DrawPoint[] | null
  /** The two long sides of the band. */
  sides: [DrawPoint[], DrawPoint[]]
}

export function laneGlyphs(points: DrawPoint[], width: number, direction: 'ONE_WAY' | 'BIDIRECTIONAL'): LaneGlyphs {
  const half = width / 2
  const sides: [DrawPoint[], DrawPoint[]] = [offsetPolyline(points, -half), offsetPolyline(points, half)]
  if (direction === 'ONE_WAY') {
    return { chevrons: chevronsAlong(points, width * 1.6), chevronSize: width * 0.55, divider: null, sides }
  }
  const spacing = width * 1.1
  return {
    chevrons: [
      ...chevronsAlong(points, spacing, width / 4), // right half: drawing direction
      ...chevronsAlong(points, spacing, -width / 4, true), // left half: back
    ],
    chevronSize: width * 0.3,
    divider: points,
    sides,
  }
}
