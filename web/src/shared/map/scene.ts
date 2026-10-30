import type { Edge, Endpoint, EndpointType, Point, Zone, ZoneType } from '@/shared/api/contracts'
import type { MapBounds } from '@/shared/lib/mapView'

// The one warehouse map every screen draws (Fleet, Transport Requests, Job Detail, Map Editor, Facility cards).
// Everything is in metres on the MapVersion frame (origin bottom-left, y up) and follows rules/05:
//   Endpoint = where a Robot arrives, Edge = where it may travel, Zone = an area with traffic rules.
// TODO(backend): replaced by the published MapVersion's Zones, Edges and Endpoints.

export const MAP_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: 50, maxY: 50 }

/** The editor stamps the real MapVersion id when it loads this scene. */
const NO_VERSION = ''

const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
]

function zone(
  n: number,
  name: string,
  zoneType: ZoneType,
  area: [number, number, number, number],
  maxSpeed: number | null = null,
): Zone {
  const ring = rect(...area).map((p) => [p.x, p.y] as [number, number])
  const first = ring[0]
  ring.push([first[0], first[1]])
  return {
    id: `zone-${n}`,
    mapVersionId: NO_VERSION,
    code: `ZN-${String(n).padStart(2, '0')}`,
    name,
    zoneType,
    geometry: { type: 'Polygon', coordinates: [ring] },
    maxSpeed,
    isActive: true,
  }
}

function edge(
  n: number,
  name: string,
  direction: Edge['direction'],
  points: [number, number][],
  maxSpeed: number | null = null,
): Edge {
  return {
    id: `edge-${n}`,
    mapVersionId: NO_VERSION,
    code: `EG-${String(n).padStart(2, '0')}`,
    name,
    geometry: { type: 'LineString', coordinates: points.map(([x, y]) => [x, y] as [number, number]) },
    widthMeters: 1,
    direction,
    maxSpeed,
    isActive: true,
  }
}

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

export const SCENE_ZONES: Zone[] = [
  zone(1, 'Receiving & packing', 'SPEED', [2, 30, 16, 48], 1.2),
  zone(2, 'Storage aisles', 'SPEED', [18, 36, 34, 48], 0.8),
  zone(3, 'Zone C — Junction', 'NO_STOP', [21, 21, 31, 31]),
  zone(4, 'Zone F — Narrow aisle', 'SINGLE_OCCUPANCY', [21, 7, 31, 15], 0.5),
  zone(5, 'Dispatch docks', 'SPEED', [40, 2, 48, 20], 1.0),
  zone(6, 'Exclusion zone', 'KEEP_OUT', [2, 14, 8, 24]),
]

export const SCENE_EDGES: Edge[] = [
  edge(1, 'North aisle', 'BIDIRECTIONAL', [[10, 42], [24, 42], [37, 42]]),
  edge(2, 'East spine', 'BIDIRECTIONAL', [[37, 42], [37, 26], [37, 11.5]]),
  edge(3, 'West spine', 'BIDIRECTIONAL', [[10, 42], [10, 26], [10, 12]]),
  edge(4, 'Centre cross', 'BIDIRECTIONAL', [[10, 26], [26, 26], [37, 26]]),
  edge(5, 'South one-way', 'ONE_WAY', [[37, 11.5], [26, 11], [10, 12]], 0.5),
  edge(6, 'Dock spur', 'BIDIRECTIONAL', [[37, 16], [44, 16], [44, 4]]),
  edge(7, 'Inbound link', 'BIDIRECTIONAL', [[5, 32], [5, 42], [10, 42]]),
]

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
export function findEndpointByName(name: string | undefined | null, endpoints: Endpoint[] = SCENE_ENDPOINTS) {
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
