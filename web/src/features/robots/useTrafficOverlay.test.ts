import { describe, expect, it } from 'vitest'
import type { TrafficRobotView, TrafficSnapshot } from '@/shared/api/fleet'
import { buildTrafficOverlay } from './useTrafficOverlay'

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
})
