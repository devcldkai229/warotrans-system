import type { EdgeDto, MapVersionDetailDto, ZoneDto } from '../api/navigationApi';
import { worldToBase, type MapFrame, type MapPoint } from './mapTransform';

export type MapInspectTarget =
  | { kind: 'zone'; zone: ZoneDto; anchor: MapPoint }
  | { kind: 'lane'; edge: EdgeDto; anchor: MapPoint };

export function polygonArea(ring: readonly MapPoint[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonBounds(ring: readonly MapPoint[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (!ring.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = ring[0].x;
  let maxX = ring[0].x;
  let minY = ring[0].y;
  let maxY = ring[0].y;
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

export function polygonCentroid(ring: readonly MapPoint[]): MapPoint {
  if (!ring.length) return { x: 0, y: 0 };
  const last = ring[ring.length - 1];
  const open =
    ring.length > 1 && Math.abs(ring[0].x - last.x) < 1e-9 && Math.abs(ring[0].y - last.y) < 1e-9
      ? ring.slice(0, -1)
      : ring;
  if (!open.length) return { x: ring[0].x, y: ring[0].y };

  let signedArea2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const cross = a.x * b.y - b.x * a.y;
    signedArea2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(signedArea2) > 1e-6) {
    return { x: cx / (3 * signedArea2), y: cy / (3 * signedArea2) };
  }

  const sum = open.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / open.length, y: sum.y / open.length };
}

export function pointInRing(point: MapPoint, ring: readonly MapPoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const crossesY = (yi > point.y) !== (yj > point.y);
    if (!crossesY) continue;
    const xIntersect = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (point.x < xIntersect) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(point: MapPoint, rings: readonly (readonly MapPoint[])[]): boolean {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function closestPointOnSegment(p: MapPoint, a: MapPoint, b: MapPoint): MapPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function distancePointToSegment(p: MapPoint, a: MapPoint, b: MapPoint): number {
  const c = closestPointOnSegment(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

export function distancePointToPolyline(p: MapPoint, pts: readonly MapPoint[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distancePointToSegment(p, pts[i], pts[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function closestPointOnPolyline(p: MapPoint, pts: readonly MapPoint[]): MapPoint {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  let bestDist = Infinity;
  let bestPoint = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const c = closestPointOnSegment(p, pts[i], pts[i + 1]);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = c;
    }
  }
  return bestPoint;
}

/**
 * Hit-tests zones and lanes in base-frame coordinates.
 * Picks the smallest-area containing zone (for nested zones) or nearest visible lane.
 */
export function hitTestInfrastructure(
  basePoint: MapPoint,
  map: MapVersionDetailDto,
  frame: MapFrame,
  zoom: number,
  opts: { zones: boolean; lanes: boolean },
): MapInspectTarget | null {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const pxPerMetre = frame.scale / (map.resolution || 0.05);

  if (opts.zones) {
    let bestZone: { zone: ZoneDto; outer: MapPoint[]; area: number } | null = null;
    for (const zone of map.zones || []) {
      if (zone.mapVersionId !== map.id || !zone.isActive || zone.geometry?.type !== 'Polygon') {
        continue;
      }
      const rings = zone.geometry.coordinates.map(ring =>
        ring.map(pt => worldToBase({ x: pt[0], y: pt[1] }, map, frame)),
      );
      if (!rings.length || rings.some(r => r.length < 3 || r.some(p => !p))) {
        continue;
      }
      const validRings = rings as MapPoint[][];
      if (!pointInPolygon(basePoint, validRings)) continue;

      const area = polygonArea(validRings[0]);
      if (!bestZone || area < bestZone.area) {
        bestZone = { zone, outer: validRings[0], area };
      }
    }
    if (bestZone) {
      return { kind: 'zone', zone: bestZone.zone, anchor: polygonCentroid(bestZone.outer) };
    }
  }

  if (opts.lanes) {
    let bestLane: { edge: EdgeDto; pts: MapPoint[]; dist: number } | null = null;
    for (const edge of map.edges || []) {
      if (edge.mapVersionId !== map.id || !edge.isActive || edge.geometry?.type !== 'LineString') {
        continue;
      }
      const projected = edge.geometry.coordinates.map(pt => worldToBase({ x: pt[0], y: pt[1] }, map, frame));
      if (projected.length < 2 || projected.some(p => !p)) continue;

      const pts = projected as MapPoint[];
      const width = Math.max((edge.widthMeters || 1) * pxPerMetre, 6 / safeZoom);
      const threshold = Math.max(width / 2 + 6 / safeZoom, 16 / safeZoom);
      const dist = distancePointToPolyline(basePoint, pts);
      if (dist <= threshold && (!bestLane || dist < bestLane.dist)) {
        bestLane = { edge, pts, dist };
      }
    }
    if (bestLane) {
      return { kind: 'lane', edge: bestLane.edge, anchor: closestPointOnPolyline(basePoint, bestLane.pts) };
    }
  }

  return null;
}
