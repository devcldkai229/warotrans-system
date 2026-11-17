import type { JobStepDto, JobTaskDto } from '@/shared/api/jobs'
import { t } from '@/shared/i18n'
import { humanize } from '@/shared/lib/format'

/**
 * How a Job's tasks are shown. The backend expands each Workflow Task into several execution segments (checks once per
 * Job, a stop once per stop, a hand-over once per Container; rules/03), so the Job holds more tasks than its workflow
 * does. People think in the workflow's tasks ("Pick up at source rack"), so segments that share a task key are shown
 * as one group, and each group is split into sections that say what is being done.
 */

export type SectionKind = 'checks' | 'stop' | 'handover' | 'recovery' | 'other'

export interface TaskSection {
  kind: SectionKind
  action: 'PICKUP' | 'DROPOFF' | null
  stopEndpointId: string | null
  /** One segment, except for a hand-over, which has one per Container at the same stop. */
  tasks: JobTaskDto[]
}

export type GroupStatus = 'COMPLETED' | 'FAILED' | 'WAITING' | 'RUNNING' | 'PENDING'

export interface TaskGroupModel {
  /** The workflow's task key; a segment without one stands alone. */
  key: string
  /** 1-based position among the workflow's tasks. */
  index: number
  name: string
  sections: TaskSection[]
  steps: JobStepDto[]
  done: number
  status: GroupStatus
}

export interface TaskLabels {
  endpoint: (id: string | null | undefined) => string
  container: (id: string | null | undefined) => string
}

function sectionKind(task: JobTaskDto): SectionKind {
  switch (task.executionScope) {
    case 'ONCE_PER_JOB':
      return 'checks'
    case 'ONCE_PER_STOP':
      return 'stop'
    case 'PER_CONTAINER_AT_STOP':
      return 'handover'
    case 'RECOVERY':
      return 'recovery'
    default:
      return 'other'
  }
}

/** Consecutive hand-overs at one stop are one section: the Containers of that stop, not a task each. */
function sectionsOf(tasks: readonly JobTaskDto[]): TaskSection[] {
  const sections: TaskSection[] = []
  for (const task of tasks) {
    const kind = sectionKind(task)
    const last = sections[sections.length - 1]
    if (kind === 'handover' && last?.kind === 'handover' && last.stopEndpointId === task.stopEndpointId && last.action === task.stopAction) {
      last.tasks.push(task)
    } else {
      sections.push({ kind, action: task.stopAction, stopEndpointId: task.stopEndpointId, tasks: [task] })
    }
  }
  return sections
}

function statusOf(steps: readonly JobStepDto[]): GroupStatus {
  // A step skipped because its Container failed on its own is as finished as a completed one.
  if (steps.length > 0 && steps.every((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED')) return 'COMPLETED'
  if (steps.some((step) => step.status === 'FAILED')) return 'FAILED'
  if (steps.some((step) => step.status === 'WAITING')) return 'WAITING'
  if (steps.some((step) => step.status !== 'PENDING')) return 'RUNNING'
  return 'PENDING'
}

/** The Job's tasks as the workflow's tasks, in the order they first appear. */
export function groupTasks(tasks: readonly JobTaskDto[]): TaskGroupModel[] {
  const byKey = new Map<string, JobTaskDto[]>()
  for (const task of [...tasks].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    const key = task.taskKey || `segment:${task.id}`
    byKey.set(key, [...(byKey.get(key) ?? []), task])
  }
  return [...byKey.entries()].map(([key, segments], position) => {
    const steps = segments.flatMap((task) => task.steps)
    const done = steps.filter((step) => step.status === 'COMPLETED').length
    const first = segments[0]
    return {
      key,
      index: position + 1,
      name: first.taskName || (first.taskKey ? humanize(first.taskKey) : t('Task')),
      sections: sectionsOf(segments),
      steps,
      done,
      status: statusOf(steps),
    }
  })
}

/** Steps are in play when one is the Job's current step or is running, waiting, paused or failed. */
export function stepsAreActive(steps: readonly JobStepDto[], currentStepId: string | null): boolean {
  return steps.some((step) => step.id === currentStepId || ['EXECUTING', 'READY', 'WAITING', 'PAUSED', 'FAILED'].includes(step.status))
}

/** What a section is doing, in words an operator uses. The rack and Container names come from the screen's own labels. */
export function sectionTitle(section: TaskSection, labels: TaskLabels, fallback: string): string {
  switch (section.kind) {
    case 'checks':
      return t('Checks before starting')
    case 'stop': {
      const value = labels.endpoint(section.stopEndpointId)
      if (section.action === 'PICKUP') return t('Go to the pickup rack · {value}', { value })
      if (section.action === 'DROPOFF') return t('Go to the drop-off rack · {value}', { value })
      return t('Go to {value}', { value })
    }
    case 'handover': {
      const count = section.tasks.length
      const unload = section.action === 'DROPOFF'
      // A trip collects several Containers at one stop and delivers them over several: name the stop.
      const at = section.stopEndpointId ? labels.endpoint(section.stopEndpointId) : null
      if (count === 1) {
        const container = labels.container(section.tasks[0].containerId)
        if (at) {
          return unload
            ? t('Unload {container} from the robot at {value}', { container, value: at })
            : t('Load {container} onto the robot at {value}', { container, value: at })
        }
        return unload ? t('Unload {container} from the robot', { container }) : t('Load {container} onto the robot', { container })
      }
      if (at) {
        return unload
          ? t('Deliver {count} containers at {value}', { count, value: at })
          : t('Collect {count} containers at {value}', { count, value: at })
      }
      return unload ? t('Unload {count} containers from the robot', { count }) : t('Load {count} containers onto the robot', { count })
    }
    case 'recovery':
      return t('Recovery robot goes to {value}', { value: labels.endpoint(section.stopEndpointId) })
    default:
      return fallback
  }
}
