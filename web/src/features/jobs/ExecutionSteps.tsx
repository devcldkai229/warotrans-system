import { useState, type ReactNode } from 'react'
import type { JobStepDto, JobTaskDto } from '@/shared/api/jobs'
import { t } from '@/shared/i18n'
import { humanize } from '@/shared/lib/format'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import {
  sectionTitle,
  stepsAreActive,
  type GroupStatus,
  type TaskGroupModel,
  type TaskLabels,
  type TaskSection,
} from './taskGroups'

const GROUP_TONE: Record<GroupStatus, Tone> = { COMPLETED: 'green', FAILED: 'red', WAITING: 'amber', RUNNING: 'blue', PENDING: 'grey' }

interface ExecutionStepsProps {
  groups: TaskGroupModel[]
  currentStepId: string | null
  labels: TaskLabels
  renderStep: (step: JobStepDto) => ReactNode
}

/**
 * The steps of a Job, as the workflow's tasks: "1. Pick up at source rack", "2. Deliver at destination rack". Inside a
 * task, each section says what is being done (checks, going to a rack, loading a Container). A group that is done folds
 * up and the one in play opens by itself, so the screen follows the Job.
 */
export function ExecutionSteps({ groups, currentStepId, labels, renderStep }: ExecutionStepsProps) {
  return (
    <>
      {groups.map((group) => (
        <Group key={group.key} group={group} currentStepId={currentStepId} labels={labels} renderStep={renderStep} />
      ))}
    </>
  )
}

/** Open while in play, and again whenever it becomes the one in play. */
function useOpenWhileActive(active: boolean) {
  const [open, setOpen] = useState(active)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setOpen(true)
  }
  return [open, setOpen] as const
}

function Group({ group, currentStepId, labels, renderStep }: { group: TaskGroupModel } & Omit<ExecutionStepsProps, 'groups'>) {
  const [open, setOpen] = useOpenWhileActive(stepsAreActive(group.steps, currentStepId))

  return (
    <div className="mt-3 first:mt-6">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-container-high"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} className="text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">
            {group.index}. {group.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{t('{done} of {total} steps', { done: group.done, total: group.steps.length })}</span>
        </span>
        <StatusBadge tone={GROUP_TONE[group.status]} surface>
          {humanize(group.status)}
        </StatusBadge>
      </button>
      {open ? (
        <div className="mt-1 mb-2 flex flex-col gap-1.5">
          {group.sections.map((section, position) => (
            <Section key={`${section.kind}-${position}`} section={section} fallback={group.name} currentStepId={currentStepId} labels={labels} renderStep={renderStep} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Section({
  section,
  fallback,
  currentStepId,
  labels,
  renderStep,
}: { section: TaskSection; fallback: string } & Omit<ExecutionStepsProps, 'groups'>) {
  // Several Containers at one stop: each is a row of its own that opens when it is the one in play.
  const several = section.kind === 'handover' && section.tasks.length > 1
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="mt-2 px-1 text-sm text-ink-2">{sectionTitle(section, labels, fallback)}</h4>
      {several
        ? section.tasks.map((task) => <Container key={task.id} task={task} currentStepId={currentStepId} labels={labels} renderStep={renderStep} />)
        : section.tasks.flatMap((task) => task.steps).map((step) => <div key={step.id}>{renderStep(step)}</div>)}
    </section>
  )
}

function Container({ task, currentStepId, labels, renderStep }: { task: JobTaskDto } & Omit<ExecutionStepsProps, 'groups'>) {
  const [open, setOpen] = useOpenWhileActive(stepsAreActive(task.steps, currentStepId))
  const done = task.steps.filter((step) => step.status === 'COMPLETED').length
  const failed = task.steps.some((step) => step.status === 'FAILED')
  const waiting = task.steps.some((step) => step.status === 'WAITING')
  const tone: Tone = failed ? 'red' : waiting ? 'amber' : done === task.steps.length ? 'green' : 'blue'

  return (
    <div className="rounded-md border border-outline-soft">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-container-high"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
        <span className="min-w-0 flex-1 truncate">{labels.container(task.containerId)}</span>
        <span className="text-xs text-muted">{t('{done} of {total} steps', { done, total: task.steps.length })}</span>
        <StatusBadge tone={tone} surface>
          {failed ? humanize('FAILED') : waiting ? humanize('WAITING') : humanize(task.status)}
        </StatusBadge>
      </button>
      {open ? <div className="flex flex-col gap-1.5 px-1.5 pb-1.5">{task.steps.map((step) => <div key={step.id}>{renderStep(step)}</div>)}</div> : null}
    </div>
  )
}
