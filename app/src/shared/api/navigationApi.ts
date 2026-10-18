import { apiFetch, ApiError, getApiBaseUrl } from './client';
import type { MapStatus, EndpointType, ZoneType } from '../types/contracts';
type EdgeDirection = 'ONE_WAY' | 'BIDIRECTIONAL';
export interface GeoJsonLineString { type: 'LineString'; coordinates: number[][] }
export interface GeoJsonPolygon { type: 'Polygon'; coordinates: number[][][] }
export interface MapVersionDto {
  id: string
  warehouseId: string
  code: string
  versionNo: number
  name: string
  status: MapStatus | string
  mapUri: string
  mapYamlUri: string | null
  previewImageUri: string | null
  frameId: string
  imageWidthPixels: number
  imageHeightPixels: number
  resolution: number
  originX: number
  originY: number
  originYaw: number
  negate: boolean
  occupiedThreshold: number
  freeThreshold: number
  contentHash: string | null
  createdAt: string
  publishedAt: string | null
}

export interface EndpointDto {
  id: string
  mapVersionId: string
  code: string
  name: string
  endpointType: EndpointType | string
  x: number
  y: number
  yaw: number
  positionTolerance: number
  yawTolerance: number
  isEnabled: boolean
}

export interface EdgeDto {
  id: string
  mapVersionId: string
  code: string
  geometry: GeoJsonLineString
  widthMeters: number
  direction: EdgeDirection | string
  capacity: number
  maxSpeed: number | null
  isActive: boolean
}

export interface ZoneDto {
  id: string
  mapVersionId: string
  code: string
  name: string
  zoneType: ZoneType | string
  geometry: GeoJsonPolygon
  capacity: number
  maxSpeed: number | null
  isActive: boolean
  policy: Record<string, unknown> | null
  policySchemaVersion: number
}

export interface MapVersionDetailDto extends MapVersionDto {
  endpoints: EndpointDto[]
  edges: EdgeDto[]
  zones: ZoneDto[]
}

export function listMapVersionsForWarehouse(warehouseId: string) {
  return apiFetch<MapVersionDto[]>(`/api/navigation/warehouses/${warehouseId}/maps`)
}

export function getMapVersion(id: string) {
  return apiFetch<MapVersionDto>(`/api/navigation/maps/${id}`)
}

export function getMapVersionDetail(id: string) {
  return apiFetch<MapVersionDetailDto>(`/api/navigation/maps/${id}/detail`)
}

export async function getActiveMapVersion(warehouseId: string): Promise<MapVersionDto | null> {
  try {
    return await apiFetch<MapVersionDto>(`/api/navigation/warehouses/${warehouseId}/active-map`)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.code === 'active_map_not_found')) {
      return null
    }
    throw err
  }
}

export function resolveMapAssetUrl(uri: string | null | undefined): string | null {
  if (!uri || uri.startsWith('pending://')) return null;
  if (/^https?:\/\//.test(uri)) return uri;
  if (/^[a-z]+:\/\//.test(uri)) return null;
  return `${getApiBaseUrl()}${uri.startsWith('/') ? uri : `/${uri}`}`;
}
