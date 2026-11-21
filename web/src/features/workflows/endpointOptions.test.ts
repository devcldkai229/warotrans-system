import { describe, expect, it } from 'vitest'
import { buildEndpointOptions, buildGroupOptions, findEndpointOption, fromTypeChoice, isEndpointField, variableTypeChoice } from './endpointOptions'

describe('isEndpointField', () => {
  it('matches UUID settings that name an Endpoint', () => {
    expect(isEndpointField('endpointId', 'UUID')).toBe(true)
    expect(isEndpointField('targetEndpointId', 'UUID')).toBe(true)
    expect(isEndpointField('inspectionEndpointId', 'UUID')).toBe(true)
    expect(isEndpointField('parkEndpointId', 'UUID')).toBe(true)
  })

  it('leaves other settings alone', () => {
    expect(isEndpointField('robotId', 'UUID')).toBe(false)
    expect(isEndpointField('containerId', 'UUID')).toBe(false)
    expect(isEndpointField('targetEndpointId', 'STRING')).toBe(false)
    expect(isEndpointField(undefined, 'UUID')).toBe(false)
  })
})

describe('buildEndpointOptions', () => {
  const groups = buildEndpointOptions([
    {
      warehouseCode: 'ONE',
      mapCode: 'MAP-ONE-V013',
      endpoints: [
        { id: 'b', code: 'EP-OUTBOUND', name: 'Outbound', endpointType: 'WAYPOINT', isEnabled: true },
        { id: 'a', code: 'EP-INSPECTION', name: 'Inspection', endpointType: 'WAYPOINT', isEnabled: true },
        { id: 'c', code: 'EP-OLD', name: 'Old', endpointType: 'WAYPOINT', isEnabled: false },
      ],
    },
    { warehouseCode: 'EMPTY', mapCode: 'MAP-X', endpoints: [] },
  ])

  it('groups by map, sorts by code, marks disabled ones', () => {
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('ONE · MAP-ONE-V013')
    expect(groups[0].options.map((o) => o.id)).toEqual(['a', 'c', 'b'])
    expect(groups[0].options[0].label).toBe('EP-INSPECTION · Inspection · WAYPOINT')
    expect(groups[0].options[1]).toMatchObject({ disabled: true, label: 'EP-OLD · Old · WAYPOINT (disabled)' })
  })

  it('finds a chosen Endpoint by id', () => {
    expect(findEndpointOption(groups, 'a')?.label).toContain('EP-INSPECTION')
    expect(findEndpointOption(groups, 'zzz')).toBeNull()
    expect(findEndpointOption(groups, '')).toBeNull()
  })
})

describe('WAYPOINT variable type', () => {
  it('shows a waypoint-formatted UUID as WAYPOINT and a plain one as UUID', () => {
    expect(variableTypeChoice({ dataType: 'UUID', format: 'WAYPOINT' })).toBe('WAYPOINT')
    expect(variableTypeChoice({ dataType: 'UUID' })).toBe('UUID')
    expect(variableTypeChoice({ dataType: 'STRING', format: 'WAYPOINT' })).toBe('STRING')
  })

  it('stores WAYPOINT as a UUID with format WAYPOINT, and clears the format otherwise', () => {
    expect(fromTypeChoice('WAYPOINT')).toEqual({ dataType: 'UUID', format: 'WAYPOINT' })
    expect(fromTypeChoice('UUID')).toEqual({ dataType: 'UUID', format: null })
    expect(fromTypeChoice('BOOLEAN')).toEqual({ dataType: 'BOOLEAN', format: null })
  })
})

describe('WAYPOINT_GROUP variable type', () => {
  it('round-trips as a UUID with format WAYPOINT_GROUP', () => {
    expect(fromTypeChoice('WAYPOINT_GROUP')).toEqual({ dataType: 'UUID', format: 'WAYPOINT_GROUP' })
    expect(variableTypeChoice({ dataType: 'UUID', format: 'WAYPOINT_GROUP' })).toBe('WAYPOINT_GROUP')
  })

  it('lists groups with their policy and members', () => {
    const [map] = buildGroupOptions([
      {
        warehouseCode: 'ONE',
        mapCode: 'MAP-ONE-V013',
        groups: [{ id: 'g', code: 'PARKING', name: 'Parking', selectionPolicy: 'NEAREST', isActive: true, members: [{ code: 'EP-PARKING-A' }, { code: 'EP-PARKING-B' }] }],
      },
    ])
    expect(map.options[0].label).toBe('PARKING · Parking · NEAREST · EP-PARKING-A, EP-PARKING-B')
  })
})
