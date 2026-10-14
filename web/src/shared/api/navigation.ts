import { apiFetch, apiRequest } from './client'
import type {
  EdgeDirection,
  EndpointType,
  GeoJsonLineString,
  GeoJsonPolygon,
  MapStatus,
  ZoneType,
} from './contracts'

export type { GeoJsonLineString, GeoJsonPolygon }

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

export function publishMapVersion(id: string) {
  return apiRequest<MapVersionDto>(`/api/navigation/maps/${id}/publish`, { method: 'POST' })
}

export function archiveMapVersion(id: string) {
  return apiRequest<MapVersionDto>(`/api/navigation/maps/${id}/archive`, { method: 'POST' })
}

export function importMapVersion(warehouseId: string, yaml: File, pgm: File, name?: string) {
  const form = new FormData()
  form.append('yaml', yaml)
  form.append('pgm', pgm)
  if (name?.trim()) form.append('name', name.trim())
  return apiRequest<MapVersionDto>(`/api/navigation/warehouses/${warehouseId}/maps/import`, {
    method: 'POST',
    body: form,
  })
}

export function listEndpoints(mapVersionId: string) {
  return apiFetch<EndpointDto[]>(`/api/navigation/maps/${mapVersionId}/endpoints`)
}

export function deleteEndpoint(id: string) {
  return apiRequest<void>(`/api/navigation/endpoints/${id}`, { method: 'DELETE' })
}

export function listEdges(mapVersionId: string) {
  return apiFetch<EdgeDto[]>(`/api/navigation/maps/${mapVersionId}/edges`)
}

export function listZones(mapVersionId: string) {
  return apiFetch<ZoneDto[]>(`/api/navigation/maps/${mapVersionId}/zones`)
}

/** Fetch bundled sample ROS map for DEV import (same files Admin would upload). */
export async function fetchSampleMapFiles(): Promise<{ yaml: File; pgm: File }> {
  const [yamlRes, pgmRes] = await Promise.all([
    fetch('/test-maps/sample/map.yaml'),
    fetch('/test-maps/sample/map.pgm'),
  ])
  if (!yamlRes.ok || !pgmRes.ok) {
    throw new Error('Sample map fixture not found at /test-maps/sample/.')
  }
  const yamlBlob = await yamlRes.blob()
  const pgmBlob = await pgmRes.blob()
  return {
    yaml: new File([yamlBlob], 'map.yaml', { type: 'text/yaml' }),
    pgm: new File([pgmBlob], 'map.pgm', { type: 'application/octet-stream' }),
  }
}

export function createEndpoint(
  mapVersionId: string,
  body: {
    name: string
    endpointType: string
    x: number
    y: number
    yaw: number
    positionTolerance: number
    yawTolerance: number
    code?: string
  },
) {
  return apiRequest<EndpointDto>(`/api/navigation/maps/${mapVersionId}/endpoints`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateEndpoint(
  id: string,
  body: {
    name: string
    endpointType: string
    x: number
    y: number
    yaw: number
    positionTolerance: number
    yawTolerance: number
    isEnabled: boolean
  },
) {
  return apiRequest<EndpointDto>(`/api/navigation/endpoints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function createEdge(
  mapVersionId: string,
  body: {
    geometry: GeoJsonLineString
    widthMeters: number
    direction: string
    capacity: number
    maxSpeed?: number | null
    isActive?: boolean
  },
) {
  return apiRequest<EdgeDto>(`/api/navigation/maps/${mapVersionId}/edges`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateEdge(
  id: string,
  body: {
    geometry: GeoJsonLineString
    widthMeters: number
    direction: string
    capacity: number
    maxSpeed?: number | null
    isActive: boolean
  },
) {
  return apiRequest<EdgeDto>(`/api/navigation/edges/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteEdge(id: string) {
  return apiRequest<void>(`/api/navigation/edges/${id}`, { method: 'DELETE' })
}

export function createZone(
  mapVersionId: string,
  body: {
    name: string
    zoneType: string
    geometry: GeoJsonPolygon
    capacity: number
    maxSpeed?: number | null
    isActive?: boolean
    code?: string
    policy?: Record<string, unknown> | null
    policySchemaVersion?: number
  },
) {
  return apiRequest<ZoneDto>(`/api/navigation/maps/${mapVersionId}/zones`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateZone(
  id: string,
  body: {
    name: string
    zoneType: string
    geometry: GeoJsonPolygon
    capacity: number
    maxSpeed?: number | null
    isActive: boolean
    policy?: Record<string, unknown> | null
    policySchemaVersion?: number
  },
) {
  return apiRequest<ZoneDto>(`/api/navigation/zones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteZone(id: string) {
  return apiRequest<void>(`/api/navigation/zones/${id}`, { method: 'DELETE' })
}

/** Resolve a public map-asset path against the API origin when needed. */
export function resolveMapAssetUrl(uri: string | null | undefined): string | null {
  if (!uri) return null
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri
  const path = uri.startsWith('/') ? uri : `/${uri}`
  // Empty VITE_API_URL → same-origin (Vite proxies /map-assets in dev).
  const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  return apiUrl ? `${apiUrl}${path}` : path
}
