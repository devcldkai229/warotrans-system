import type { EndpointDto, ZoneDto } from '../api/navigationApi';
import type { StorageLocationListItem } from '../api/warehouseApi';

export interface PlaceArea { id: string; code: string; name: string }

export interface PlaceDirectory {
  /** Display name of an endpoint (by id or code): its storage location's name when it is a shelf, else its own name. */
  name(endpointIdOrCode: string | null | undefined, fallback?: string): string;
  /** The working areas (map zones `ZONE-AREA-*`) an endpoint lies in. */
  areasOf(endpointIdOrCode: string | null | undefined): PlaceArea[];
  areas: PlaceArea[];
  endpoints: EndpointDto[];
  locations: StorageLocationListItem[];
}

function inside(x: number, y: number, ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

/** A zone is a working area when the map editor named it so (`ZONE-AREA-…`); the other zones are traffic rules. */
export function isAreaZone(zone: Pick<ZoneDto, 'code'>): boolean {
  return /^ZONE-AREA-/i.test(zone.code);
}

export function buildPlaceDirectory(endpoints: EndpointDto[], locations: StorageLocationListItem[], zones: ZoneDto[] = []): PlaceDirectory {
  const byKey = new Map<string, EndpointDto>();
  for (const endpoint of endpoints) { byKey.set(endpoint.id, endpoint); byKey.set(endpoint.code, endpoint); }
  const locationByEndpoint = new Map<string, StorageLocationListItem>();
  for (const location of locations) {
    if (location.endpointId) locationByEndpoint.set(location.endpointId, location);
    if (location.endpointCode) locationByEndpoint.set(location.endpointCode, location);
  }
  const areaZones = zones.filter(zone => zone.isActive && isAreaZone(zone) && zone.geometry?.type === 'Polygon');
  const areas = areaZones.map(zone => ({ id: zone.id, code: zone.code, name: zone.name || zone.code }));
  const areaCache = new Map<string, PlaceArea[]>();
  return {
    areas,
    endpoints,
    locations,
    name(key, fallback = '—') {
      if (!key) return fallback;
      const endpoint = byKey.get(key);
      const location = locationByEndpoint.get(key) ?? (endpoint ? locationByEndpoint.get(endpoint.id) : undefined);
      return location?.name || endpoint?.name || key;
    },
    areasOf(key) {
      if (!key) return [];
      const endpoint = byKey.get(key);
      if (!endpoint) return [];
      const cached = areaCache.get(endpoint.id);
      if (cached) return cached;
      const found = areaZones.filter(zone => inside(endpoint.x, endpoint.y, zone.geometry.coordinates[0] ?? []))
        .map(zone => ({ id: zone.id, code: zone.code, name: zone.name || zone.code }));
      areaCache.set(endpoint.id, found);
      return found;
    },
  };
}

export const EMPTY_PLACE_DIRECTORY = buildPlaceDirectory([], []);
