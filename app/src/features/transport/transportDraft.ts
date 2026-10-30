import type { ContainerListItem, StorageLocationListItem } from '../../shared/api/warehouseApi';
import type { EndpointDto } from '../../shared/api/navigationApi';
import type { CreateTransportRequestDetailBody, TransportRequestListItem } from '../../shared/api/transportApi';
import type { RequestInputField } from '../../shared/api/workflowApi';

export class DraftInputError extends Error {}

export type TransportFlow = 'inbound' | 'outbound' | 'storage' | 'direct' | 'unsupported';
export interface TransportPlace { id: string; endpointId: string; label: string; code: string; locationId: string | null }

export function transportFlow(code: string): TransportFlow {
  if (code === 'INBOUND_PUTAWAY') return 'inbound';
  if (code === 'OUTBOUND_RETRIEVAL') return 'outbound';
  if (code === 'INTERNAL_RELOCATION') return 'storage';
  if (code === 'POINT_TO_POINT_TRANSPORT') return 'direct';
  return 'unsupported';
}

export function mappedLocations(locations: StorageLocationListItem[], endpoints: EndpointDto[], warehouseId: string, mapId: string) {
  return locations.filter(location => location.isActive && location.warehouseId === warehouseId
    && endpoints.some(endpoint => endpoint.id === location.endpointId && endpoint.mapVersionId === mapId && endpoint.isEnabled));
}

// Station code hints select a visible working point, never a Container's physical location.
// BE must eventually supply explicit workflow defaults and allowed-target metadata.
export function stationPoints(endpoints: EndpointDto[], mapId: string, kind: 'INBOUND' | 'OUTBOUND'): TransportPlace[] {
  const station = new RegExp(`(^|[-_ ])${kind}($|[-_ ])`, 'i');
  return endpoints.filter(endpoint => endpoint.mapVersionId === mapId && endpoint.isEnabled
    && endpoint.endpointType === 'WAYPOINT' && station.test(endpoint.code)).map(endpoint => ({
      id: endpoint.id, endpointId: endpoint.id, label: endpoint.name || endpoint.code, code: endpoint.code, locationId: null,
    }));
}

export function containerOrigin(container: ContainerListItem, locations: StorageLocationListItem[], endpoints: EndpointDto[], mapId: string): TransportPlace | null {
  // A non-null but unavailable location must never fall back to an unrelated endpoint.
  const location = container.currentStorageLocationId ? locations.find(item => item.id === container.currentStorageLocationId) : null;
  if (container.currentStorageLocationId && !location) return null;
  if (location && container.currentEndpointId && location.endpointId !== container.currentEndpointId) return null;
  const endpoint = endpoints.find(item => item.id === (location?.endpointId || container.currentEndpointId)
    && item.mapVersionId === mapId && item.isEnabled);
  if (!endpoint) return null;
  return { id: location?.id || endpoint.id, endpointId: endpoint.id, label: location?.name || endpoint.name,
    code: location?.code || endpoint.code, locationId: location?.id || null };
}

export function transportDestinations(flow: TransportFlow, locations: StorageLocationListItem[], endpoints: EndpointDto[], mapId: string): TransportPlace[] {
  if (flow === 'outbound') return stationPoints(endpoints, mapId, 'OUTBOUND');
  if (flow === 'inbound' || flow === 'storage') {
    return locations.filter(location => endpoints.some(endpoint => endpoint.id === location.endpointId
      && endpoint.mapVersionId === mapId && endpoint.isEnabled && endpoint.endpointType === 'WAYPOINT'
      && !/(^|[-_ ])(INBOUND|OUTBOUND|INSPECTION|CHARGER|PARK)($|[-_ ])/i.test(endpoint.code)))
      .map(location => ({ id: location.id, endpointId: location.endpointId, label: location.name, code: location.code, locationId: location.id }));
  }
  if (flow === 'direct') return endpoints.filter(endpoint => endpoint.isEnabled && endpoint.mapVersionId === mapId && endpoint.endpointType === 'WAYPOINT')
    .map(endpoint => ({ id: endpoint.id, endpointId: endpoint.id, label: endpoint.name, code: endpoint.code, locationId: null }));
  return [];
}

export function activeContainerIds(requests: TransportRequestListItem[]): Set<string> {
  // Matches the BE detail-level conflict check, including stale parent aggregates.
  return new Set(requests.flatMap(request => request.details.filter(detail =>
    ['PENDING', 'QUEUED', 'IN_PROGRESS'].includes(detail.status)).map(detail => detail.containerId)));
}

export function containerReadiness(container: ContainerListItem, flow: TransportFlow, origin: TransportPlace | null, held: Set<string>, receivingIds: string[]): string | null {
  if (held.has(container.id)) return 'Already In A Request';
  if (!['CREATED', 'PACKED', 'STORED'].includes(container.status)) return 'Not Ready For Transport';
  if (!origin) return container.currentStorageLocationId || container.currentEndpointId ? 'Location Unavailable On This Map' : 'Location Required';
  if (flow === 'unsupported') return 'Routing Setup Required';
  if (flow === 'inbound' && !receivingIds.includes(origin.endpointId)) return 'At Another Location';
  if ((flow === 'storage' || flow === 'outbound') && container.status !== 'STORED') return 'Not Stored';
  if ((flow === 'storage' || flow === 'outbound') && !origin.locationId) return 'Storage Location Required';
  return null;
}

export function validateMovementFields(fields: RequestInputField[], details: CreateTransportRequestDetailBody[]) {
  for (const detail of details) {
    const values: Record<string, unknown> = { containerId: detail.containerId, 'source.endpointId': detail.sourceEndpointId,
      'source.storageLocationId': detail.sourceStorageLocationId, 'source.levelNo': detail.sourceLevelNo,
      'destination.endpointId': detail.destinationEndpointId, 'destination.storageLocationId': detail.destinationStorageLocationId,
      'destination.levelNo': detail.destinationLevelNo };
    for (const field of fields) {
      if (field.required && (values[field.key] === null || values[field.key] === undefined || values[field.key] === '')) {
        throw new DraftInputError(`${field.label || field.key} is required by this workflow. Its location data is not available; ask the supervisor to complete the setup.`);
      }
    }
  }
}

export function movementDetail(container: ContainerListItem, source: TransportPlace | null, destination: TransportPlace | undefined, sequenceNo: number): CreateTransportRequestDetailBody {
  if (!source) throw new DraftInputError(`Receive ${container.barcode} at a known location before requesting transport.`);
  if (!destination) throw new DraftInputError(`Choose a destination for ${container.barcode}.`);
  if (source.endpointId === destination.endpointId) throw new DraftInputError(`Choose a different destination for ${container.barcode}.`);
  return { sequenceNo, containerId: container.id, sourceStorageLocationId: source.locationId,
    sourceEndpointId: source.endpointId, sourceLevelNo: source.locationId ? container.currentLevelNo : null,
    destinationStorageLocationId: destination.locationId, destinationEndpointId: destination.endpointId,
    destinationLevelNo: null };
}
