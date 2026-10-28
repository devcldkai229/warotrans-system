import type { MapVersionDetailDto } from '../api/navigationApi';
import { hasMapCalibration, worldToMapPercent, type MapGeometry } from '../utils/mapCoordinates';
import models from './rosMapModels.json';

export interface MapModel {
  key: string;
  contentHash: string;
  geometry: MapGeometry;
  occupied: number[][];
  unknown: number[][];
  shelves?: { code: string; name: string; x: number; y: number; sx: number; sy: number; levels: number }[];
  floorPaint?: { name: string; x0: number; y0: number; x1: number; y1: number }[];
}

/** A matching filename or calibration alone cannot identify a physical layout. */
export function findMapModel(map: MapVersionDetailDto): MapModel | null {
  if (!hasMapCalibration(map) || map.frameId !== 'map' || !map.contentHash) return null;
  return (models as MapModel[]).find(model => model.contentHash === map.contentHash?.toLowerCase()
    && (Object.keys(model.geometry) as (keyof MapGeometry)[]).every(key => Math.abs(model.geometry[key] - map[key]) < 1e-8)) || null;
}

/** Rotate the entire scene clockwise for a portrait screen, without changing world coordinates. */
export function mapViewport(map: MapGeometry, width: number, height: number, portrait = height > width) {
  if (!hasMapCalibration(map) || !Number.isFinite(width) || !Number.isFinite(height)) return { rotated: false, scale: 0, width: 0, height: 0 };
  const rotated = map.imageWidthPixels > map.imageHeightPixels && portrait;
  const pixelWidth = rotated ? map.imageHeightPixels : map.imageWidthPixels;
  const pixelHeight = rotated ? map.imageWidthPixels : map.imageHeightPixels;
  const scale = hasMapCalibration(map) ? Math.max(0, Math.min(width / pixelWidth, height / pixelHeight)) : 0;
  return { rotated, scale, width: pixelWidth * scale, height: pixelHeight * scale };
}

/** Keep touch targets separate at small scales; the full list remains available in Layers. */
export function spacedLocations<T extends { x: number; y: number }>(locations: T[], occupied: { x: number; y: number }[], gap = 44): T[] {
  const placed = [...occupied];
  return locations.filter(location => {
    if (placed.some(p => Math.abs(p.x - location.x) < gap && Math.abs(p.y - location.y) < gap)) return false;
    placed.push(location);
    return true;
  });
}

export function displayPoint(x: number, y: number, map: MapGeometry, viewport: ReturnType<typeof mapViewport>) {
  const point = worldToMapPercent(x, y, map);
  if (!point || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return null;
  return viewport.rotated ? { x: (100 - point.y) * viewport.width / 100, y: point.x * viewport.height / 100 }
    : { x: point.x * viewport.width / 100, y: point.y * viewport.height / 100 };
}

export function mapHeading(yaw: number, originYaw: number, rotated: boolean) {
  return 90 - (yaw - originYaw) * 180 / Math.PI + (rotated ? 90 : 0);
}

/** The pose and map identity must come from the same REST snapshot. */
export function mapRobotSnapshots<T extends { currentMapVersionId: string; lastTelemetryAt: string | null; poseX: number; poseY: number; poseYaw: number }>(robots: T[], mapId: string): T[] {
  return robots.filter(robot => robot.currentMapVersionId === mapId && robot.lastTelemetryAt
    && [robot.poseX, robot.poseY, robot.poseYaw].every(Number.isFinite));
}
