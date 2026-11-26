import { describe, expect, it } from 'vitest'
import type { JobRecovery } from '@/shared/api/jobs'
import { actionState, defaultRecoveryChecklist, matchScan, reasonText, recoverySteps, scansOf } from './recoveryModel'

const base: JobRecovery = {
  id: 'case', jobId: 'job', status: 'OPEN', reason: 'robot_offline', fromRobotId: 'a', toRobotId: null, recoveryEndpointId: null,
  containerIds: ['c1', 'c2'], robotArrived: false, confirmedBy: null, confirmedAt: null, note: null, createdAt: '2026-11-26T03:00:00Z',
  resolvedAt: null, claimedBy: null, version: 2,
  containers: [
    { containerId: 'c1', barcode: 'BC-0001', holderType: 'ROBOT', holderId: 'a' },
    { containerId: 'c2', barcode: null, holderType: 'STAFF', holderId: 'u' },
  ],
  availableActions: [
    { action: 'ASSIGN', allowed: false, reason: 'recovery_source_not_secured' },
    { action: 'ASSESS', allowed: true, reason: null },
  ],
  buttonArmed: false, confirmedByRobotId: null, phase: 'ASSESSMENT_REQUIRED', recoveryMode: null, fault: null, assessment: null,
  verifiedLocation: null, sourceEndpointId: null, sourceArrived: false, sourceSecuredAt: null, sourceSecuredBy: null,
}

describe('recoveryModel', () => {
  it('reads what the server allows and why not', () => {
    expect(actionState(base, 'ASSESS')).toEqual({ allowed: true, reason: null })
    expect(actionState(base, 'ASSIGN')).toEqual({ allowed: false, reason: 'recovery_source_not_secured' })
    expect(actionState(base, 'UNLOAD')).toEqual({ allowed: false, reason: null })
    expect(reasonText('recovery_source_not_secured')).toBe('A technician has to secure the failed robot first')
    expect(reasonText('some_new_code')).toBe('some new code')
  })

  it('shows how far the case is', () => {
    expect(recoverySteps(base).map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo'])
    expect(recoverySteps({ ...base, phase: 'SOURCE_SECURED', sourceSecuredAt: 'x' }).map((s) => s.state))
      .toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(recoverySteps({ ...base, resolvedAt: 'x', status: 'TRANSFERRED' }).every((s) => s.state === 'done')).toBe(true)
  })

  it('starts the technician from an all-unchecked safety checklist', () => {
    const list = defaultRecoveryChecklist()
    expect(list.length).toBeGreaterThanOrEqual(6)
    expect(list.every((i) => !i.ok)).toBe(true)
  })

  it('matches a scanned label to its container and builds the scans', () => {
    expect(matchScan(base.containers, ' bc-0001 ')?.containerId).toBe('c1')
    expect(matchScan(base.containers, 'nope')).toBeNull()
    expect(scansOf(base.containers, new Set(['c1', 'c2']))).toEqual([{ containerId: 'c1', barcode: 'BC-0001' }])
  })
})
