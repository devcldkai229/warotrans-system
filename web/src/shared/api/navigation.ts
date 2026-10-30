import { ApiError, apiFetch, apiRequest } from './client'
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
  /** Set when this version was cloned from another one (POST /maps/{id}/clone). */
  sourceMapVersionId?: string | null
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
  name: string
  geometry: GeoJsonLineString
  widthMeters: number
  direction: EdgeDirection | string
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
  maxSpeed: number | null
  isActive: boolean
  policy: Record<string, unknown> | null
  policySchemaVersion: number
}

export interface MapVersionDetailDto extends MapVersionDto {
  endpoints: EndpointDto[]
  edges: EdgeDto[]
  zones: ZoneDto[]
  sourceMapVersionCode?: string | null
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

export function createMapVersion(
  warehouseId: string,
  body: {
    name: string
    resolution: number
    originX: number
    originY: number
    originYaw: number
    mapUri?: string | null
    mapYamlUri?: string | null
    previewImageUri?: string | null
    frameId?: string | null
  },
) {
  return apiRequest<MapVersionDto>(`/api/navigation/warehouses/${warehouseId}/maps`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateMapVersion(
  id: string,
  body: {
    name: string
    mapUri: string
    resolution: number
    originX: number
    originY: number
    originYaw: number
    mapYamlUri?: string | null
    previewImageUri?: string | null
    frameId?: string | null
    imageWidthPixels?: number | null
    imageHeightPixels?: number | null
    negate?: boolean | null
    occupiedThreshold?: number | null
    freeThreshold?: number | null
    contentHash?: string | null
  },
) {
  return apiRequest<MapVersionDto>(`/api/navigation/maps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function publishMapVersion(id: string) {
  return apiRequest<MapVersionDto>(`/api/navigation/maps/${id}/publish`, { method: 'POST' })
}

/** Download Nav2 route-graph GeoJSON for a map (used after publish to rebuild Gazebo / Nav2). */
export async function downloadRouteGraphGeoJson(mapVersionId: string, fileName?: string) {
  const data = await apiFetch<unknown>(`/api/navigation/maps/${mapVersionId}/route-graph`)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName ?? `route-graph-${mapVersionId}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Copies a map version (published, archived or draft) into a new editable DRAFT: same image, copies of its
 * endpoints / zones / edges (new ids, codes from the system generator). Publishing the copy moves storage locations.
 */
export function cloneMapVersion(id: string, name?: string) {
  return apiRequest<MapVersionDto>(`/api/navigation/maps/${id}/clone`, {
    method: 'POST',
    body: JSON.stringify({ name: name?.trim() || null }),
  })
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
    name: string
    geometry: GeoJsonLineString
    widthMeters: number
    direction: string
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
    name: string
    geometry: GeoJsonLineString
    widthMeters: number
    direction: string
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
    maxSpeed?: number | null
    isActive?: boolean
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
  if (uri.startsWith('pending://')) return null
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('s3://')) return uri
  const path = uri.startsWith('/') ? uri : `/${uri}`
  // Empty VITE_API_URL → same-origin (Vite proxies /map-assets in dev).
  const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  return apiUrl ? `${apiUrl}${path}` : path
}
