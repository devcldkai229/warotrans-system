import type { EndpointDto, MapVersionDetailDto, ZoneDto } from '../api/navigationApi';
import { polygonBounds, polygonCentroid } from './mapHitTest';
import { endpointKind, endpointVisualKind } from './mapStyle';
import { worldToBase, type MapFrame, type MapPoint } from './mapTransform';

export interface MapJobContext {
  jobId?: string | null;
  status?: string | null;
  robotId?: string | null;
  pickupCode?: string | null;
  dropoffCode?: string | null;
  robotCode?: string | null;
}

export type EndpointJobRole = 'pickup' | 'dropoff';
export type LabelPlacement = 'below' | 'above';

export interface LabeledEndpoint {
  x: number;
  y: number;
  endpoint: EndpointDto;
  displayText: string;
  role: EndpointJobRole | null;
  priority: number;
  placement: LabelPlacement;
}

export interface ZoneFloorLabel {
  id: string;
  zone: ZoneDto;
  x: number;
  y: number;
  name: string;
  badge: string;
}

const LANDMARK_RE = /inbound|outbound|dock|staging|gate|charger/i;
const IGNORED_JOB_CODES = new Set(['unknown pickup', 'unknown dropoff', 'unassigned']);

function matchesJobEndpoint(endpoint: EndpointDto, target?: string | null): boolean {
  const normalized = target?.trim().toLowerCase();
  if (!normalized || IGNORED_JOB_CODES.has(normalized)) return false;
  return (
    endpoint.code.trim().toLowerCase() === normalized
    || endpoint.name.trim().toLowerCase() === normalized
  );
}

export function endpointJobRole(
  endpoint: EndpointDto,
  jobContext?: MapJobContext,
): EndpointJobRole | null {
  if (!jobContext) return null;
  if (matchesJobEndpoint(endpoint, jobContext.dropoffCode)) return 'dropoff';
  if (matchesJobEndpoint(endpoint, jobContext.pickupCode)) return 'pickup';
  return null;
}

export function isLandmarkEndpoint(endpoint: EndpointDto): boolean {
  const kind = endpointKind(endpoint.endpointType);
  if (kind === 'CHARGER' || kind === 'PARK') return true;
  return LANDMARK_RE.test(endpoint.code) || LANDMARK_RE.test(endpoint.name);
}

export function endpointPriority(
  endpoint: EndpointDto,
  selectedId: string | null,
  jobContext?: MapJobContext,
): number {
  if (selectedId && endpoint.id === selectedId) return 0;
  if (endpointJobRole(endpoint, jobContext) !== null) return 1;
  if (isLandmarkEndpoint(endpoint)) return 2;
  return 3;
}

function compactEndpointLabel(endpoint: EndpointDto, detailed: boolean): string {
  const name = endpoint.name?.trim() || '';
  const code = endpoint.code?.trim() || '';
  if (detailed) return name || code;
  if (name && name.length <= 16) return name;
  return code || name;
}

/**
 * Smart Auto-LOD endpoint label selector with robot/station obstacle avoidance:
 * - Always keeps selected endpoint (priority 0) and active Job endpoints (priority 1),
 *   flipping above/below to minimize collisions.
 * - Shows non-overlapping landmark labels at zoom 1×, suppressing crowded lower-priority labels
 *   until zoomed in (`detailed`).
 */
export function selectVisibleEndpointLabels(
  items: readonly { x: number; y: number; endpoint: EndpointDto }[],
  zoom: number,
  selectedId: string | null,
  jobContext?: MapJobContext,
  detailed = false,
  obstacles: readonly MapPoint[] = [],
  maxPriority = 3,
): LabeledEndpoint[] {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const gapX = (detailed ? 48 : 66) / safeZoom;
  const gapY = (detailed ? 19 : 24) / safeZoom;
  const obsGapX = 32 / safeZoom;
  const obsGapY = 18 / safeZoom;
  const labelOffset = 17 / safeZoom;

  const ranked = items
    .map(item => {
      const priority = endpointPriority(item.endpoint, selectedId, jobContext);
      const role = endpointJobRole(item.endpoint, jobContext);
      const showFull = detailed || priority === 0 || priority === 1;
      return {
        ...item,
        priority,
        role,
        displayText: compactEndpointLabel(item.endpoint, showFull),
      };
    })
    .filter(item => item.priority <= maxPriority)
    .sort((a, b) => a.priority - b.priority || a.endpoint.code.localeCompare(b.endpoint.code));

  const accepted: LabeledEndpoint[] = [];
  const acceptedPoints: MapPoint[] = [];

  const countCollisions = (pt: MapPoint, selfObstacles: readonly MapPoint[]) => {
    let count = 0;
    for (const obs of selfObstacles) {
      if (Math.abs(pt.x - obs.x) < obsGapX && Math.abs(pt.y - obs.y) < obsGapY) {
        count++;
      }
    }
    for (const placed of acceptedPoints) {
      if (Math.abs(pt.x - placed.x) < gapX && Math.abs(pt.y - placed.y) < gapY) {
        count++;
      }
    }
    return count;
  };

  for (const candidate of ranked) {
    const selfObstacles = obstacles.filter(
      obs => Math.hypot(obs.x - candidate.x, obs.y - candidate.y) > 0.5,
    );
    const belowPt = { x: candidate.x, y: candidate.y + labelOffset };
    const abovePt = { x: candidate.x, y: candidate.y - labelOffset };

    const belowHits = countCollisions(belowPt, selfObstacles);
    const aboveHits = countCollisions(abovePt, selfObstacles);

    if (candidate.priority <= 1) {
      const placement: LabelPlacement = aboveHits < belowHits ? 'above' : 'below';
      acceptedPoints.push(placement === 'above' ? abovePt : belowPt);
      accepted.push({ ...candidate, placement });
      continue;
    }

    if (belowHits === 0) {
      acceptedPoints.push(belowPt);
      accepted.push({ ...candidate, placement: 'below' });
    } else if (aboveHits === 0) {
      acceptedPoints.push(abovePt);
      accepted.push({ ...candidate, placement: 'above' });
    }
  }

  return accepted;
}

export interface KeyAreaWatermark {
  id: string;
  x: number;
  y: number;
  label: string;
  placement: LabelPlacement;
}

/**
 * Selects bare macro flow watermarks (`Inbound` / `Outbound`) for overview zoom without adding
 * pill clutter over operational stations.
 */
export function selectKeyAreaWatermarks(
  items: readonly { x: number; y: number; endpoint: EndpointDto }[],
  obstacles: readonly MapPoint[] = [],
  excludeIds: ReadonlySet<string> = new Set(),
): KeyAreaWatermark[] {
  const seenLabels = new Set<string>();
  const out: KeyAreaWatermark[] = [];

  for (const item of items) {
    if (excludeIds.has(item.endpoint.id)) continue;
    const kind = endpointVisualKind(
      item.endpoint.endpointType,
      item.endpoint.code,
      item.endpoint.name,
    );
    if (kind !== 'INBOUND' && kind !== 'OUTBOUND') continue;

    const label = kind === 'INBOUND' ? 'Inbound' : 'Outbound';
    if (seenLabels.has(label)) continue;

    const selfObstacles = obstacles.filter(
      obs => Math.hypot(obs.x - item.x, obs.y - item.y) > 0.5,
    );
    const isBlocked = (pt: MapPoint) =>
      selfObstacles.some(obs => Math.abs(pt.x - obs.x) < 26 && Math.abs(pt.y - obs.y) < 16);

    const belowPt = { x: item.x, y: item.y + 18 };
    const abovePt = { x: item.x, y: item.y - 18 };

    let placement: LabelPlacement | null = null;
    if (!isBlocked(belowPt)) {
      placement = 'below';
    } else if (!isBlocked(abovePt)) {
      placement = 'above';
    }
    if (!placement) continue;

    seenLabels.add(label);
    out.push({
      id: item.endpoint.id,
      x: item.x,
      y: item.y,
      label,
      placement,
    });
  }

  return out;
}

export function zoneShortBadge(zone: ZoneDto): string {
  switch (zone.zoneType) {
    case 'KEEP_OUT':
      return 'No Entry';
    case 'SPEED':
      return zone.maxSpeed != null ? `≤ ${zone.maxSpeed} m/s` : 'Speed';
    case 'NO_STOP':
      return 'No Stop';
    case 'SINGLE_OCCUPANCY':
      return '1 AMR';
    case 'JUNCTION':
      return 'Junction';
    default:
      return zone.zoneType;
  }
}

export function visibleZoneLabels(
  map: MapVersionDetailDto,
  frame: MapFrame,
  zoom: number,
  selectedZoneId: string | null,
  obstacles: readonly MapPoint[] = [],
): ZoneFloorLabel[] {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const obsGapX = 26 / safeZoom;
  const obsGapY = 18 / safeZoom;
  const out: ZoneFloorLabel[] = [];

  for (const zone of map.zones || []) {
    if (zone.mapVersionId !== map.id || !zone.isActive || zone.geometry?.type !== 'Polygon') {
      continue;
    }
    const outer = zone.geometry.coordinates[0]?.map(pt =>
      worldToBase({ x: pt[0], y: pt[1] }, map, frame),
    );
    if (!outer || outer.length < 3 || outer.some(p => !p)) continue;

    const pts = outer as MapPoint[];
    const bounds = polygonBounds(pts);
    const fitsScreen = bounds.width * safeZoom >= 78 && bounds.height * safeZoom >= 34;
    if (!fitsScreen && zone.id !== selectedZoneId) continue;

    const center = polygonCentroid(pts);
    const blocked =
      zone.id !== selectedZoneId &&
      obstacles.some(
        obs => Math.abs(center.x - obs.x) < obsGapX && Math.abs(center.y - obs.y) < obsGapY,
      );
    if (blocked) continue;

    out.push({
      id: zone.id,
      zone,
      x: center.x,
      y: center.y,
      name: zone.name || zone.code,
      badge: zoneShortBadge(zone),
    });
  }

  return out;
}
