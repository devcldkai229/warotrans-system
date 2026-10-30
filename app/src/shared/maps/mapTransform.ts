import type { MapGeometry } from '../utils/mapCoordinates';
import { hasMapCalibration, worldToMapPercent } from '../utils/mapCoordinates';

export interface MapPoint { x: number; y: number }
export interface MapCamera { zoom: number; x: number; y: number }
export interface MapInsets { top?: number; right?: number; bottom?: number; left?: number }
export interface MapFrame {
  width: number; height: number; mapWidth: number; mapHeight: number;
  left: number; top: number; scale: number; rotated: boolean;
  insets?: MapInsets;
}
export const FIT_CAMERA: MapCamera = { zoom: 1, x: 0, y: 0 };

export function createMapFrame(map: MapGeometry, width: number, height: number, insets?: MapInsets): MapFrame | null {
  if (!hasMapCalibration(map) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const padL = Math.max(0, insets?.left ?? 0);
  const padR = Math.max(0, insets?.right ?? 0);
  const padT = Math.max(0, insets?.top ?? 0);
  const padB = Math.max(0, insets?.bottom ?? 0);
  const safeW = Math.max(10, width - padL - padR);
  const safeH = Math.max(10, height - padT - padB);

  const rotated = map.imageWidthPixels > map.imageHeightPixels && height > width;
  const pixelWidth = rotated ? map.imageHeightPixels : map.imageWidthPixels;
  const pixelHeight = rotated ? map.imageWidthPixels : map.imageHeightPixels;
  const scale = Math.min(safeW / pixelWidth, safeH / pixelHeight);
  const mapWidth = pixelWidth * scale, mapHeight = pixelHeight * scale;
  const left = padL + (safeW - mapWidth) / 2;
  const top = padT + (safeH - mapHeight) / 2;
  return { width, height, mapWidth, mapHeight, left, top, scale, rotated, insets: { top: padT, right: padR, bottom: padB, left: padL } };
}

/** Unclamped projection: geometry is clipped by the renderer, never distorted. */
export function worldToBase(point: MapPoint, map: MapGeometry, frame: MapFrame): MapPoint | null {
  const p = worldToMapPercent(point.x, point.y, map);
  if (!p) return null;
  return frame.rotated
    ? { x: frame.left + (1-p.y/100)*frame.mapWidth, y: frame.top + p.x/100*frame.mapHeight }
    : { x: frame.left + p.x/100*frame.mapWidth, y: frame.top + p.y/100*frame.mapHeight };
}

export function baseToWorld(point: MapPoint, map: MapGeometry, frame: MapFrame): MapPoint | null {
  if (!hasMapCalibration(map) || ![point.x,point.y,frame.scale].every(Number.isFinite) || frame.scale <= 0) return null;
  const u = (point.x-frame.left)/frame.mapWidth, v = (point.y-frame.top)/frame.mapHeight;
  const px = frame.rotated ? v : u;
  const py = frame.rotated ? 1-u : v;
  const x = px*map.imageWidthPixels*map.resolution;
  const y = (1-py)*map.imageHeightPixels*map.resolution;
  return { x: map.originX+x*Math.cos(map.originYaw)-y*Math.sin(map.originYaw), y: map.originY+x*Math.sin(map.originYaw)+y*Math.cos(map.originYaw) };
}

export function applyCamera(point: MapPoint, camera: MapCamera): MapPoint {
  'worklet';
  return { x: point.x*camera.zoom+camera.x, y: point.y*camera.zoom+camera.y };
}

export function screenToWorld(point: MapPoint, map: MapGeometry, frame: MapFrame, camera: MapCamera): MapPoint | null {
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) return null;
  return baseToWorld({ x: (point.x-camera.x)/camera.zoom, y: (point.y-camera.y)/camera.zoom }, map, frame);
}

export function clampCamera(camera: MapCamera, frame: MapFrame): MapCamera {
  'worklet';
  const zoom = Math.max(1, Math.min(8, camera.zoom));
  const padL = frame.insets?.left ?? 0;
  const padR = frame.insets?.right ?? 0;
  const padT = frame.insets?.top ?? 0;
  const padB = frame.insets?.bottom ?? 0;
  const safeW = Math.max(10, frame.width - padL - padR);
  const safeH = Math.max(10, frame.height - padT - padB);

  const bound = (offset: number, origin: number, size: number, viewport: number, padStart: number, safeSize: number) => {
    'worklet';
    if (size*zoom <= safeSize) return padStart + (safeSize - size*zoom)/2 - origin*zoom;
    return Math.max(24-(origin+size)*zoom, Math.min(viewport-24-origin*zoom, offset));
  };
  return { zoom, x: bound(camera.x,frame.left,frame.mapWidth,frame.width,padL,safeW), y: bound(camera.y,frame.top,frame.mapHeight,frame.height,padT,safeH) };
}

export function zoomAtPoint(camera: MapCamera, targetZoom: number, focal: MapPoint): MapCamera {
  'worklet';
  const zoom = Math.max(1, Math.min(8, targetZoom));
  const ratio = zoom/camera.zoom;
  return { zoom, x: focal.x-(focal.x-camera.x)*ratio, y: focal.y-(focal.y-camera.y)*ratio };
}

export function cameraForPoint(point: MapPoint, camera: MapCamera, frame: MapFrame): MapCamera {
  const padL = frame.insets?.left ?? 0;
  const padR = frame.insets?.right ?? 0;
  const padT = frame.insets?.top ?? 0;
  const padB = frame.insets?.bottom ?? 0;
  const centerX = padL + Math.max(10, frame.width - padL - padR) / 2;
  const centerY = padT + Math.max(10, frame.height - padT - padB) / 2;
  return clampCamera({ zoom: camera.zoom, x: centerX - point.x*camera.zoom, y: centerY - point.y*camera.zoom }, frame);
}

export function metricStep(metersPerScreenPoint: number): number {
  const target = metersPerScreenPoint*64;
  if (!Number.isFinite(target) || target <= 0) return 1;
  const magnitude = 10**Math.floor(Math.log10(target));
  return [1,2,5,10].map(n=>n*magnitude).reduce((best,n)=>Math.abs(Math.log(n/target))<Math.abs(Math.log(best/target))?n:best);
}

export function metricScale(map: MapGeometry, frame: MapFrame, zoom: number) {
  const metersPerPoint = map.resolution/(frame.scale*zoom);
  const meters = metricStep(metersPerPoint);
  return { meters, width: meters/metersPerPoint };
}
