import type { Issue, IssueStatus } from '@/shared/api/operations'
import type { JobDetailDto, JobStepDto } from '@/shared/api/jobs'

export type HandoverKind = 'PICKUP_CONFIRM' | 'DROPOFF_CONFIRM'

/** One handover of a container as the Job recorded it: done (who, when, how) or still to come. */
export interface HandoverView {
  stepId: string
  status: string
  confirmedAt: string | null
  confirmedBy: string | null
  /** STAFF_APP, ROBOT_BUTTON … */
  source: string | null
  scannedBarcode: string | null
  note: string | null
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)

function stepContainer(step: JobStepDto): string | null {
  return text(step.resolvedInputs.containerId)
}

/** The pickup or drop-off of that container: its confirmation step and what the confirmation recorded. */
export function handoverOf(job: JobDetailDto, containerId: string, kind: HandoverKind): HandoverView | null {
  const step = job.tasks
    .flatMap((task) => task.steps)
    .find((s) => s.operationCode === kind && stepContainer(s) === containerId)
  if (!step) return null
  const out = step.outputValues
  return {
    stepId: step.id,
    status: step.status,
    confirmedAt: step.status === 'COMPLETED' ? (text(out.confirmedAt) ?? step.completedAt) : null,
    confirmedBy: step.confirmedByName ?? null,
    source: text(out.confirmationSource),
    scannedBarcode: text(out.scannedBarcode),
    note: text(out.note),
  }
}

export const OPEN_ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']

export function isOpenIssue(issue: Pick<Issue, 'status'>): boolean {
  return OPEN_ISSUE_STATUSES.includes(issue.status)
}

/** An open WRONG / MISSING issue: the handover of that container cannot be confirmed until it is resolved. */
export function isBlocking(issue: Pick<Issue, 'status' | 'blocksHandover'>): boolean {
  return Boolean(issue.blocksHandover) && isOpenIssue(issue)
}

/** The issues about that container: blocking first, then the other open ones, then the closed, newest first in each. */
export function issuesOf(issues: Issue[], containerId: string): Issue[] {
  const rank = (issue: Issue) => (isBlocking(issue) ? 0 : isOpenIssue(issue) ? 1 : 2)
  return issues
    .filter((issue) => issue.containerId === containerId)
    .sort((a, b) => rank(a) - rank(b) || b.reportedAt.localeCompare(a.reportedAt))
}

/** How many issues of the Job are still open, and how many of them block a confirmation. */
export function issueCounts(issues: Issue[]): { open: number; blocking: number } {
  return { open: issues.filter(isOpenIssue).length, blocking: issues.filter(isBlocking).length }
}
