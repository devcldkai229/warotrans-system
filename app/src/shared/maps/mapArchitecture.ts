import type { EndpointDto, MapVersionDetailDto } from '../api/navigationApi';
import { hasMapCalibration, worldToMapPercent, type MapGeometry } from '../utils/mapCoordinates';
import { mapHeading } from './mapModel';
import {
  DOCK_BAY_LENGTH_METERS,
  DOCK_BAY_WIDTH_METERS,
  ROBOT_LENGTH_METERS,
  ROBOT_WIDTH_METERS,
  SHELF_BAY_DEPTH_METERS,
  SHELF_BAY_LENGTH_METERS,
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

export interface PerimeterShelfWalls {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

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

const PERIMETER_WALL_META: Record<PerimeterWall, { nx: number; ny: number }> = {
  top: { nx: 0, ny: -1 },
  bottom: { nx: 0, ny: 1 },
  left: { nx: -1, ny: 0 },
  right: { nx: 1, ny: 0 },
};

const PERIMETER_WALLS: readonly PerimeterWall[] = ['top', 'bottom', 'left', 'right'];

function selectShelfPerimeterWall(
  distances: Record<PerimeterWall, number>,
  headingDeg: number,
): PerimeterWall | null {
  const rad = (headingDeg * Math.PI) / 180;
  const hx = Math.sin(rad);
  const hy = -Math.cos(rad);

  let bestWall: PerimeterWall | null = null;
  let bestScore = Infinity;
  for (const wall of PERIMETER_WALLS) {
    const distMeters = distances[wall];
    if (!Number.isFinite(distMeters) || distMeters > MAX_WALL_DISTANCE_METERS) continue;
    const { nx, ny } = PERIMETER_WALL_META[wall];
    const score = distMeters - 0.18 * (hx * nx + hy * ny);
    if (score < bestScore) {
      bestScore = score;
      bestWall = wall;
    }
  }
  return bestWall;
}

/**
 * Determine which outer map perimeter walls host recessed `0.35 m x 0.70 m` wall-mounted shelves
 * so the viewport only reserves extra exterior margin where recessed shelves actually protrude.
 */
export function detectPerimeterShelfWalls(
  map: MapVersionDetailDto,
  rotated: boolean,
): PerimeterShelfWalls {
  const walls: PerimeterShelfWalls = { top: false, bottom: false, left: false, right: false };
  if (!hasMapCalibration(map)) return walls;

  const worldW = map.imageWidthPixels * map.resolution;
  const worldH = map.imageHeightPixels * map.resolution;
  const displayW = rotated ? worldH : worldW;
  const displayH = rotated ? worldW : worldH;

  for (const ep of map.endpoints) {
    if (!ep.isEnabled || ep.mapVersionId !== map.id) continue;
    if (endpointVisualKind(ep.endpointType, ep.code, ep.name) !== 'SHELF') continue;
    const p = worldToMapPercent(ep.x, ep.y, map);
    if (!p) continue;

    const u = rotated ? 1 - p.y / 100 : p.x / 100;
    const v = rotated ? p.x / 100 : p.y / 100;
    const headingDeg = mapHeading(ep.yaw, map.originYaw, rotated);
    const wall = selectShelfPerimeterWall(
      {
        top: Math.abs(v) * displayH,
        bottom: Math.abs(1 - v) * displayH,
        left: Math.abs(u) * displayW,
        right: Math.abs(1 - u) * displayW,
      },
      headingDeg,
    );
    if (wall) walls[wall] = true;
  }

  return walls;
}

interface ShelfBayCandidate {
  ep: EndpointDto;
  wall: PerimeterWall;
  isHoriz: boolean;
  anchorPos: number;
  desiredSpan: number;
  depth: number;
  wallCoord: number;
  wallMin: number;
  wallMax: number;
  startX: number;
  startY: number;
  needsConnector: boolean;
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
  const candidatesByWall: Record<PerimeterWall, ShelfBayCandidate[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  };

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

    const wall = selectShelfPerimeterWall(
      {
        top: Math.abs(item.y - frame.top) / pxPerMetre,
        bottom: Math.abs(wallBottom - item.y) / pxPerMetre,
        left: Math.abs(item.x - frame.left) / pxPerMetre,
        right: Math.abs(wallRight - item.x) / pxPerMetre,
      },
      headingDeg,
    );
    if (!wall) continue;

    const { nx, ny } = PERIMETER_WALL_META[wall];
    const availDepthByWall: Record<PerimeterWall, number> = {
      top: frame.top - 2,
      bottom: frame.height - wallBottom - 2,
      left: frame.left - 2,
      right: frame.width - wallRight - 2,
    };

    const isHoriz = wall === 'top' || wall === 'bottom';
    const desiredSpan = Math.min(
      SHELF_BAY_LENGTH_METERS * pxPerMetre,
      (isHoriz ? frame.mapWidth : frame.mapHeight) - 8,
    );
    const desiredDepth = SHELF_BAY_DEPTH_METERS * pxPerMetre;
    const depth = Math.min(desiredDepth, availDepthByWall[wall]);
    if (depth < 6 || desiredSpan < 10) continue;

    const bayHalfOffset = (DOCK_BAY_LENGTH_METERS * 0.5) * pxPerMetre;
    const startX = item.x + nx * bayHalfOffset;
    const startY = item.y + ny * bayHalfOffset;
    const wallCoord = isHoriz
      ? wall === 'top'
        ? frame.top
        : wallBottom
      : wall === 'left'
      ? frame.left
      : wallRight;
    const anchorPos = isHoriz ? item.x : item.y;
    const wallMin = (isHoriz ? frame.left : frame.top) + 4;
    const wallMax = (isHoriz ? wallRight : wallBottom) - 4;
    const needsConnector =
      wall === 'top'
        ? startY > wallCoord + 3
        : wall === 'bottom'
        ? startY < wallCoord - 3
        : wall === 'left'
        ? startX > wallCoord + 3
        : startX < wallCoord - 3;

    candidatesByWall[wall].push({
      ep,
      wall,
      isHoriz,
      anchorPos,
      desiredSpan,
      depth,
      wallCoord,
      wallMin,
      wallMax,
      startX,
      startY,
      needsConnector,
    });
  }

  const gap = clamp(pxPerMetre * 0.04, 3, 6);
  for (const wall of PERIMETER_WALLS) {
    const group = candidatesByWall[wall];
    if (!group.length) continue;
    const sorted = [...group].sort((a, b) => a.anchorPos - b.anchorPos);

    // Trim span to neighbor spacing so adjacent shelf rectangles never overlap
    const placed = sorted.map((c, idx) => {
      const prevDist = idx > 0 ? c.anchorPos - sorted[idx - 1].anchorPos - gap : Infinity;
      const nextDist = idx < sorted.length - 1 ? sorted[idx + 1].anchorPos - c.anchorPos - gap : Infinity;
      const span = Math.max(10, Math.min(c.desiredSpan, prevDist, nextDist));
      const maxStart = Math.max(c.wallMin, c.wallMax - span);
      const start = clamp(c.anchorPos - span / 2, c.wallMin, maxStart);
      return { c, start, end: start + span };
    });

    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1];
      const curr = placed[i];
      if (prev.end + gap > curr.start) {
        const mid = (prev.end + curr.start) / 2;
        prev.end = Math.max(prev.start + 10, mid - gap / 2);
        curr.start = Math.max(Math.min(curr.end - 10, mid + gap / 2), prev.end + gap);
        if (curr.end < curr.start + 10) {
          curr.end = Math.min(curr.c.wallMax, curr.start + 10);
        }
      }
    }

    for (const { c, start, end } of placed) {
      const finalSpan = Math.max(6, end - start);
      const slots = finalSpan < 26 ? 2 : 3;
      if (c.isHoriz) {
        const y = c.wall === 'top' ? c.wallCoord - c.depth : c.wallCoord;
        const opening = { x1: start, y1: c.wallCoord, x2: start + finalSpan, y2: c.wallCoord };
        const connX = clamp(c.anchorPos, opening.x1, opening.x2);
        shelfBays.push({
          id: c.ep.id,
          code: c.ep.code,
          name: c.ep.name,
          wall: c.wall,
          x: start,
          y,
          width: finalSpan,
          height: c.depth,
          slots,
          opening,
          connector: c.needsConnector ? { x1: c.startX, y1: c.startY, x2: connX, y2: c.wallCoord } : null,
        });
      } else {
        const x = c.wall === 'left' ? c.wallCoord - c.depth : c.wallCoord;
        const opening = { x1: c.wallCoord, y1: start, x2: c.wallCoord, y2: start + finalSpan };
        const connY = clamp(c.anchorPos, opening.y1, opening.y2);
        shelfBays.push({
          id: c.ep.id,
          code: c.ep.code,
          name: c.ep.name,
          wall: c.wall,
          x,
          y: start,
          width: c.depth,
          height: finalSpan,
          slots,
          opening,
          connector: c.needsConnector ? { x1: c.startX, y1: c.startY, x2: c.wallCoord, y2: connY } : null,
        });
      }
    }
  }

  return { dockBays, shelfBays };
}

export const ROBOT_TAG_WIDTH = 104;
export const ROBOT_TAG_HEIGHT = 18;
export const ROBOT_TAG_GAP = 6;

export type RobotTagPlacement = 'below' | 'above' | 'right' | 'left' | 'below-far' | 'above-far';

export interface RobotTagAnchorInput {
  id: string;
  code: string;
  x: number;
  y: number;
  isSelected?: boolean;
}

export interface ResolvedRobotTagLayout {
  placement: RobotTagPlacement;
  tagWidth: number;
}

interface ScreenBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const ROBOT_TAG_PRIORITY: readonly RobotTagPlacement[] = [
  'below',
  'above',
  'right',
  'left',
  'below-far',
  'above-far',
];

/** Estimate screen width of a robot code pill (`dot + code + pill padding`). */
export function estimateRobotTagWidth(code: string): number {
  return Math.min(ROBOT_TAG_WIDTH, Math.max(46, Math.ceil(24 + code.length * 6.4)));
}

function boxOverlapArea(a: ScreenBox, b: ScreenBox, pad: number): number {
  const ox = Math.max(0, Math.min(a.x2 + pad, b.x2) - Math.max(a.x1 - pad, b.x1));
  if (ox <= 0) return 0;
  const oy = Math.max(0, Math.min(a.y2 + pad, b.y2) - Math.max(a.y1 - pad, b.y1));
  return ox * oy;
}

function candidateTagBox(
  placement: RobotTagPlacement,
  cx: number,
  cy: number,
  radius: number,
  tagW: number,
): ScreenBox {
  switch (placement) {
    case 'below': {
      const y1 = cy + radius + ROBOT_TAG_GAP;
      return { x1: cx - tagW / 2, y1, x2: cx + tagW / 2, y2: y1 + ROBOT_TAG_HEIGHT };
    }
    case 'above': {
      const y2 = cy - radius - ROBOT_TAG_GAP;
      return { x1: cx - tagW / 2, y1: y2 - ROBOT_TAG_HEIGHT, x2: cx + tagW / 2, y2 };
    }
    case 'right': {
      const x1 = cx + radius + ROBOT_TAG_GAP;
      return { x1, y1: cy - ROBOT_TAG_HEIGHT / 2, x2: x1 + tagW, y2: cy + ROBOT_TAG_HEIGHT / 2 };
    }
    case 'left': {
      const x2 = cx - radius - ROBOT_TAG_GAP;
      return { x1: x2 - tagW, y1: cy - ROBOT_TAG_HEIGHT / 2, x2, y2: cy + ROBOT_TAG_HEIGHT / 2 };
    }
    case 'below-far': {
      const y1 = cy + radius + ROBOT_TAG_GAP + ROBOT_TAG_HEIGHT + 4;
      return { x1: cx - tagW / 2, y1, x2: cx + tagW / 2, y2: y1 + ROBOT_TAG_HEIGHT };
    }
    case 'above-far': {
      const y1 = cy - radius - ROBOT_TAG_GAP - ROBOT_TAG_HEIGHT * 2 - 4;
      return { x1: cx - tagW / 2, y1, x2: cx + tagW / 2, y2: y1 + ROBOT_TAG_HEIGHT };
    }
  }
}

/**
 * Resolve deterministic non-overlapping tag slot placements (`below`, `above`, `right`, `left`,
 * `below-far`, `above-far`) in screen coordinates at the current settled zoom.
 */
export function resolveRobotTagPlacements(
  items: readonly RobotTagAnchorInput[],
  halfLength: number,
  zoom: number,
): Record<string, ResolvedRobotTagLayout> {
  if (items.length === 0) return {};

  const z = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const r = (halfLength + 2) * z;

  const entries = items.map(item => {
    const cx = item.x * z;
    const cy = item.y * z;
    return {
      item,
      cx,
      cy,
      tagWidth: estimateRobotTagWidth(item.code),
      chassis: { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r },
    };
  });

  const sorted = [...entries].sort(
    (a, b) =>
      (a.item.isSelected ? 0 : 1) - (b.item.isSelected ? 0 : 1) ||
      a.item.code.localeCompare(b.item.code) ||
      a.item.id.localeCompare(b.item.id),
  );

  const placedTags: ScreenBox[] = [];
  const result: Record<string, ResolvedRobotTagLayout> = {};

  for (const current of sorted) {
    let chosenPlacement: RobotTagPlacement = 'below';
    let chosenBox = candidateTagBox('below', current.cx, current.cy, r, current.tagWidth);
    let bestScore = Infinity;

    for (const placement of ROBOT_TAG_PRIORITY) {
      const box = candidateTagBox(placement, current.cx, current.cy, r, current.tagWidth);
      let score = 0;

      for (const placed of placedTags) {
        score += boxOverlapArea(box, placed, 4);
      }
      for (const other of entries) {
        if (other.item.id === current.item.id) continue;
        score += boxOverlapArea(box, other.chassis, 2);
      }

      if (score === 0) {
        chosenPlacement = placement;
        chosenBox = box;
        break;
      }
      if (score < bestScore) {
        bestScore = score;
        chosenPlacement = placement;
        chosenBox = box;
      }
    }

    placedTags.push(chosenBox);
    result[current.item.id] = { placement: chosenPlacement, tagWidth: current.tagWidth };
  }

  return result;
}
