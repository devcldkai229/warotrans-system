import type { EndpointDto, MapVersionDetailDto } from '../api/navigationApi';
import type { MapGeometry } from '../utils/mapCoordinates';
import { mapHeading } from './mapModel';
import {
  DOCK_BAY_LENGTH_METERS,
  DOCK_BAY_WIDTH_METERS,
  ROBOT_LENGTH_METERS,
  ROBOT_WIDTH_METERS,
  endpointVisualKind,
  type EndpointVisualKind,
} from './mapStyle';
import type { MapFrame } from './mapTransform';

export interface RobotFootprintSize {
  width: number;
  length: number;
  pxPerMetre: number;
}

export type PerimeterWall = 'top' | 'bottom' | 'left' | 'right';

export interface DockBayGeometry {
  id: string;
  kind: EndpointVisualKind;
  endpointType: string;
  cx: number;
  cy: number;
  width: number;
  length: number;
  headingDeg: number;
}

export interface RecessedShelfBayGeometry {
  id: string;
  code: string;
  name: string;
  wall: PerimeterWall;
  x: number;
  y: number;
  width: number;
  height: number;
  slots: number;
  opening: { x1: number; y1: number; x2: number; y2: number };
  connector: { x1: number; y1: number; x2: number; y2: number } | null;
}

const DOCK_BAY_KINDS = new Set<EndpointVisualKind>([
  'SHELF',
  'CHARGER',
  'PARK',
  'INBOUND',
  'OUTBOUND',
  'INSPECTION',
]);

const MAX_WALL_DISTANCE_METERS = 0.80;
const MIN_FLOOR_PX_PER_METRE = 12;

/** Real-world AMR chassis footprint in base map pixels (keeps readable 16px floor on very large maps). */
export function robotFootprintPx(map: MapGeometry, frame: MapFrame): RobotFootprintSize {
  const pxPerMetre = frame.scale / (map.resolution || 0.05);
  const rawW = ROBOT_WIDTH_METERS * pxPerMetre;
  const rawL = ROBOT_LENGTH_METERS * pxPerMetre;
  if (rawL < 16) {
    return {
      width: (ROBOT_WIDTH_METERS / ROBOT_LENGTH_METERS) * 16,
      length: 16,
      pxPerMetre,
    };
  }
  return { width: rawW, length: rawL, pxPerMetre };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derive world-scaled floor docking bays (`[ ]`) and recessed wall-mounted shelf bays from real
 * endpoint poses relative to the map's outer perimeter walls.
 */
export function computeStationArchitecture(
  map: MapVersionDetailDto,
  frame: MapFrame,
  items: readonly { x: number; y: number; endpoint: EndpointDto }[],
  options?: { includeWallShelves?: boolean },
): { dockBays: DockBayGeometry[]; shelfBays: RecessedShelfBayGeometry[] } {
  const pxPerMetre = frame.scale / (map.resolution || 0.05);
  if (!Number.isFinite(pxPerMetre) || pxPerMetre < MIN_FLOOR_PX_PER_METRE) {
    return { dockBays: [], shelfBays: [] };
  }

  const dockBays: DockBayGeometry[] = [];
  const shelfBays: RecessedShelfBayGeometry[] = [];
  const includeWallShelves = options?.includeWallShelves !== false;
  const wallRight = frame.left + frame.mapWidth;
  const wallBottom = frame.top + frame.mapHeight;

  for (const item of items) {
    const ep = item.endpoint;
    const kind = endpointVisualKind(ep.endpointType, ep.code, ep.name);
    const headingDeg = mapHeading(ep.yaw, map.originYaw, frame.rotated);

    if (DOCK_BAY_KINDS.has(kind)) {
      dockBays.push({
        id: ep.id,
        kind,
        endpointType: ep.endpointType,
        cx: item.x,
        cy: item.y,
        width: DOCK_BAY_WIDTH_METERS * pxPerMetre,
        length: DOCK_BAY_LENGTH_METERS * pxPerMetre,
        headingDeg,
      });
    }

    if (!includeWallShelves || kind !== 'SHELF') continue;

    const candidates: {
      wall: PerimeterWall;
      distMeters: number;
      nx: number;
      ny: number;
      availDepth: number;
    }[] = [
      {
        wall: 'top',
        distMeters: Math.abs(item.y - frame.top) / pxPerMetre,
        nx: 0,
        ny: -1,
        availDepth: frame.top - 2,
      },
      {
        wall: 'bottom',
        distMeters: Math.abs(wallBottom - item.y) / pxPerMetre,
        nx: 0,
        ny: 1,
        availDepth: frame.height - wallBottom - 2,
      },
      {
        wall: 'left',
        distMeters: Math.abs(item.x - frame.left) / pxPerMetre,
        nx: -1,
        ny: 0,
        availDepth: frame.left - 2,
      },
      {
        wall: 'right',
        distMeters: Math.abs(wallRight - item.x) / pxPerMetre,
        nx: 1,
        ny: 0,
        availDepth: frame.width - wallRight - 2,
      },
    ];

    const rad = (headingDeg * Math.PI) / 180;
    const hx = Math.sin(rad);
    const hy = -Math.cos(rad);

    let bestWall: (typeof candidates)[number] | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      if (c.distMeters > MAX_WALL_DISTANCE_METERS) continue;
      const score = c.distMeters - 0.18 * (hx * c.nx + hy * c.ny);
      if (score < bestScore) {
        bestScore = score;
        bestWall = c;
      }
    }
    if (!bestWall) continue;

    const isHoriz = bestWall.wall === 'top' || bestWall.wall === 'bottom';
    const span = Math.min(0.52 * pxPerMetre, (isHoriz ? frame.mapWidth : frame.mapHeight) * 0.24);
    const desiredDepth = clamp(0.20 * pxPerMetre, 9, 18);
    const depth = Math.min(desiredDepth, bestWall.availDepth);
    if (depth < 6 || span < 10) continue;

    const bayHalfOffset = (DOCK_BAY_LENGTH_METERS * 0.5) * pxPerMetre;
    const startX = item.x + bestWall.nx * bayHalfOffset;
    const startY = item.y + bestWall.ny * bayHalfOffset;

    if (isHoriz) {
      const cx = clamp(item.x, frame.left + span / 2 + 4, wallRight - span / 2 - 4);
      const x = cx - span / 2;
      const y = bestWall.wall === 'top' ? frame.top - depth : wallBottom;
      const wallY = bestWall.wall === 'top' ? frame.top : wallBottom;
      const opening = { x1: x, y1: wallY, x2: x + span, y2: wallY };
      const connX = clamp(item.x, opening.x1, opening.x2);
      const needsConnector =
        bestWall.wall === 'top' ? startY > wallY + 3 : startY < wallY - 3;
      shelfBays.push({
        id: ep.id,
        code: ep.code,
        name: ep.name,
        wall: bestWall.wall,
        x,
        y,
        width: span,
        height: depth,
        slots: 3,
        opening,
        connector: needsConnector ? { x1: startX, y1: startY, x2: connX, y2: wallY } : null,
      });
    } else {
      const cy = clamp(item.y, frame.top + span / 2 + 4, wallBottom - span / 2 - 4);
      const y = cy - span / 2;
      const x = bestWall.wall === 'left' ? frame.left - depth : wallRight;
      const wallX = bestWall.wall === 'left' ? frame.left : wallRight;
      const opening = { x1: wallX, y1: y, x2: wallX, y2: y + span };
      const connY = clamp(item.y, opening.y1, opening.y2);
      const needsConnector =
        bestWall.wall === 'left' ? startX > wallX + 3 : startX < wallX - 3;
      shelfBays.push({
        id: ep.id,
        code: ep.code,
        name: ep.name,
        wall: bestWall.wall,
        x,
        y,
        width: depth,
        height: span,
        slots: 3,
        opening,
        connector: needsConnector ? { x1: startX, y1: startY, x2: wallX, y2: connY } : null,
      });
    }
  }

  return { dockBays, shelfBays };
}
