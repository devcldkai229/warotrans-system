/** Pure scale helpers shared by the charts (unit-tested). */

export interface TimeScale {
  x: (iso: string | number) => number
  invert: (px: number) => number
  ticks: number[]
}

export function timeScale(fromIso: string, toIso: string, x0: number, x1: number, tickCount = 6): TimeScale {
  const a = Date.parse(fromIso)
  const b = Math.max(Date.parse(toIso), a + 1)
  const x = (v: string | number) => x0 + ((typeof v === 'number' ? v : Date.parse(v)) - a) / (b - a) * (x1 - x0)
  const invert = (px: number) => a + (px - x0) / (x1 - x0) * (b - a)
  const step = (b - a) / tickCount
  return { x, invert, ticks: Array.from({ length: tickCount + 1 }, (_, i) => a + i * step) }
}

export function linearScale(min: number, max: number, y0: number, y1: number) {
  const lo = min === max ? min - 1 : min
  const hi = min === max ? max + 1 : max
  return (v: number) => y0 + (v - lo) / (hi - lo) * (y1 - y0)
}

export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (lo === hi) { lo -= 0.5; hi += 0.5 }
  const pad = (hi - lo) * 0.08
  return [lo - pad, hi + pad]
}

/** Step path (values hold until the next sample), as robot signals behave. */
export function stepPath(points: { t: string; v: number }[], x: (t: string) => number, y: (v: number) => number): string {
  if (points.length === 0) return ''
  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].v).toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    d += `H${x(points[i].t).toFixed(1)}V${y(points[i].v).toFixed(1)}`
  }
  return d
}

export function nearestValue(points: { t: string; v: number }[], ms: number): number | null {
  if (points.length === 0) return null
  let best = points[0]
  for (const p of points) if (Math.abs(Date.parse(p.t) - ms) < Math.abs(Date.parse(best.t) - ms)) best = p
  return best.v
}
