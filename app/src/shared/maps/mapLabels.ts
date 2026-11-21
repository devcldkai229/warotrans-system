import type { EndpointDto, MapVersionDetailDto, ZoneDto } from '../api/navigationApi';
import { polygonBounds, polygonCentroid } from './mapHitTest';
import { endpointKind } from './mapStyle';
import { worldToBase, type MapFrame, type MapPoint } from './mapTransform';

export interface MapJobContext {
  pickupCode?: string | null;
  dropoffCode?: string | null;
  robotCode?: string | null;
}

export type EndpointJobRole = 'pickup' | 'dropoff';

export interface LabeledEndpoint {
  x: number;
  y: number;
  endpoint: EndpointDto;
  displayText: string;
  role: EndpointJobRole | null;
  priority: number;
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
  if (name && name.length <= 18) return name;
  return code || name;
}

/**
 * Smart Auto-LOD endpoint label selector:
 * - Always keeps selected endpoint (priority 0) and active Job endpoints (priority 1).
 * - Shows non-overlapping landmark labels at zoom 1×, expanding to all stations when zoomed in (`detailed`).
 */
export function selectVisibleEndpointLabels(
  items: readonly { x: number; y: number; endpoint: EndpointDto }[],
  zoom: number,
  selectedId: string | null,
  jobContext?: MapJobContext,
  detailed = false,
): LabeledEndpoint[] {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const gapX = (detailed ? 52 : 76) / safeZoom;
  const gapY = (detailed ? 22 : 28) / safeZoom;

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
    .sort((a, b) => a.priority - b.priority || a.endpoint.code.localeCompare(b.endpoint.code));

  const accepted: LabeledEndpoint[] = [];
  for (const candidate of ranked) {
    if (candidate.priority <= 1) {
      accepted.push(candidate);
      continue;
    }
    const collides = accepted.some(
      placed => Math.abs(candidate.x - placed.x) < gapX && Math.abs(candidate.y - placed.y) < gapY,
    );
    if (!collides) {
      accepted.push(candidate);
    }
  }

  return accepted;
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
): ZoneFloorLabel[] {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const out: ZoneFloorLabel[] = [];

  for (const zone of map.zones || []) {
    if (zone.mapVersionId !== map.id || !zone.isActive || zone.geometry?.type !== 'Polygon') {
      continue;
    }
    const outer = zone.geometry.coordinates[0]?.map(pt => worldToBase({ x: pt[0], y: pt[1] }, map, frame));
    if (!outer || outer.length < 3 || outer.some(p => !p)) continue;

    const pts = outer as MapPoint[];
    const bounds = polygonBounds(pts);
    const fitsScreen = bounds.width * safeZoom >= 54 && bounds.height * safeZoom >= 26;
    if (!fitsScreen && zone.id !== selectedZoneId) continue;

    const center = polygonCentroid(pts);
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
