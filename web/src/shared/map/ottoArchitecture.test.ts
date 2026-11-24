import { afterEach, describe, expect, it } from 'vitest'
import type { Endpoint } from '@/shared/api/contracts'
import { setLanguageForTests } from '@/shared/i18n'
import {
  SHELF_BAY_DEPTH_METERS,
  computeOttoStationArchitecture,
  endpointVisualKind,
  formatTrafficAlertReason,
  resolveOttoRobotTagPlacements,
} from './ottoArchitecture'

afterEach(() => setLanguageForTests('en'))

function makeEndpoint(overrides: Partial<Endpoint> & Pick<Endpoint, 'id' | 'code' | 'name'>): Endpoint {
  return {
    mapVersionId: 'map-1',
    endpointType: 'WAYPOINT',
    x: 2,
    y: 2,
    yaw: Math.PI / 2,
    positionTolerance: 0.1,
    yawTolerance: 0.1,
    isEnabled: true,
    ...overrides,
  }
}

describe('endpointVisualKind', () => {
  it('classifies operational endpoint types and storage bindings', () => {
    expect(
      endpointVisualKind(
        makeEndpoint({
          id: 'ep-1',
          code: 'EP-A1',
          name: 'Aisle A1',
          storageLocation: { code: 'LOC-A1', name: 'Loc A1', state: 'LINKED', isActive: true },
        }),
      ),
    ).toBe('SHELF')
    expect(endpointVisualKind(makeEndpoint({ id: 'ep-2', code: 'EP-SHELF-B1', name: 'Shelf B 01' }))).toBe('SHELF')
    expect(endpointVisualKind(makeEndpoint({ id: 'ep-3', code: 'EP-INBOUND', name: 'Receiving Dock' }))).toBe('INBOUND')
    expect(endpointVisualKind(makeEndpoint({ id: 'ep-4', code: 'EP-OUTBOUND', name: 'Dispatch Gate' }))).toBe('OUTBOUND')
    expect(
      endpointVisualKind(makeEndpoint({ id: 'ep-5', code: 'EP-CHG-1', name: 'Charge Station', endpointType: 'CHARGER' })),
    ).toBe('CHARGER')
    expect(
      endpointVisualKind(makeEndpoint({ id: 'ep-6', code: 'EP-PRK-1', name: 'Park Bay', endpointType: 'PARK' })),
    ).toBe('PARK')
    expect(endpointVisualKind(makeEndpoint({ id: 'ep-7', code: 'EP-INSPECT', name: 'QC Inspection' }))).toBe('INSPECTION')
    expect(
      endpointVisualKind(makeEndpoint({ id: 'ep-8', code: 'EP-WAIT-1', name: 'Queue Buffer', endpointType: 'QUEUE' })),
    ).toBe('WAIT')
    expect(endpointVisualKind(makeEndpoint({ id: 'ep-9', code: 'EP-WP-1', name: 'Turn Point' }))).toBe('WAYPOINT')
  })
})

describe('computeOttoStationArchitecture', () => {
  const roomBounds = { minX: 0, minY: 0, maxX: 5, maxY: 5 }

  it('builds recessed perimeter shelf bays and prevents overlap when adjacent shelves are 0.5m apart', () => {
    const endpoints: Endpoint[] = [
      makeEndpoint({ id: 's1', code: 'EP-SHELF-1', name: 'Shelf 1', x: 2.0, y: 4.55, yaw: Math.PI / 2 }),
      makeEndpoint({ id: 's2', code: 'EP-SHELF-2', name: 'Shelf 2', x: 2.5, y: 4.55, yaw: Math.PI / 2 }),
      makeEndpoint({ id: 'c1', code: 'EP-CHARGE', name: 'Charger', endpointType: 'CHARGER', x: 0.7, y: 0.8, yaw: -Math.PI / 2 }),
    ]

    const arch = computeOttoStationArchitecture(endpoints, roomBounds, 'rad')
    expect(arch.dockBays).toHaveLength(3)
    expect(arch.shelfBays).toHaveLength(2)
    expect(arch.perimeterWalls).toEqual({ top: true, bottom: false, left: false, right: false })

    const [leftBay, rightBay] = arch.shelfBays
    expect(leftBay.wall).toBe('top')
    expect(rightBay.wall).toBe('top')
    expect(leftBay.maxX + 0.03).toBeLessThan(rightBay.minX)

    expect(arch.expandedBounds.maxY).toBeCloseTo(roomBounds.maxY + SHELF_BAY_DEPTH_METERS + 0.1, 6)
    expect(arch.expandedBounds.minY).toBeCloseTo(roomBounds.minY - 0.1, 6)
    expect(arch.expandedBounds.minX).toBeCloseTo(roomBounds.minX - 0.1, 6)
    expect(arch.expandedBounds.maxX).toBeCloseTo(roomBounds.maxX + 0.1, 6)
  })
})

describe('resolveOttoRobotTagPlacements', () => {
  it('flips nearby tags to avoid colliding and separates side-by-side vs stacked pairs', () => {
    const pair = [
      { id: 'r1', code: 'RBT-001', x: 100, y: 200 },
      { id: 'r2', code: 'RBT-002', x: 155, y: 200 },
    ]

    const at1x = resolveOttoRobotTagPlacements(pair, 14, 1, 1)
    expect(at1x.r1.placement).toBe('below')
    expect(at1x.r2.placement).toBe('above')

    const at2x = resolveOttoRobotTagPlacements(pair, 14, 2, 1)
    expect(at2x.r1.placement).toBe('below')
    expect(at2x.r2.placement).toBe('below')

    const trio = resolveOttoRobotTagPlacements(
      [...pair, { id: 'r3', code: 'RBT-003', x: 210, y: 200 }],
      14,
      1,
      1,
    )
    expect(trio.r1.placement).toBe('below')
    expect(trio.r2.placement).toBe('above')
    expect(trio.r3.placement).toBe('below')

    const stacked = resolveOttoRobotTagPlacements(
      [
        { id: 'r1', code: 'RBT-001', x: 100, y: 100 },
        { id: 'r2', code: 'RBT-002', x: 100, y: 142 },
      ],
      14,
      1,
      1,
    )
    expect(stacked.r1.placement).toBe('above')
    expect(stacked.r2.placement).toBe('below')

    const selectedSecond = resolveOttoRobotTagPlacements(
      [
        { id: 'r1', code: 'RBT-001', x: 100, y: 200, isSelected: false },
        { id: 'r2', code: 'RBT-002', x: 155, y: 200, isSelected: true },
      ],
      14,
      1,
      1,
    )
    expect(selectedSecond.r2.placement).toBe('below')
    expect(selectedSecond.r1.placement).toBe('above')
  })
})

describe('formatTrafficAlertReason', () => {
  it('resolves raw UUIDs in SEED_CONFLICT strings into readable robot codes without exposing UUIDs', () => {
    const blockerId = '838c01b5-b5bb-4379-840d-04566f2f3f56'
    const robots = [
      { id: '11111111-1111-1111-1111-111111111111', code: 'RBT-001' },
      { id: blockerId, code: 'RBT-002' },
    ]

    const en = formatTrafficAlertReason(`SEED_CONFLICT:HELD_BY:${blockerId}`, robots)
    expect(en).toContain('RBT-002')
    expect(en).not.toContain(blockerId)

    setLanguageForTests('vi')
    const viText = formatTrafficAlertReason(`SEED_CONFLICT:HELD_BY:${blockerId}`, robots)
    expect(viText).toContain('RBT-002')
    expect(viText).not.toContain(blockerId)
  })
})
