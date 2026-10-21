import { apiFetch, ApiError } from './client';
import type { MapStatus, EndpointType } from '../types/contracts';

export interface MapVersionDto {
  id: string;
  warehouseId: string;
  code: string;
  versionNo: number;
  name: string;
  status: MapStatus | string;
  mapUri: string;
  previewImageUri?: string | null;
  imageWidthPixels: number;
  imageHeightPixels: number;
  resolution: number;
  originX: number;
  originY: number;
  originYaw: number;
  frameId: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface EndpointDto {
  id: string;
  mapVersionId: string;
  code: string;
  name: string;
  endpointType: EndpointType | string;
  x: number;
  y: number;
  yaw: number;
  isEnabled: boolean;
}

export interface MapVersionDetailDto extends MapVersionDto {
  endpoints: EndpointDto[];
  edges?: { id: string; isActive: boolean; geometry: { type: string; coordinates: number[][] } }[];
}

export function listMapVersionsForWarehouse(warehouseId: string) {
  return apiFetch<MapVersionDto[]>(`/api/navigation/warehouses/${warehouseId}/maps`);
}

export function getMapVersionDetail(id: string) {
  return apiFetch<MapVersionDetailDto>(`/api/navigation/maps/${id}/detail`);
}

export async function getActiveMapVersion(warehouseId: string): Promise<MapVersionDto | null> {
  try {
    return await apiFetch<MapVersionDto>(`/api/navigation/warehouses/${warehouseId}/active-map`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.code === 'active_map_not_found')) {
      return null;
    }
    throw err;
  }
}
