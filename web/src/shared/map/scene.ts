import type { Endpoint, EndpointType, Point } from '@/shared/api/contracts'
import type { MapBounds } from '@/shared/lib/mapView'

// Demo Endpoints for the mock sign-in mode only (VITE_MOCK_AUTO_LOGIN). Real screens draw the MapVersion's own
// Zones, Edges and Endpoints; WarehouseMap never falls back to this data. Metres on the MapVersion frame
// (origin bottom-left, y up), rules/05.

export const MAP_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: 50, maxY: 50 }

/** The editor stamps the real MapVersion id when it loads this scene. */
const NO_VERSION = ''

const counters: Partial<Record<EndpointType, number>> = {}

function endpoint(name: string, endpointType: EndpointType, x: number, y: number, yaw: number): Endpoint {
  const n = (counters[endpointType] = (counters[endpointType] ?? 0) + 1)
  return {
    id: `ep-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    mapVersionId: NO_VERSION,
    code: `EP-${endpointType}-${String(n).padStart(2, '0')}`,
    name,
    endpointType,
    x,
    y,
    yaw,
    positionTolerance: 0.1,
    yawTolerance: 5,
    isEnabled: true,
  }
}

export const SCENE_ENDPOINTS: Endpoint[] = [
  endpoint('Inbound 1', 'WAYPOINT', 5, 42, 0),
  endpoint('Inbound 2', 'WAYPOINT', 5, 37, 0),
  endpoint('Inbound 3', 'WAYPOINT', 5, 33, 0),
  endpoint('Buffer North', 'WAYPOINT', 14, 44, 0),
  endpoint('Pick Face 2', 'WAYPOINT', 14, 36, 0),
  endpoint('Pick Face 3', 'WAYPOINT', 14, 32, 0),
  endpoint('Rack A-01', 'WAYPOINT', 19, 45, -90),
  endpoint('Rack A-02', 'WAYPOINT', 21, 45, -90),
  endpoint('Rack A-05', 'WAYPOINT', 23, 45, -90),
  endpoint('Rack A-09', 'WAYPOINT', 25, 45, -90),
  endpoint('Rack A-12', 'WAYPOINT', 27, 45, -90),
  endpoint('Rack A-12-03', 'WAYPOINT', 29, 45, -90),
  endpoint('Rack B-03', 'WAYPOINT', 20, 39, 90),
  endpoint('Rack B-04', 'WAYPOINT', 22, 39, 90),
  endpoint('Rack B-08', 'WAYPOINT', 24, 39, 90),
  endpoint('Rack C-01', 'WAYPOINT', 26, 39, 90),
  endpoint('Rack C-02', 'WAYPOINT', 28, 39, 90),
  endpoint('Rack C-07', 'WAYPOINT', 30, 39, 90),
  endpoint('Rack D-02', 'WAYPOINT', 32, 39, 90),
  endpoint('Quality-01', 'WAYPOINT', 14, 28, 180),
  endpoint('Recovery 1', 'WAYPOINT', 16, 24, 0),
  endpoint('Charger-A', 'CHARGER', 14, 12, 90),
  endpoint('Charger-B', 'CHARGER', 16, 12, 90),
  endpoint('Maintenance 1', 'WAYPOINT', 14, 8, 0),
  endpoint('Parking 1', 'PARK', 37, 11.5, 90),
  endpoint('Parking 2', 'PARK', 37, 8, 90),
  endpoint('Outbound 1', 'WAYPOINT', 44, 38, 180),
  endpoint('Dock 3', 'WAYPOINT', 44, 16, 180),
  endpoint('Dock 2', 'WAYPOINT', 44, 10, 180),
  endpoint('Dock 1', 'WAYPOINT', 44, 4, 180),
]

/** Finds an Endpoint by the label requests and jobs show ("Rack A-12", "Dock 3"...). */
export function findEndpointByName(name: string | undefined | null, endpoints: Endpoint[]) {
  if (!name) return undefined
  const wanted = name.trim().toLowerCase()
  return endpoints.find((item) => item.name.toLowerCase() === wanted)
}

/* ------------------------------------------------------------------ geometry helpers */

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

export function distanceToPolyline(point: Point, line: Point[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
  }
  return best
}

export function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
