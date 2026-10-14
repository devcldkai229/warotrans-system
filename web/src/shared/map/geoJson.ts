import type { GeoJsonLineString, GeoJsonPolygon, Point } from '@/shared/api/contracts'

export function lineStringToPoints(geometry: GeoJsonLineString): Point[] {
  return geometry.coordinates.map(([x, y]) => ({ x, y }))
}

export function pointsToLineString(points: Point[]): GeoJsonLineString {
  return {
    type: 'LineString',
    coordinates: points.map((p) => [p.x, p.y] as [number, number]),
  }
}

export function polygonToPoints(geometry: GeoJsonPolygon): Point[] {
  const ring = geometry.coordinates[0] ?? []
  // Drop closing duplicate for editor / SVG point lists.
  if (ring.length >= 2) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) {
      return ring.slice(0, -1).map(([x, y]) => ({ x, y }))
    }
  }
  return ring.map(([x, y]) => ({ x, y }))
}

export function pointsToPolygon(points: Point[]): GeoJsonPolygon {
  const ring = points.map((p) => [p.x, p.y] as [number, number])
  if (ring.length > 0) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]])
    }
  }
  return { type: 'Polygon', coordinates: [ring] }
}
