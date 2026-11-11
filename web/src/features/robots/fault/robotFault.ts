import {
  assignIssue,
  createIssue,
  listIssues,
  transitionIssue,
  type Issue,
} from '@/shared/api/operations'

/**
 * WEB-FLEET-04: acknowledging a robot's error, recorded as an Issue.
 *
 * What an acknowledgement is: someone saw the error and took it on. It is NOT a resolution: the error ends only when
 * the robot stops reporting it, and nothing here clears it, so a fault the robot still reports stays visible and a
 * safety fault cannot be wiped away by a click.
 *
 * It rides on the Issue lifecycle (reporter, assignee, time, evidence note, audit trail, version checks) because that is
 * what the backend has. An Issue has no field for "which fault", so the link to a fault is a convention in its
 * description, and this has limits the Fleet module could remove with an acknowledgement of its own:
 *  - two people acknowledging at the same instant can create two Issues (the earliest one is the one shown, so both see
 *    the same);
 *  - an error that comes back with the same code while an Issue for it is still open is treated as already acknowledged.
 */

/** Written into the Issue (data, so never translated). The robot's code follows it. */
export const FAULT_MARKER = 'Robot error'
const ACK_PHRASE = ' · acknowledged by '

/** A code with spaces would break the convention, and none of the robot's codes has any. */
function markerCode(code: string): string {
  return code.trim().replace(/\s+/g, '_')
}

/** `Robot error LIDAR_TIMEOUT · acknowledged by Linh Tran` */
export function ackDescription(code: string, fullName: string): string {
  return `${FAULT_MARKER} ${markerCode(code)}${ACK_PHRASE}${fullName.trim()}`
}

const ACK_PATTERN = new RegExp(`^${FAULT_MARKER} (\\S+)${ACK_PHRASE}(.+)$`, 's')

export function parseAckDescription(description: string): { code: string; by: string } | null {
  const match = ACK_PATTERN.exec(description.trim())
  return match ? { code: match[1], by: match[2].trim() } : null
}

const isOpen = (issue: Issue) => issue.status !== 'RESOLVED' && issue.status !== 'CLOSED'

export type FaultAcknowledgement =
  | { state: 'none'; closed: Issue | null }
  /** An Issue was created but never reached ACKNOWLEDGED (the second step failed, or it was reopened). */
  | { state: 'pending'; issue: Issue }
  | { state: 'acknowledged'; issue: Issue; by: string | null; reason: string | null }

/**
 * The acknowledgement of the robot's current error among its Issues: the earliest open Issue written for this code, so
 * everyone looking sees the same one. `closed` is the latest finished one, shown when the error outlived it.
 */
export function findAcknowledgement(issues: readonly Issue[], robotId: string, code: string): FaultAcknowledgement {
  const wanted = markerCode(code)
  const mine = issues.filter((issue) => issue.robotId === robotId && issue.issueType === 'ROBOT' && parseAckDescription(issue.description)?.code === wanted)

  const open = mine.filter(isOpen).sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))[0]
  if (open) {
    if (open.status === 'OPEN') return { state: 'pending', issue: open }
    return {
      state: 'acknowledged',
      issue: open,
      by: parseAckDescription(open.description)?.by ?? null,
      reason: open.evidence.find((item) => item.kind === 'NOTE')?.note ?? null,
    }
  }

  const closed = mine.filter((issue) => !isOpen(issue)).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0] ?? null
  return { state: 'none', closed }
}

export interface AcknowledgeDeps {
  listIssues: typeof listIssues
  createIssue: typeof createIssue
  assignIssue: typeof assignIssue
  transitionIssue: typeof transitionIssue
}

const REAL: AcknowledgeDeps = { listIssues, createIssue, assignIssue, transitionIssue }

export interface AcknowledgeArgs {
  robotId: string
  code: string
  /** The person acknowledging. */
  accountId: string
  fullName: string
  reason: string
}

/**
 * Acknowledges the error: finds (or creates) the Issue, gives it to the person and moves it to ACKNOWLEDGED.
 * It looks again right before acting, so a click that comes after someone else's does nothing twice; and a half-done
 * attempt (the Issue exists but was never acknowledged) is finished instead of repeated.
 * Rejects with the API's own error (`issue_version_conflict`, `issue_transition_not_allowed` …).
 */
export async function acknowledgeFault(args: AcknowledgeArgs, deps: AcknowledgeDeps = REAL): Promise<Issue> {
  const fresh = await deps.listIssues({ robotId: args.robotId, take: 50 })
  const found = findAcknowledgement(fresh.items, args.robotId, args.code)
  if (found.state === 'acknowledged') return found.issue

  const reason = args.reason.trim()
  let issue =
    found.state === 'pending'
      ? found.issue
      : await deps.createIssue({
          issueType: 'ROBOT',
          // Not the alarm an operator's own report of a broken robot would be: the robot already raised its own alert.
          severity: 'MEDIUM',
          description: ackDescription(args.code, args.fullName),
          robotId: args.robotId,
          evidence: reason ? [{ kind: 'NOTE', note: reason }] : undefined,
        })

  if (issue.assigneeId !== args.accountId) issue = await deps.assignIssue(issue, args.accountId)
  if (issue.status === 'OPEN') issue = await deps.transitionIssue(issue, 'ACKNOWLEDGED')
  return issue
}
