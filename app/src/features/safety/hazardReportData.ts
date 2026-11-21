import type { HazardType, IssueSeverity } from '../../shared/types/contracts';

export type HazardLocationKind = 'edge' | 'zone' | 'endpoint';

export interface HazardLocationOption {
  id: string;
  code: string;
  label: string;
  subtitle?: string;
}

export interface HazardMapLocationsInput {
  id: string;
  edges?: { id: string; mapVersionId: string; code: string; direction?: string; isActive: boolean }[];
  zones?: { id: string; mapVersionId: string; code: string; name: string; zoneType?: string; isActive: boolean }[];
  endpoints?: { id: string; mapVersionId: string; code: string; name: string; endpointType?: string; isEnabled: boolean }[];
}

export const HAZARD_TYPE_OPTIONS: ReadonlyArray<{ value: HazardType; label: string; desc: string }> = [
  { value: 'LIQUID_SPILL', label: 'Liquid Spill', desc: 'Wet or slippery floor surface' },
  { value: 'FALLEN_CARGO', label: 'Fallen Cargo', desc: 'Pallet, container, or physical obstruction' },
  { value: 'FACILITY_WORK', label: 'Facility Work', desc: 'Repairs, electrical, or maintenance work' },
  { value: 'FORKLIFT_TRAFFIC', label: 'Forklift Traffic', desc: 'Manual forklift or aisle congestion' },
  { value: 'OTHER', label: 'Other Hazard', desc: 'Other floor safety condition' },
];

export const HAZARD_SEVERITY_OPTIONS: ReadonlyArray<{ value: IssueSeverity; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export function hazardTypeLabel(type: string | null | undefined): string {
  return HAZARD_TYPE_OPTIONS.find(item => item.value === type)?.label || type || 'Other Hazard';
}

export function hazardSeverityTone(severity: string | null | undefined): 'danger' | 'warning' | 'info' {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'danger';
  if (severity === 'LOW') return 'info';
  return 'warning';
}

export function createHazardRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hazardPayloadFingerprint(input: {
  mapVersionId: string;
  locationKind: HazardLocationKind;
  locationId: string;
  hazardType: HazardType;
  severity: IssueSeverity;
  description: string;
}): string {
  return JSON.stringify({
    mapVersionId: input.mapVersionId.trim(),
    locationKind: input.locationKind,
    locationId: input.locationId.trim(),
    hazardType: input.hazardType,
    severity: input.severity,
    description: input.description.trim(),
  });
}

export function collectMapHazardLocations(map: HazardMapLocationsInput | null | undefined): {
  edges: HazardLocationOption[];
  zones: HazardLocationOption[];
  endpoints: HazardLocationOption[];
} {
  if (!map) {
    return { edges: [], zones: [], endpoints: [] };
  }
  const edges = (map.edges ?? [])
    .filter(edge => edge.isActive && edge.mapVersionId === map.id)
    .map(edge => ({
      id: edge.id,
      code: edge.code,
      label: edge.code,
      subtitle: edge.direction || undefined,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const zones = (map.zones ?? [])
    .filter(zone => zone.isActive && zone.mapVersionId === map.id)
    .map(zone => ({
      id: zone.id,
      code: zone.code,
      label: zone.name || zone.code,
      subtitle: zone.zoneType ? `${zone.code} · ${zone.zoneType}` : zone.code,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const endpoints = (map.endpoints ?? [])
    .filter(ep => ep.isEnabled && ep.mapVersionId === map.id)
    .map(ep => ({
      id: ep.id,
      code: ep.code,
      label: ep.name || ep.code,
      subtitle: ep.endpointType ? `${ep.code} · ${ep.endpointType}` : ep.code,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return { edges, zones, endpoints };
}

export function buildHazardRequestBody(
  requestId: string,
  input: {
    mapVersionId: string;
    locationKind: HazardLocationKind;
    locationId: string;
    hazardType: HazardType;
    severity: IssueSeverity;
    description: string;
  },
) {
  return {
    requestId,
    mapVersionId: input.mapVersionId,
    hazardType: input.hazardType,
    severity: input.severity,
    description: input.description.trim(),
    edgeId: input.locationKind === 'edge' ? input.locationId : null,
    zoneId: input.locationKind === 'zone' ? input.locationId : null,
    endpointId: input.locationKind === 'endpoint' ? input.locationId : null,
  };
}
