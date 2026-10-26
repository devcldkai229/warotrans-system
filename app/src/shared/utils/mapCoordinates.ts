export interface MapGeometry {
  imageWidthPixels: number;
  imageHeightPixels: number;
  resolution: number;
  originX: number;
  originY: number;
  originYaw: number;
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
