import { describe, expect, it } from 'vitest'
import type { TrafficRobotView, TrafficSnapshot } from '@/shared/api/fleet'
import { buildTrafficOverlay, summarizeTrafficWait } from './useTrafficOverlay'

function robot(overrides: Partial<TrafficRobotView>): TrafficRobotView {
  return { robotId: 'r1', phase: 'Idle', localizationOk: true, occupiedResourceIds: [], waitingReason: '', ...overrides }
}

function snapshot(overrides: Partial<TrafficSnapshot>): TrafficSnapshot {
  return { epoch: 1, stateVersion: 1, phase: 'Active', robots: [], resources: [], waits: [], recentEvents: [], ...overrides }
}

describe('buildTrafficOverlay', () => {
  it('has nothing held on a quiet map', () => {
    expect(buildTrafficOverlay(snapshot({ robots: [robot({})] }), [{ id: 'r1', code: 'RBT-001' }])).toEqual({
      authorizedEdgeIds: [],
      occupiedResourceIds: [],
      quarantinedRobotCodes: [],
    })
  })

  it('draws the lanes a robot holds the authority of and the resources that have a holder', () => {
    const overlay = buildTrafficOverlay(
      snapshot({
        robots: [robot({ authority: { authorityId: 'a', edgeIds: [3, 4], graphHash: 'h', seq: 1, epoch: 1 } })],
        resources: [
          { resourceId: 'zone:A', kind: 'ZONE', capacity: 1, holders: ['r1'], waiters: [], queueLength: 0 },
          { resourceId: 'zone:B', kind: 'ZONE', capacity: 1, holders: [], waiters: [], queueLength: 0 },
        ],
      }),
      [],
    )

    expect(overlay.authorizedEdgeIds).toEqual([3, 4])
    expect(overlay.occupiedResourceIds).toEqual(['zone:A'])
  })

  it('adds what semantic grants hold, once each', () => {
    const overlay = buildTrafficOverlay(
      snapshot({
        robots: [
          robot({ robotId: 'r1', authority: { authorityId: 'a', edgeIds: [], graphHash: 'h', seq: 1, epoch: 1, resourceIds: ['zone:A', 'cell:7'] } }),
          robot({ robotId: 'r2', occupiedResourceIds: ['cell:7', 'cell:8'] }),
        ],
        resources: [{ resourceId: 'zone:A', kind: 'ZONE', capacity: 1, holders: ['r1'], waiters: [], queueLength: 0 }],
      }),
      [],
    )

    expect([...(overlay.occupiedResourceIds ?? [])].sort()).toEqual(['cell:7', 'cell:8', 'zone:A'])
  })

  it('marks quarantined only the robots the screen draws, by phase or by reason', () => {
    const snap = snapshot({
      robots: [
        robot({ robotId: 'r1', phase: 'Quarantined' }),
        robot({ robotId: 'r2', quarantineReason: 'lost localization' }),
        robot({ robotId: 'r3' }),
        robot({ robotId: 'r9', phase: 'Quarantined' }),
      ],
    })

    const drawn = [
      { id: 'r1', code: 'RBT-001' },
      { id: 'r3', code: 'RBT-003' },
    ]

    expect(buildTrafficOverlay(snap, drawn).quarantinedRobotCodes).toEqual(['RBT-001'])
    expect(buildTrafficOverlay(snap, [{ id: 'r2', code: 'RBT-002' }]).quarantinedRobotCodes).toEqual(['RBT-002'])
  })

  it('draws a waiting plan with nothing granted and a granted prefix once traffic clears part of it', () => {
    const path = [
      { x: 1, y: 0, yaw: 0 },
      { x: 2, y: 0, yaw: 0 },
      { x: 3, y: 0, yaw: 1.57 },
    ]
    const drawn = [
      { id: 'r1', code: 'RBT-001' },
      { id: 'r2', code: 'RBT-002' },
    ]
    const overlay = buildTrafficOverlay(
      snapshot({
        robots: [
          robot({ robotId: 'r1', phase: 'Waiting', x: 0, y: 0, proposedPath: path, grantedPathPoints: 0 }),
          robot({ robotId: 'r2', phase: 'Moving', x: 0, y: 1, proposedPath: path, grantedPathPoints: 2 }),
        ],
      }),
      drawn,
    )

    const [waiting, moving] = overlay.plannedPaths ?? []
    expect(waiting).toMatchObject({ robotCode: 'RBT-001', grantedCount: 0, waiting: true, goalYaw: 1.57 })
    expect(waiting.points).toHaveLength(4)
    expect(moving).toMatchObject({ robotCode: 'RBT-002', grantedCount: 3, waiting: false })
    expect(waiting.color).not.toEqual(moving.color)
  })
})

describe('summarizeTrafficWait', () => {
  const drawn = [
    { id: 'r1', code: 'RBT-001' },
    { id: 'r2', code: 'RBT-002' },
  ]

  it('names the zone the other robot holds, not the first free cell of the wait list', () => {
    const snap = snapshot({
      waits: [
        { robotId: 'r1', resourceId: 'cell:-1:-10', reason: 'Capacity', blockingOwner: 'r2' },
        { robotId: 'r1', resourceId: 'cell:3:4', reason: 'Capacity', blockingOwner: 'r2' },
        { robotId: 'r1', resourceId: 'zone:ZONE-SINGLE-WAIT-ZONE', reason: 'Capacity', blockingOwner: 'r2' },
      ],
      resources: [
        { resourceId: 'cell:-1:-10', kind: 'CELL', capacity: 1, holders: ['r1'], waiters: [], queueLength: 0 },
        { resourceId: 'zone:ZONE-SINGLE-WAIT-ZONE', kind: 'ZONE', capacity: 1, holders: ['r2'], waiters: ['r1'], queueLength: 1 },
      ],
    })

    expect(summarizeTrafficWait('r1', snap, drawn)).toEqual({
      resourceId: 'zone:ZONE-SINGLE-WAIT-ZONE',
      reason: 'Capacity',
      blockerCode: 'RBT-002',
      more: 2,
    })
  })

  it('falls back to the first wait and its reported blocker when nothing is held', () => {
    const snap = snapshot({ waits: [{ robotId: 'r1', resourceId: 'cell:1:1', reason: 'Queue', blockingOwner: 'r2' }] })

    expect(summarizeTrafficWait('r1', snap, drawn)).toMatchObject({ resourceId: 'cell:1:1', blockerCode: 'RBT-002', more: 0 })
    expect(summarizeTrafficWait('r2', snap, drawn)).toBeNull()
  })
})
