import type { Edge, EdgeDirection, Endpoint, EndpointType, Zone, ZoneType } from '@/shared/api/contracts'
import {
  resolveMapAssetUrl,
  type EdgeDto,
  type EndpointDto,
  type MapVersionDetailDto,
  type ZoneDto,
} from '@/shared/api/navigation'
import { boundsFromMapMeta } from '@/shared/map/mapBounds'
import type { MapBounds } from '@/shared/lib/mapView'

export function toEndpoint(e: EndpointDto): Endpoint {
  return {
    id: e.id,
    mapVersionId: e.mapVersionId,
    code: e.code,
    name: e.name,
    endpointType: e.endpointType as EndpointType,
    x: e.x,
    y: e.y,
    yaw: e.yaw,
    positionTolerance: e.positionTolerance,
    yawTolerance: e.yawTolerance,
    isEnabled: e.isEnabled,
  }
}

export function toEdge(e: EdgeDto): Edge {
  return {
    id: e.id,
    mapVersionId: e.mapVersionId,
    code: e.code,
    geometry: e.geometry,
    widthMeters: e.widthMeters,
    direction: e.direction as EdgeDirection,
    capacity: e.capacity,
    maxSpeed: e.maxSpeed,
    isActive: e.isActive,
  }
}

export function toZone(z: ZoneDto): Zone {
  return {
    id: z.id,
    mapVersionId: z.mapVersionId,
    code: z.code,
    name: z.name,
    zoneType: z.zoneType as ZoneType,
    geometry: z.geometry,
    capacity: z.capacity,
    maxSpeed: z.maxSpeed,
    isActive: z.isActive,
    policy: z.policy,
    policySchemaVersion: z.policySchemaVersion,
  }
}

export interface MapVersionGeometry {
  endpoints: Endpoint[]
  edges: Edge[]
  zones: Zone[]
  bounds: MapBounds | undefined
  occupancyImageUrl: string | null
}

/** Empty geometry so WarehouseMap does not fall back to the mock SCENE. */
export const EMPTY_MAP_GEOMETRY: MapVersionGeometry = {
  endpoints: [],
  edges: [],
  zones: [],
  bounds: undefined,
  occupancyImageUrl: null,
}

export function mapDetailToGeometry(detail: MapVersionDetailDto | null | undefined): MapVersionGeometry {
  if (!detail) return EMPTY_MAP_GEOMETRY

  const bounds =
    detail.imageWidthPixels > 0 && detail.imageHeightPixels > 0
      ? boundsFromMapMeta({
          resolution: detail.resolution,
          originX: detail.originX,
          originY: detail.originY,
          originYaw: detail.originYaw,
          imageWidthPixels: detail.imageWidthPixels,
          imageHeightPixels: detail.imageHeightPixels,
        })
      : undefined

  return {
    endpoints: (detail.endpoints ?? []).map(toEndpoint),
    edges: (detail.edges ?? []).map(toEdge),
    zones: (detail.zones ?? []).map(toZone),
    bounds,
    occupancyImageUrl: resolveMapAssetUrl(detail.previewImageUri),
  }
}
