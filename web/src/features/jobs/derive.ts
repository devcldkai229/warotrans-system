import type { JobStep, JobView } from '@/shared/api/contracts'
import { secondsBetween } from '@/shared/lib/format'

// Values the Figma design shows but the API does not send: they are derived from Job/JobStep data so they stay
// correct with real responses.

export function allSteps(job: JobView): JobStep[] {
  return job.tasks.flatMap((task) => task.steps)
}

export function stepProgress(job: JobView) {
  const steps = allSteps(job)
  const done = steps.filter((step) => step.status === 'COMPLETED').length
  return {
    done,
    total: steps.length,
    percent: steps.length === 0 ? 0 : Math.round((done / steps.length) * 100),
    /** 1-based number of the step currently in flight (or the last one when everything is done). */
    current: Math.min(done + 1, steps.length),
  }
}

export function elapsedSeconds(job: JobView): number | null {
  return secondsBetween(job.startedAt, job.completedAt)
}

export function waitingStep(job: JobView): JobStep | undefined {
  return allSteps(job).find((step) => step.status === 'WAITING')
}
