export interface MapGeometry {
  imageWidthPixels: number;
  imageHeightPixels: number;
  resolution: number;
  originX: number;
  originY: number;
  originYaw: number;
}

export function hasMapCalibration(map: MapGeometry | null | undefined): map is MapGeometry {
  return !!map && [map.imageWidthPixels, map.imageHeightPixels, map.resolution, map.originX, map.originY, map.originYaw].every(Number.isFinite)
    && map.imageWidthPixels > 0 && map.imageHeightPixels > 0 && map.resolution > 0;
}

export function fitMapViewport(map: MapGeometry, width: number, height: number) {
  if (!hasMapCalibration(map) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(width / map.imageWidthPixels, height / map.imageHeightPixels);
  return { width: map.imageWidthPixels * scale, height: map.imageHeightPixels * scale };
}

export function resolveMapPreviewUri(uri: string | null | undefined, apiBaseUrl: string): string | null {
  if (!uri || uri.startsWith('pending://') || uri.startsWith('s3://')) return null;
  if (/^https?:\/\//i.test(uri)) return uri;
  return `${apiBaseUrl.replace(/\/+$/, '')}/${uri.replace(/^\/+/, '')}`;
}

/** ROS map origin is the lower-left pixel; screen coordinates start at the top left. */
export function worldToMapPercent(x: number, y: number, map: MapGeometry) {
  if (![x, y, map.originX, map.originY, map.originYaw, map.resolution, map.imageWidthPixels, map.imageHeightPixels].every(Number.isFinite) ||
      map.resolution <= 0 || map.imageWidthPixels <= 0 || map.imageHeightPixels <= 0) return null;
  const dx = x - map.originX;
  const dy = y - map.originY;
  const localX = dx * Math.cos(map.originYaw) + dy * Math.sin(map.originYaw);
  const localY = -dx * Math.sin(map.originYaw) + dy * Math.cos(map.originYaw);
  return { x: localX / (map.resolution * map.imageWidthPixels) * 100,
    y: (1 - localY / (map.resolution * map.imageHeightPixels)) * 100 };
}
