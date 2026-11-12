import { describe, expect, it } from 'vitest'
import type { JobStepDto, JobTaskDto } from '@/shared/api/jobs'
import { groupTasks, sectionTitle, stepsAreActive, type TaskLabels } from './taskGroups'

let counter = 0
const id = () => `id-${++counter}`

function step(status: JobStepDto['status'] = 'COMPLETED', overrides: Partial<JobStepDto> = {}): JobStepDto {
  return { id: id(), sequenceNo: 1, stepKey: 'K', name: 'Step', stepType: 'CHECK', operationCode: 'X', status, targetEndpointId: null, ...overrides } as JobStepDto
}

function task(overrides: Partial<JobTaskDto>, steps: JobStepDto[]): JobTaskDto {
  return {
    id: id(),
    sequenceNo: 1,
    taskKey: 'PICKUP',
    taskName: 'Pick up at source rack',
    status: 'COMPLETED',
    executionScope: 'ONCE_PER_JOB',
    stopAction: null,
    stopEndpointId: null,
    containerId: null,
    steps,
    ...overrides,
  }
}

const labels: TaskLabels = {
  endpoint: (value) => (value ? `Rack ${value}` : '—'),
  container: (value) => (value ? `CTN-${value}` : '—'),
}

/** The Job of the screenshot: two workflow tasks, five execution segments, nine steps. */
function relocation(containers = ['c1']): JobTaskDto[] {
  const tasks: JobTaskDto[] = [
    task({ sequenceNo: 1, executionScope: 'ONCE_PER_JOB' }, [step(), step(), step()]),
    task({ sequenceNo: 2, executionScope: 'ONCE_PER_STOP', stopAction: 'PICKUP', stopEndpointId: 's2' }, [step(), step()]),
  ]
  containers.forEach((containerId, position) =>
    tasks.push(task({ sequenceNo: 3 + position, executionScope: 'PER_CONTAINER_AT_STOP', stopAction: 'PICKUP', stopEndpointId: 's2', containerId }, [step()])),
  )
  const next = tasks.length + 1
  tasks.push(task({ sequenceNo: next, taskKey: 'DELIVERY', taskName: 'Deliver at destination rack', executionScope: 'ONCE_PER_STOP', stopAction: 'DROPOFF', stopEndpointId: 's3' }, [step(), step()]))
  containers.forEach((containerId, position) =>
    tasks.push(task({ sequenceNo: next + 1 + position, taskKey: 'DELIVERY', taskName: 'Deliver at destination rack', executionScope: 'PER_CONTAINER_AT_STOP', stopAction: 'DROPOFF', stopEndpointId: 's3', containerId }, [step()])),
  )
  return tasks
}

describe('groupTasks', () => {
  it("shows the workflow's two tasks for a Job whose runtime has five", () => {
    const tasks = relocation()
    expect(tasks).toHaveLength(5)

    const groups = groupTasks(tasks)

    expect(groups.map((g) => `${g.index}. ${g.name}`)).toEqual(['1. Pick up at source rack', '2. Deliver at destination rack'])
    expect(groups.map((g) => g.steps.length)).toEqual([6, 3])
    expect(groups.reduce((sum, g) => sum + g.steps.length, 0)).toBe(9)
  })

  it('splits a group into what is being done: checks, going to the rack, handing over', () => {
    const [pickup, delivery] = groupTasks(relocation())

    expect(pickup.sections.map((s) => s.kind)).toEqual(['checks', 'stop', 'handover'])
    expect(delivery.sections.map((s) => s.kind)).toEqual(['stop', 'handover'])
  })

  it('keeps the Containers of one stop in a single section, however many there are', () => {
    const [pickup, delivery] = groupTasks(relocation(['c1', 'c2', 'c3', 'c4']))

    expect(pickup.sections.map((s) => [s.kind, s.tasks.length])).toEqual([['checks', 1], ['stop', 1], ['handover', 4]])
    expect(delivery.sections.map((s) => [s.kind, s.tasks.length])).toEqual([['stop', 1], ['handover', 4]])
    // 2 workflow tasks, however many Containers: the runtime has 2N + 3 segments.
    expect(relocation(['c1', 'c2', 'c3', 'c4']).length).toBe(11)
    expect(groupTasks(relocation(['c1', 'c2', 'c3', 'c4']))).toHaveLength(2)
  })

  it('does not join hand-overs at different stops', () => {
    const tasks = [
      task({ sequenceNo: 1, executionScope: 'PER_CONTAINER_AT_STOP', stopAction: 'PICKUP', stopEndpointId: 'a', containerId: 'c1' }, [step()]),
      task({ sequenceNo: 2, executionScope: 'PER_CONTAINER_AT_STOP', stopAction: 'PICKUP', stopEndpointId: 'b', containerId: 'c2' }, [step()]),
    ]

    expect(groupTasks(tasks)[0].sections).toHaveLength(2)
  })

  it('puts segments in sequence order even when they arrive shuffled', () => {
    const tasks = relocation()

    const groups = groupTasks([...tasks].reverse())

    expect(groups.map((g) => g.key)).toEqual(['PICKUP', 'DELIVERY'])
    expect(groups[0].sections.map((s) => s.kind)).toEqual(['checks', 'stop', 'handover'])
  })

  it('says how far each group is', () => {
    const tasks = relocation()
    tasks[0].steps.forEach((s) => (s.status = 'COMPLETED'))
    tasks[1].steps[1].status = 'EXECUTING'
    tasks[1].steps[0].status = 'COMPLETED'
    tasks[2].steps[0].status = 'PENDING'
    tasks[3].steps.forEach((s) => (s.status = 'PENDING'))
    tasks[4].steps.forEach((s) => (s.status = 'PENDING'))

    const [pickup, delivery] = groupTasks(tasks)

    expect(pickup.done).toBe(4)
    expect(pickup.status).toBe('RUNNING')
    expect(delivery.done).toBe(0)
    expect(delivery.status).toBe('PENDING')
  })

  it('reports a group waiting for staff, a failed one, and a finished one (a skipped step counts as finished)', () => {
    const waiting = groupTasks([task({}, [step('COMPLETED'), step('WAITING')])])[0]
    const failed = groupTasks([task({}, [step('COMPLETED'), step('FAILED'), step('WAITING')])])[0]
    const finished = groupTasks([task({}, [step('COMPLETED'), step('SKIPPED')])])[0]

    expect([waiting.status, failed.status, finished.status]).toEqual(['WAITING', 'FAILED', 'COMPLETED'])
  })

  it('falls back to the key in words when the workflow task has no name, and keeps a segment without a key apart', () => {
    const groups = groupTasks([
      task({ sequenceNo: 1, taskName: '' }, [step()]),
      task({ sequenceNo: 2, taskKey: '', taskName: '', executionScope: 'RECOVERY', stopEndpointId: 'safe' }, [step()]),
      task({ sequenceNo: 3, taskKey: '', taskName: '', executionScope: 'RECOVERY', stopEndpointId: 'safe' }, [step()]),
    ])

    expect(groups).toHaveLength(3)
    expect(groups[0].name).toBe('Pickup')
    expect(groups[1].name).toBe('Task')
  })
})

describe('sectionTitle', () => {
  const [pickup, delivery] = groupTasks(relocation())
  const many = groupTasks(relocation(['c1', 'c2', 'c3']))

  it('says what each section does, with the rack and Container names', () => {
    expect(sectionTitle(pickup.sections[0], labels, 'x')).toBe('Checks before starting')
    expect(sectionTitle(pickup.sections[1], labels, 'x')).toBe('Go to the pickup rack · Rack s2')
    expect(sectionTitle(pickup.sections[2], labels, 'x')).toBe('Load CTN-c1 onto the robot')
    expect(sectionTitle(delivery.sections[0], labels, 'x')).toBe('Go to the drop-off rack · Rack s3')
    expect(sectionTitle(delivery.sections[1], labels, 'x')).toBe('Unload CTN-c1 from the robot')
  })

  it('counts the Containers instead of naming one when there are several', () => {
    expect(sectionTitle(many[0].sections[2], labels, 'x')).toBe('Load 3 containers onto the robot')
    expect(sectionTitle(many[1].sections[1], labels, 'x')).toBe('Unload 3 containers from the robot')
  })

  it('names the recovery robot and falls back to the task name for anything else', () => {
    const recovery = groupTasks([task({ executionScope: 'RECOVERY', stopEndpointId: 'safe' }, [step()])])[0]
    const other = groupTasks([task({ executionScope: null }, [step()])])[0]

    expect(sectionTitle(recovery.sections[0], labels, 'x')).toBe('Recovery robot goes to Rack safe')
    expect(sectionTitle(other.sections[0], labels, 'Pick up at source rack')).toBe('Pick up at source rack')
  })
})

describe('stepsAreActive', () => {
  it('is true for the current step and for a step that is running, waiting, paused or failed', () => {
    const current = step('PENDING')

    expect(stepsAreActive([current], current.id)).toBe(true)
    for (const status of ['EXECUTING', 'READY', 'WAITING', 'PAUSED', 'FAILED'] as const) expect(stepsAreActive([step(status)], null)).toBe(true)
  })

  it('is false for finished or not started steps that are not the current one', () => {
    expect(stepsAreActive([step('COMPLETED'), step('PENDING')], 'other')).toBe(false)
  })
})
