import type { EndpointDto } from '../api/navigationApi';
import type { StorageLocationListItem } from '../api/warehouseApi';
import type { PlaceArea } from '../places/placeDirectory';
import type { RobotResponse, ShelfSlotOccupancy } from '../types/contracts';
import { endpointJobRole, type EndpointJobRole, type MapJobContext } from './mapLabels';
import { endpointVisualKind, type EndpointVisualKind } from './mapStyle';

export type EndpointActionKind =
  | 'view_shelf_stock'
  | 'move_from_shelf'
  | 'start_putaway'
  | 'start_outbound'
  | 'open_inbound_vouchers'
  | 'open_outbound_vouchers'
  | 'open_job'
  | 'view_robot'
  | 'localize_here';

export interface EndpointActionSpec {
  kind: EndpointActionKind;
  label: string;
  robotCode?: string;
}

export interface ShelfSlotSummary {
  total: number;
  occupied: number;
  reserved: number;
  available: number;
  occupiedBarcodes: string[];
  slots: ShelfSlotOccupancy[];
}

export interface EndpointInspectPermissions {
  canReadWarehouse: boolean;
  canCreateTransport: boolean;
  canReadVouchers: boolean;
  canLocalize: boolean;
  isTechnicalRole: boolean;
}

export interface EndpointInspectionModel {
  visualKind: EndpointVisualKind;
  kindLabel: string;
  displayName: string;
  code: string;
  areaNames: string[];
  jobRole: EndpointJobRole | null;
  storageLocation: StorageLocationListItem | null;
  shelfSummary: ShelfSlotSummary | null;
  robotHere: RobotResponse | null;
  showTechCoords: boolean;
  primaryAction: EndpointActionSpec | null;
  secondaryAction: EndpointActionSpec | null;
}

const KIND_LABELS: Record<EndpointVisualKind, string> = {
  SHELF: 'Shelf',
  INBOUND: 'Inbound Gate',
  OUTBOUND: 'Outbound Gate',
  CHARGER: 'Charging Station',
  INSPECTION: 'Inspection Point',
  PARK: 'Parking',
  WAIT: 'Wait Point',
  WAYPOINT: 'Waypoint',
};

/** Human-readable label for a map endpoint's operational role. */
export function endpointKindLabel(visualKind: EndpointVisualKind): string {
  return KIND_LABELS[visualKind] ?? 'Waypoint';
}

/** Finds the warehouse storage location bound to a map endpoint by id or code. */
export function findStorageLocationForEndpoint(
  endpoint: Pick<EndpointDto, 'id' | 'code'>,
  locations: readonly StorageLocationListItem[],
): StorageLocationListItem | null {
  const byId = locations.find(location => location.endpointId === endpoint.id);
  if (byId) return byId;
  const upperCode = endpoint.code.trim().toUpperCase();
  return (
    locations.find(
      location =>
        location.endpointCode?.trim().toUpperCase() === upperCode
        || location.code.trim().toUpperCase() === upperCode,
    ) ?? null
  );
}

/** Summarizes shelf level occupancy sorted from lowest level upwards. */
export function summarizeShelfSlots(
  location: Pick<StorageLocationListItem, 'shelfSlots'> | null | undefined,
): ShelfSlotSummary | null {
  if (!location?.shelfSlots?.length) return null;
  const slots = [...location.shelfSlots].sort((a, b) => a.levelNo - b.levelNo);
  let occupied = 0;
  let reserved = 0;
  let available = 0;
  const occupiedBarcodes: string[] = [];

  for (const slot of slots) {
    if (slot.status === 'OCCUPIED') {
      occupied += 1;
      if (slot.occupiedByBarcode) occupiedBarcodes.push(slot.occupiedByBarcode);
    } else if (slot.status === 'RESERVED') {
      reserved += 1;
    } else {
      available += 1;
    }
  }

  return {
    total: slots.length,
    occupied,
    reserved,
    available,
    occupiedBarcodes,
    slots,
  };
}

/** Finds the closest online robot currently standing at an endpoint within `maxDistanceMeters`. */
export function findRobotAtEndpoint(
  endpoint: Pick<EndpointDto, 'mapVersionId' | 'x' | 'y'>,
  robots: readonly RobotResponse[],
  maxDistanceMeters = 0.65,
): RobotResponse | null {
  let closest: RobotResponse | null = null;
  let bestDistSq = maxDistanceMeters * maxDistanceMeters;

  for (const robot of robots) {
    if (!robot.isOnline || robot.currentMapVersionId !== endpoint.mapVersionId) continue;
    if (!robot.lastTelemetryAt || !Number.isFinite(robot.poseX) || !Number.isFinite(robot.poseY)) continue;
    const dx = robot.poseX - endpoint.x;
    const dy = robot.poseY - endpoint.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      closest = robot;
    }
  }

  return closest;
}

/** Resolves contextual status, shelf/robot state, and restrained CTAs for a map endpoint card. */
export function resolveEndpointInspection({
  endpoint,
  robots,
  locations,
  areas,
  jobContext,
  permissions,
}: {
  endpoint: EndpointDto;
  robots: readonly RobotResponse[];
  locations: readonly StorageLocationListItem[];
  areas: readonly PlaceArea[];
  jobContext?: MapJobContext;
  permissions: EndpointInspectPermissions;
}): EndpointInspectionModel {
  const visualKind = endpointVisualKind(endpoint.endpointType, endpoint.code, endpoint.name);
  const kindLabel = endpointKindLabel(visualKind);
  const storageLocation = findStorageLocationForEndpoint(endpoint, locations);
  const shelfSummary = visualKind === 'SHELF' ? summarizeShelfSlots(storageLocation) : null;
  const robotHere = findRobotAtEndpoint(endpoint, robots);
  const jobRole = endpointJobRole(endpoint, jobContext);
  const displayName = storageLocation?.name || endpoint.name || endpoint.code;
  const areaNames = areas.map(area => area.name).filter(Boolean);

  let primaryAction: EndpointActionSpec | null = null;
  let secondaryAction: EndpointActionSpec | null = null;

  switch (visualKind) {
    case 'SHELF': {
      if (permissions.canReadWarehouse && storageLocation) {
        primaryAction = { kind: 'view_shelf_stock', label: 'View Shelf Stock' };
      }
      if (permissions.canCreateTransport && shelfSummary && shelfSummary.occupiedBarcodes.length > 0) {
        const moveAction: EndpointActionSpec = { kind: 'move_from_shelf', label: 'Move From Shelf' };
        if (primaryAction) secondaryAction = moveAction;
        else primaryAction = moveAction;
      }
      break;
    }
    case 'INBOUND': {
      if (permissions.canCreateTransport) {
        primaryAction = { kind: 'start_putaway', label: 'Start Putaway' };
      }
      if (permissions.canReadVouchers) {
        const voucherAction: EndpointActionSpec = { kind: 'open_inbound_vouchers', label: 'Inbound Vouchers' };
        if (primaryAction) secondaryAction = voucherAction;
        else primaryAction = voucherAction;
      }
      break;
    }
    case 'OUTBOUND': {
      if (permissions.canCreateTransport) {
        primaryAction = { kind: 'start_outbound', label: 'Start Outbound' };
      }
      if (permissions.canReadVouchers) {
        const voucherAction: EndpointActionSpec = { kind: 'open_outbound_vouchers', label: 'Outbound Vouchers' };
        if (primaryAction) secondaryAction = voucherAction;
        else primaryAction = voucherAction;
      }
      break;
    }
    case 'CHARGER':
    case 'PARK':
    case 'WAIT': {
      if (robotHere) {
        primaryAction = { kind: 'view_robot', label: 'View {code}', robotCode: robotHere.code };
      }
      if (permissions.canLocalize) {
        const localizeAction: EndpointActionSpec = { kind: 'localize_here', label: 'Localize Here' };
        if (primaryAction) secondaryAction = localizeAction;
        else primaryAction = localizeAction;
      }
      break;
    }
    case 'INSPECTION':
    case 'WAYPOINT':
    default: {
      if (jobRole && jobContext?.jobId) {
        primaryAction = { kind: 'open_job', label: 'Open Active Job' };
      } else if (robotHere) {
        primaryAction = { kind: 'view_robot', label: 'View {code}', robotCode: robotHere.code };
      }
      break;
    }
  }

  return {
    visualKind,
    kindLabel,
    displayName,
    code: endpoint.code,
    areaNames,
    jobRole,
    storageLocation,
    shelfSummary,
    robotHere,
    showTechCoords: permissions.isTechnicalRole,
    primaryAction,
    secondaryAction,
  };
}
