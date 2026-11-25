import type { EndpointDto } from '@/shared/api/navigation'

/** Shown in the variable Type list next to the real data types; saved as dataType UUID + format WAYPOINT. */
export const WAYPOINT_TYPE = 'WAYPOINT'
/** An EndpointGroup: a MOVE to it goes to a free member. Saved as dataType UUID + format WAYPOINT_GROUP. */
export const WAYPOINT_GROUP_TYPE = 'WAYPOINT_GROUP'

export type WaypointFormat = typeof WAYPOINT_TYPE | typeof WAYPOINT_GROUP_TYPE

const isWaypointFormat = (value: string | null | undefined): value is WaypointFormat =>
  value === WAYPOINT_TYPE || value === WAYPOINT_GROUP_TYPE

/** The Type list value of a variable: WAYPOINT / WAYPOINT_GROUP for a formatted UUID, else its data type. */
export function variableTypeChoice(variable: { dataType: string; format?: string | null }): string {
  return variable.dataType === 'UUID' && isWaypointFormat(variable.format) ? variable.format : variable.dataType
}

/** What choosing a Type stores: a waypoint type is a UUID with that format; any other type clears the format. */
export function fromTypeChoice(choice: string): { dataType: string; format: WaypointFormat | null } {
  return isWaypointFormat(choice) ? { dataType: 'UUID', format: choice } : { dataType: choice, format: null }
}

/** A UUID that names a map Endpoint: `endpointId`, `targetEndpointId`, `inspectionEndpointId`, `parkEndpointId`, … */
export function isEndpointField(key: string | null | undefined, dataType: string | null | undefined): boolean {
  return dataType === 'UUID' && /endpointid$/i.test((key ?? '').trim())
}

/** Endpoints of one warehouse's published map. */
export interface EndpointMapGroup {
  warehouseCode: string
  mapCode: string
  endpoints: Pick<EndpointDto, 'id' | 'code' | 'name' | 'endpointType' | 'isEnabled'>[]
}

export interface EndpointOption {
  id: string
  /** The place's code: what a workflow configured on another map version is matched by. */
  code: string
  label: string
  disabled: boolean
}

export interface EndpointOptionGroup {
  label: string
  options: EndpointOption[]
}

/** One group per map, Endpoints by code; a disabled Endpoint is still listed (a workflow may name it) but marked. */
export function buildEndpointOptions(groups: EndpointMapGroup[]): EndpointOptionGroup[] {
  return groups
    .filter((g) => g.endpoints.length > 0)
    .map((g) => ({
      label: `${g.warehouseCode} · ${g.mapCode}`,
      options: [...g.endpoints]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((e) => ({
          id: e.id,
          code: e.code,
          label: `${e.code} · ${e.name} · ${e.endpointType}${e.isEnabled ? '' : ' (disabled)'}`,
          disabled: !e.isEnabled,
        })),
    }))
}

/** Groups of one warehouse's published map. */
export interface EndpointGroupMapGroup {
  warehouseCode: string
  mapCode: string
  groups: { id: string; code: string; name: string; selectionPolicy: string; isActive: boolean; members: { code: string }[] }[]
}

/** Same shape as the Endpoint options, so one picker shows either: `PARKING · Parking · NEAREST · EP-PARKING-A, EP-PARKING-B`. */
export function buildGroupOptions(maps: EndpointGroupMapGroup[]): EndpointOptionGroup[] {
  return maps
    .filter((m) => m.groups.length > 0)
    .map((m) => ({
      label: `${m.warehouseCode} · ${m.mapCode}`,
      options: [...m.groups]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((g) => ({
          id: g.id,
          code: g.code,
          label: `${g.code} · ${g.name} · ${g.selectionPolicy} · ${g.members.map((x) => x.code).join(', ') || '—'}${g.isActive ? '' : ' (inactive)'}`,
          disabled: !g.isActive,
        })),
    }))
}

/**
 * The option a configured value stands for: the same id, else (a workflow configured while another map version was
 * published) the option with the same code, which is what the runtime uses on the Job's map.
 */
export function findOptionByCode(groups: EndpointOptionGroup[], code: string | null | undefined): EndpointOption | null {
  if (!code) return null
  for (const group of groups) {
    const found = group.options.find((o) => o.code.toLowerCase() === code.toLowerCase())
    if (found) return found
  }
  return null
}

export function findEndpointOption(groups: EndpointOptionGroup[], id: string | null | undefined): EndpointOption | null {
  if (!id) return null
  for (const group of groups) {
    const found = group.options.find((o) => o.id === id)
    if (found) return found
  }
  return null
}
