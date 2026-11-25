import type { EndpointDto } from '../../shared/api/navigationApi';
import type { ContainerListItem, StorageLocationListItem } from '../../shared/api/warehouseApi';
import type { CreateTransportRequestDetailBody } from '../../shared/api/transportApi';

/** What the chosen workflow does with containers (web: composer/types.ts workflowKindOf). */
export type WorkflowKind = 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'OTHER';

export function workflowKindOf(code: string | null | undefined): WorkflowKind {
  const value = (code ?? '').toUpperCase();
  if (value === 'INBOUND' || value.startsWith('INBOUND_')) return 'INBOUND';
  if (value === 'OUTBOUND' || value.startsWith('OUTBOUND_')) return 'OUTBOUND';
  if (value.startsWith('INTERNAL')) return 'INTERNAL';
  return 'OTHER';
}

/** A place a container moves from or to: a storage location (shelf) or a bare endpoint. */
export interface ComposerPlace {
  key: string;
  endpointId: string;
  storageLocationId: string | null;
  name: string;
  code: string;
  kind: 'location' | 'endpoint';
}

export interface ComposerContext {
  endpoints: EndpointDto[];
  locations: StorageLocationListItem[];
  mapId: string;
}

const onShelf = (container: ContainerListItem) => container.status === 'STORED' && !!container.currentStorageLocationId;

/**
 * Whether the workflow can move this container, matching the backend's CreateTransportRequest rules:
 * INBOUND takes a container not on a shelf yet that is on a confirmed receiving voucher; OUTBOUND takes a container
 * still on its shelf that is on a confirmed shipping voucher (the voucher says which boxes leave); INTERNAL takes a
 * container on a shelf. Null when it can, else the reason.
 */
export function ineligibleReason(container: ContainerListItem, kind: WorkflowKind, held: Set<string>): string | null {
  if (held.has(container.id) || container.inActiveTransport) return 'Already in a transport request';
  const voucher = container.voucher;
  switch (kind) {
    case 'INBOUND':
      if (onShelf(container)) return 'Already on a shelf';
      if (!(voucher?.type === 'INBOUND' && voucher.status === 'CONFIRMED')) return 'Not on a confirmed receiving voucher';
      return null;
    case 'OUTBOUND':
      if (!onShelf(container)) return 'Not on a shelf';
      if (!(voucher?.type === 'OUTBOUND' && voucher.status === 'CONFIRMED')) return 'Not on a confirmed shipping voucher';
      return null;
    case 'INTERNAL':
      return onShelf(container) ? null : 'Not on a shelf';
    default:
      return ['CREATED', 'PACKED', 'STORED'].includes(container.status) ? null : 'Not ready for transport';
  }
}

export interface ContainerGroup {
  key: string;
  title: string;
  subtitle: string | null;
  /** A confirmed voucher of the workflow's type: "select the whole voucher" applies. */
  voucher: boolean;
  items: ContainerListItem[];
}

/**
 * INBOUND / OUTBOUND: one group per confirmed voucher of that kind, newest first, then the rest.
 * INTERNAL: one group per shelf (by its name). Other workflows: one group.
 */
export function groupContainers(containers: ContainerListItem[], kind: WorkflowKind, locationName: (id: string | null) => string): ContainerGroup[] {
  if (kind === 'INBOUND' || kind === 'OUTBOUND') {
    const byVoucher = new Map<string, { at: string; group: ContainerGroup }>();
    const rest: ContainerListItem[] = [];
    for (const item of containers) {
      const voucher = item.voucher;
      if (voucher && voucher.type === kind && voucher.status === 'CONFIRMED') {
        const entry = byVoucher.get(voucher.id) ?? {
          at: voucher.confirmedAt ?? voucher.createdAt,
          group: { key: voucher.id, title: voucher.code, subtitle: kind === 'INBOUND' ? 'Receiving voucher' : 'Shipping voucher', voucher: true, items: [] },
        };
        entry.group.items.push(item);
        byVoucher.set(voucher.id, entry);
      } else {
        rest.push(item);
      }
    }
    const groups = [...byVoucher.values()].sort((a, b) => b.at.localeCompare(a.at)).map(entry => entry.group);
    return rest.length ? [...groups, { key: 'other', title: 'Other containers', subtitle: null, voucher: false, items: rest }] : groups;
  }
  if (kind === 'INTERNAL') {
    const byShelf = new Map<string, ContainerGroup>();
    for (const item of containers) {
      const key = item.currentStorageLocationId ?? 'none';
      const group = byShelf.get(key) ?? { key, title: key === 'none' ? 'Not on a shelf' : locationName(key), subtitle: 'Shelf', voucher: false, items: [] };
      group.items.push(item);
      byShelf.set(key, group);
    }
    return [...byShelf.values()].sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.title.localeCompare(b.title)));
  }
  return containers.length ? [{ key: 'all', title: 'Containers', subtitle: null, voucher: false, items: containers }] : [];
}

const SERVICE_POINT = /(^|[-_ ])(CHARGE|CHARGER|PARK|PARKING|QUEUE|WAIT)($|[-_ ])/i;
const INBOUND_GATE = /(^|[-_ ])INBOUND($|[-_ ])/i;
const OUTBOUND_GATE = /(^|[-_ ])OUTBOUND($|[-_ ])/i;

function isGateEndpoint(endpoint: Pick<EndpointDto, 'code' | 'endpointType'>): boolean {
  return endpoint.endpointType === 'WAYPOINT'
    && (INBOUND_GATE.test(endpoint.code) || OUTBOUND_GATE.test(endpoint.code));
}

/** Every place a movement may use: shelves (excluding gates with legacy StorageLocations) first, then enabled stations. */
export function composerPlaces(ctx: ComposerContext): ComposerPlace[] {
  const enabled = ctx.endpoints.filter(endpoint => endpoint.mapVersionId === ctx.mapId && endpoint.isEnabled);
  const enabledById = new Map(enabled.map(endpoint => [endpoint.id, endpoint]));
  const shelfEndpoints = new Set<string>();
  const locations: ComposerPlace[] = [];
  for (const location of ctx.locations) {
    if (!location.isActive) continue;
    const endpoint = enabledById.get(location.endpointId);
    if (!endpoint || isGateEndpoint(endpoint)) continue;
    shelfEndpoints.add(location.endpointId);
    locations.push({ key: `L:${location.id}`, endpointId: location.endpointId, storageLocationId: location.id,
      name: location.name || location.code, code: location.code, kind: 'location' });
  }
  const stations = enabled
    .filter(endpoint => !shelfEndpoints.has(endpoint.id) && endpoint.endpointType === 'WAYPOINT' && !SERVICE_POINT.test(endpoint.code))
    .map<ComposerPlace>(endpoint => ({ key: `E:${endpoint.id}`, endpointId: endpoint.id, storageLocationId: null,
      name: endpoint.name || endpoint.code, code: endpoint.code, kind: 'endpoint' }));
  const byName = (a: ComposerPlace, b: ComposerPlace) => a.name.localeCompare(b.name, undefined, { numeric: true });
  return [...locations.sort(byName), ...stations.sort(byName)];
}

/** The place an endpoint stands for (its shelf when it has one). */
export function placeForEndpoint(places: ComposerPlace[], endpointId: string): ComposerPlace | null {
  return places.find(place => place.endpointId === endpointId && place.kind === 'location')
    ?? places.find(place => place.endpointId === endpointId) ?? null;
}

const stationNamed = (places: ComposerPlace[], word: 'INBOUND' | 'OUTBOUND') => {
  const pattern = new RegExp(`(^|[-_ ])${word}($|[-_ ])`, 'i');
  return places.filter(place => place.kind === 'endpoint' && pattern.test(place.code));
};

export function inboundGates(places: ComposerPlace[]): ComposerPlace[] {
  return stationNamed(places, 'INBOUND');
}

export function outboundGates(places: ComposerPlace[]): ComposerPlace[] {
  return stationNamed(places, 'OUTBOUND');
}

/** Where the container is now; an inbound container not placed yet starts at the receiving point when there is one. */
export function defaultSource(container: ContainerListItem, kind: WorkflowKind, places: ComposerPlace[]): ComposerPlace | null {
  if (container.status === 'STORED' && container.currentStorageLocationId) {
    return places.find(place => place.storageLocationId === container.currentStorageLocationId) ?? null;
  }
  if (container.currentStorageLocationId) {
    const shelf = places.find(place => place.storageLocationId === container.currentStorageLocationId);
    if (shelf) return shelf;
  }
  if (container.currentEndpointId) {
    const at = placeForEndpoint(places, container.currentEndpointId);
    if (at) return at;
  }
  if (kind === 'INBOUND') {
    const receiving = stationNamed(places, 'INBOUND');
    return receiving.length === 1 ? receiving[0] : null;
  }
  return null;
}

/** An outbound trip ends at the shipping point when the map has exactly one. */
export function defaultDestination(kind: WorkflowKind, places: ComposerPlace[]): ComposerPlace | null {
  if (kind !== 'OUTBOUND') return null;
  const gates = stationNamed(places, 'OUTBOUND');
  return gates.length === 1 ? gates[0] : null;
}

/** Places offered first for each end of the trip (the rest stay available under "All places"). */
export function suggestedPlaces(kind: WorkflowKind, end: 'source' | 'destination', places: ComposerPlace[]): ComposerPlace[] {
  if (kind === 'INBOUND') return end === 'source' ? stationNamed(places, 'INBOUND') : places.filter(place => place.kind === 'location');
  if (kind === 'OUTBOUND') return end === 'source' ? places.filter(place => place.kind === 'location') : stationNamed(places, 'OUTBOUND');
  if (kind === 'INTERNAL') return places.filter(place => place.kind === 'location');
  return places;
}

/** Places allowed by the backend for this workflow end (Putaway: Inbound gates -> shelves; Outbound: shelves -> Outbound gates; Internal: shelves -> shelves). */
export function allowedPlaces(kind: WorkflowKind, end: 'source' | 'destination', places: ComposerPlace[]): ComposerPlace[] {
  if (kind === 'INBOUND') return end === 'source' ? stationNamed(places, 'INBOUND') : places.filter(place => place.kind === 'location');
  if (kind === 'OUTBOUND') return end === 'source' ? places.filter(place => place.kind === 'location') : stationNamed(places, 'OUTBOUND');
  if (kind === 'INTERNAL') return places.filter(place => place.kind === 'location');
  return places;
}

export function searchPlaces(places: ComposerPlace[], query: string): ComposerPlace[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return places;
  return places.filter(place => place.name.toLowerCase().includes(needle) || place.code.toLowerCase().includes(needle));
}

export interface Movement { source: ComposerPlace | null; destination: ComposerPlace | null }

export function movementProblem(movement: Movement | undefined): string | null {
  if (!movement?.source) return 'Choose where to pick it up';
  if (!movement.destination) return 'Choose where to deliver it';
  if (movement.source.endpointId === movement.destination.endpointId) return 'Pick-up and delivery must differ';
  return null;
}

export function outboundMovementProblem(movement: Movement | undefined, hasGates: boolean): string | null {
  if (!movement?.source) return 'Location Unavailable On This Map';
  if (!movement.destination) return hasGates ? 'Choose an outbound gate' : 'No outbound point is configured on this map.';
  if (movement.source.endpointId === movement.destination.endpointId) return 'Pick-up and delivery must differ';
  return null;
}

/** Request details in selection order; throws the first problem with the container's barcode. */
export function buildDetails(selected: ContainerListItem[], movements: Record<string, Movement>): CreateTransportRequestDetailBody[] {
  return selected.map((container, index) => {
    const movement = movements[container.id];
    const problem = movementProblem(movement);
    if (problem) throw new Error(`${container.barcode}: ${problem}.`);
    const { source, destination } = movement as { source: ComposerPlace; destination: ComposerPlace };
    return {
      sequenceNo: index + 1,
      containerId: container.id,
      sourceStorageLocationId: source.storageLocationId,
      sourceEndpointId: source.endpointId,
      sourceLevelNo: source.storageLocationId && source.storageLocationId === container.currentStorageLocationId ? container.currentLevelNo : null,
      destinationStorageLocationId: destination.storageLocationId,
      destinationEndpointId: destination.endpointId,
      destinationLevelNo: null,
    };
  });
}
