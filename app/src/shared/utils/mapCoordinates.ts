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

function parseHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

export function isBackendMapAssetUri(
  uri: string | null | undefined,
  apiBaseUrl: string,
): boolean {
  const trimmed = uri?.trim();
  if (!trimmed || trimmed.startsWith('pending://') || trimmed.startsWith('s3://') || trimmed.startsWith('//')) {
    return false;
  }
  const base = parseHttpUrl(apiBaseUrl);
  if (!base) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const parsed = parseHttpUrl(trimmed);
    return Boolean(parsed && parsed.origin === base.origin && parsed.pathname.startsWith('/map-assets/'));
  }
  try {
    const resolved = new URL(trimmed, `${base.origin}/`);
    return resolved.origin === base.origin;
  } catch {
    return false;
  }
}

function appendAccessToken(baseUrlWithoutToken: string, accessToken?: string | null): string {
  if (!accessToken) return baseUrlWithoutToken;
  return `${baseUrlWithoutToken}${baseUrlWithoutToken.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
}

/**
 * Map files need a signed-in user (POL-04) and an image request cannot carry the Authorization header on every
 * platform, so a same-origin backend asset gets the access token in the query (as SignalR does). External origins
 * never receive the bearer JWT.
 */
export function resolveMapPreviewUri(
  uri: string | null | undefined,
  apiBaseUrl: string,
  accessToken?: string | null,
): string | null {
  const trimmed = uri?.trim();
  if (!trimmed || trimmed.startsWith('pending://') || trimmed.startsWith('s3://') || trimmed.startsWith('//')) {
    return null;
  }
  const base = parseHttpUrl(apiBaseUrl);
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const parsed = parseHttpUrl(trimmed);
    if (!parsed) return null;
    if (!base || parsed.origin !== base.origin) {
      return trimmed;
    }
    if (!parsed.pathname.startsWith('/map-assets/')) {
      return trimmed;
    }
    parsed.searchParams.delete('access_token');
    return appendAccessToken(parsed.toString(), accessToken);
  }
  if (!base) return null;
  try {
    const rawUrl = `${apiBaseUrl.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`;
    const resolved = new URL(rawUrl);
    if (resolved.origin !== base.origin) return null;
    resolved.searchParams.delete('access_token');
    return appendAccessToken(resolved.toString(), accessToken);
  } catch {
    return null;
  }
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
