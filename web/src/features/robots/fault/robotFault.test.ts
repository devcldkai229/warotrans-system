import { describe, expect, it } from 'vitest'
import type { Issue, IssueStatus } from '@/shared/api/operations'
import { ackDescription, acknowledgeFault, findAcknowledgement, parseAckDescription, type AcknowledgeDeps } from './robotFault'

const ROBOT = 'robot-1'
const ME = 'acc-me'

let counter = 0
function issue(overrides: Partial<Issue> = {}): Issue {
  counter += 1
  return {
    id: `issue-${counter}`,
    code: `ISS-${counter}`,
    issueType: 'ROBOT',
    severity: 'MEDIUM',
    status: 'ACKNOWLEDGED',
    description: ackDescription('LIDAR_TIMEOUT', 'Linh Tran'),
    reportedBy: 'acc-linh',
    assigneeId: 'acc-linh',
    containerId: null,
    transportRequestId: null,
    jobId: null,
    jobStepId: null,
    storageLocationId: null,
    robotId: ROBOT,
    evidence: [],
    version: 1,
    reportedAt: `2026-11-10T10:0${counter % 10}:00Z`,
    updatedAt: '2026-11-10T10:00:00Z',
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    allowedTransitions: [],
    ...overrides,
  }
}

describe('the Issue description that links an acknowledgement to a fault', () => {
  it('writes the robot code and who acknowledged, and reads them back', () => {
    const text = ackDescription('LIDAR_TIMEOUT', ' Linh Tran ')

    expect(text).toBe('Robot error LIDAR_TIMEOUT · acknowledged by Linh Tran')
    expect(parseAckDescription(text)).toEqual({ code: 'LIDAR_TIMEOUT', by: 'Linh Tran' })
  })

  it('keeps a code that has spaces readable and a name that contains the separator', () => {
    expect(parseAckDescription(ackDescription('E STOP', 'A · B'))).toEqual({ code: 'E_STOP', by: 'A · B' })
  })

  it('does not take an ordinary issue for an acknowledgement', () => {
    expect(parseAckDescription('QA: lidar cover loose')).toBeNull()
    expect(parseAckDescription('Robot error LIDAR_TIMEOUT')).toBeNull()
  })
})

describe('findAcknowledgement', () => {
  it('finds none when the robot has no acknowledgement for this error', () => {
    expect(findAcknowledgement([], ROBOT, 'LIDAR_TIMEOUT')).toEqual({ state: 'none', closed: null })
    expect(findAcknowledgement([issue({ description: 'something else' })], ROBOT, 'LIDAR_TIMEOUT').state).toBe('none')
  })

  it('reads who acknowledged, and the reason noted with it', () => {
    const acknowledged = issue({ evidence: [{ kind: 'NOTE', uri: null, mimeType: null, note: 'Wiped the lens', addedBy: null, addedAt: null }] })

    expect(findAcknowledgement([acknowledged], ROBOT, 'LIDAR_TIMEOUT')).toEqual({
      state: 'acknowledged',
      issue: acknowledged,
      by: 'Linh Tran',
      reason: 'Wiped the lens',
    })
  })

  it('does not mix up another error code, another robot or another kind of Issue', () => {
    const issues = [
      issue({ description: ackDescription('NAV2_DOWN', 'Linh Tran') }),
      issue({ robotId: 'robot-2' }),
      issue({ issueType: 'JOB' }),
    ]

    expect(findAcknowledgement(issues, ROBOT, 'LIDAR_TIMEOUT').state).toBe('none')
  })

  it('shows an Issue that was created but never acknowledged as pending', () => {
    const pending = issue({ status: 'OPEN', assigneeId: null })

    expect(findAcknowledgement([pending], ROBOT, 'LIDAR_TIMEOUT')).toEqual({ state: 'pending', issue: pending })
  })

  it('picks the earliest open Issue when two people acknowledged at once, so both see the same one', () => {
    const later = issue({ reportedAt: '2026-11-10T10:05:00Z', description: ackDescription('LIDAR_TIMEOUT', 'Second Person') })
    const earlier = issue({ reportedAt: '2026-11-10T10:01:00Z', description: ackDescription('LIDAR_TIMEOUT', 'First Person') })

    const found = findAcknowledgement([later, earlier], ROBOT, 'LIDAR_TIMEOUT')

    expect(found).toMatchObject({ state: 'acknowledged', by: 'First Person' })
  })

  it('does not count a resolved acknowledgement, but remembers it when the error outlives it', () => {
    const resolved = issue({ status: 'RESOLVED' })

    expect(findAcknowledgement([resolved], ROBOT, 'LIDAR_TIMEOUT')).toEqual({ state: 'none', closed: resolved })
  })
})

function fakeApi(existing: Issue[] = []) {
  const calls: string[] = []
  const created: Parameters<AcknowledgeDeps['createIssue']>[0][] = []
  let stored = [...existing]
  const deps: AcknowledgeDeps = {
    listIssues: async () => {
      calls.push('list')
      return { items: stored, total: stored.length } as Awaited<ReturnType<AcknowledgeDeps['listIssues']>>
    },
    createIssue: async (body) => {
      calls.push('create')
      created.push(body)
      const made = issue({ status: 'OPEN', assigneeId: null, description: body.description, evidence: (body.evidence ?? []).map((e) => ({ kind: e.kind, uri: null, mimeType: null, note: e.note ?? null, addedBy: null, addedAt: null })) })
      stored = [made, ...stored]
      return made
    },
    assignIssue: async (target, assigneeId) => {
      calls.push('assign')
      return { ...target, assigneeId, version: target.version + 1 }
    },
    transitionIssue: async (target, status: IssueStatus) => {
      calls.push(`transition:${status}`)
      return { ...target, status, version: target.version + 1 }
    },
  }
  return { deps, calls, created }
}

const args = { robotId: ROBOT, code: 'LIDAR_TIMEOUT', accountId: ME, fullName: 'Linh Tran', reason: '' }

describe('acknowledgeFault', () => {
  it('creates the Issue, gives it to the person and acknowledges it, in that order', async () => {
    const { deps, calls, created } = fakeApi()

    const result = await acknowledgeFault({ ...args, reason: '  Wiped the lens ' }, deps)

    expect(calls).toEqual(['list', 'create', 'assign', 'transition:ACKNOWLEDGED'])
    expect(created[0]).toEqual({
      issueType: 'ROBOT',
      severity: 'MEDIUM',
      description: 'Robot error LIDAR_TIMEOUT · acknowledged by Linh Tran',
      robotId: ROBOT,
      evidence: [{ kind: 'NOTE', note: 'Wiped the lens' }],
    })
    expect(result).toMatchObject({ status: 'ACKNOWLEDGED', assigneeId: ME })
  })

  it('leaves the evidence out when there is no reason', async () => {
    const { deps, created } = fakeApi()

    await acknowledgeFault(args, deps)

    expect(created[0].evidence).toBeUndefined()
  })

  it('does nothing when somebody else has already acknowledged it (a second click is harmless)', async () => {
    const done = issue()
    const { deps, calls } = fakeApi([done])

    const result = await acknowledgeFault(args, deps)

    expect(calls).toEqual(['list'])
    expect(result).toBe(done)
  })

  it('finishes a half-done attempt instead of creating a second Issue', async () => {
    const pending = issue({ status: 'OPEN', assigneeId: null })
    const { deps, calls } = fakeApi([pending])

    const result = await acknowledgeFault(args, deps)

    expect(calls).toEqual(['list', 'assign', 'transition:ACKNOWLEDGED'])
    expect(result).toMatchObject({ status: 'ACKNOWLEDGED', assigneeId: ME })
  })

  it('does not assign again an Issue that is already the person\'s', async () => {
    const mine = issue({ status: 'OPEN', assigneeId: ME })
    const { deps, calls } = fakeApi([mine])

    await acknowledgeFault(args, deps)

    expect(calls).toEqual(['list', 'transition:ACKNOWLEDGED'])
  })

  it('acknowledges again when the earlier acknowledgement was resolved and the error is back', async () => {
    const { deps, calls } = fakeApi([issue({ status: 'RESOLVED' })])

    await acknowledgeFault(args, deps)

    expect(calls).toEqual(['list', 'create', 'assign', 'transition:ACKNOWLEDGED'])
  })

  it('lets the API\'s own error through, so the screen can say what went wrong', async () => {
    const { deps } = fakeApi()
    deps.assignIssue = async () => {
      throw new Error('issue_version_conflict')
    }

    await expect(acknowledgeFault(args, deps)).rejects.toThrow('issue_version_conflict')
  })
})
