import { describe, expect, it } from 'vitest'
import type { Issue } from '@/shared/api/operations'
import type { JobDetailDto, JobStepDto } from '@/shared/api/jobs'
import { handoverOf, isBlocking, issueCounts, issuesOf } from './jobContainerView'

const C1 = 'c1'
const C2 = 'c2'

function step(id: string, operationCode: string, containerId: string, status: string, outputValues: Record<string, unknown> = {}): JobStepDto {
  return {
    id,
    sequenceNo: 1,
    stepKey: id,
    name: id,
    stepType: 'HUMAN_INTERACTION',
    operationCode,
    status: status as JobStepDto['status'],
    targetEndpointId: null,
    resolvedInputs: { containerId },
    outputValues,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    completedAt: status === 'COMPLETED' ? '2026-11-22T10:00:00Z' : null,
  }
}

const job = {
  tasks: [
    {
      steps: [
        step('p1', 'PICKUP_CONFIRM', C1, 'COMPLETED', {
          confirmedAt: '2026-11-22T09:58:00Z',
          confirmationSource: 'STAFF_APP',
          scannedBarcode: 'CTN-1',
          note: '',
        }),
        step('d1', 'DROPOFF_CONFIRM', C1, 'WAITING'),
        step('p2', 'PICKUP_CONFIRM', C2, 'SKIPPED'),
      ],
    },
  ],
} as unknown as JobDetailDto
job.tasks[0].steps[0].confirmedByName = 'Nguyen'

function issue(id: string, containerId: string, status: Issue['status'], blocksHandover = false, reportedAt = '2026-11-22T10:00:00Z'): Issue {
  return { id, containerId, status, blocksHandover, reportedAt } as Issue
}

describe('job container view', () => {
  it('reads a confirmed handover: who, when, how, what was scanned', () => {
    expect(handoverOf(job, C1, 'PICKUP_CONFIRM')).toEqual({
      stepId: 'p1',
      status: 'COMPLETED',
      confirmedAt: '2026-11-22T09:58:00Z',
      confirmedBy: 'Nguyen',
      source: 'STAFF_APP',
      scannedBarcode: 'CTN-1',
      note: null,
    })
  })

  it('reads a handover still to come, and none for a container without one', () => {
    expect(handoverOf(job, C1, 'DROPOFF_CONFIRM')).toMatchObject({ stepId: 'd1', status: 'WAITING', confirmedAt: null })
    expect(handoverOf(job, C2, 'DROPOFF_CONFIRM')).toBeNull()
  })

  it('lists a container issues blocking first, then open, then closed', () => {
    const issues = [
      issue('closed', C1, 'RESOLVED', true),
      issue('open-old', C1, 'OPEN', false, '2026-11-22T09:00:00Z'),
      issue('blocking', C1, 'ACKNOWLEDGED', true),
      issue('open-new', C1, 'IN_PROGRESS'),
      issue('other', C2, 'OPEN', true),
    ]
    expect(issuesOf(issues, C1).map((i) => i.id)).toEqual(['blocking', 'open-new', 'open-old', 'closed'])
    expect(issueCounts(issues)).toEqual({ open: 4, blocking: 2 })
  })

  it('a resolved wrong-container issue no longer blocks', () => {
    expect(isBlocking(issue('x', C1, 'RESOLVED', true))).toBe(false)
    expect(isBlocking(issue('x', C1, 'OPEN', true))).toBe(true)
    expect(isBlocking(issue('x', C1, 'OPEN', false))).toBe(false)
  })
})
