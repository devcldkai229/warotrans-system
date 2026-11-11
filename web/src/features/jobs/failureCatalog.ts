import type { JobStatus } from '@/shared/api/contracts'
import { msg, t } from '@/shared/i18n'

/**
 * SY-08: what a Job's failure code means to the person looking at it. The backend writes a machine code (a step's
 * ErrorCode, or one of a few codes the engine sets on the Job itself); this turns it into plain words, says who has to
 * act and what is safe to do next, so a blocked Job never shows only `check_failed_battery_min`.
 *
 * It is a catalog on the web side: the backend has no `retryable` / `nextAction` contract yet. The coverage test lists
 * every code the backend writes, so a code added there without an entry here is noticed.
 */
export type FailureOwner = 'ADMIN' | 'TECHNICIAN' | 'STAFF' | 'SYSTEM'
/** NOW: run it again as it is. AFTER_FIX: only once the cause is fixed. NEVER: it fails the same way again. */
export type RetryAdvice = 'NOW' | 'AFTER_FIX' | 'NEVER'

interface Entry {
  title: string
  meaning: string
  owners: FailureOwner[]
  next: string
  retry?: RetryAdvice
}

const entry = (title: string, meaning: string, owners: FailureOwner[], next: string, retry?: RetryAdvice): Entry => ({
  title,
  meaning,
  owners,
  next,
  retry,
})

/** Keyed by the lower-cased code (the backend writes ROBOT_OFFLINE for an assignment and robot_offline for a check). */
const CATALOG: Record<string, Entry> = {
  // What a person or the request did to the Job
  operator_paused: entry(
    msg('Paused by an operator'),
    msg('An operator paused this job on purpose. It will not move until someone resumes it.'),
    ['ADMIN', 'STAFF'],
    msg('Resume it from this page when the reason no longer applies.'),
  ),
  request_cancelled_cargo_onboard: entry(
    msg('Request cancelled with cargo on the robot'),
    msg('The request was cancelled while containers were still on the robot, so the job is held instead of dropping them anywhere.'),
    ['STAFF', 'ADMIN'],
    msg('Unload the containers and cancel the job, or resume it to deliver them.'),
  ),
  job_cancelled: entry(
    msg('Cancelled'),
    msg('The job was cancelled on purpose.'),
    [],
    msg('Nothing to do. Create a new request if the move is still needed.'),
  ),

  // The robot or its connection
  robot_offline: entry(
    msg('The robot went offline'),
    msg('The robot stopped answering (no heartbeat) while it had this job.'),
    ['TECHNICIAN'],
    msg('Check the robot\'s power and network. When it is back, resume the job; otherwise assign it to another robot.'),
    'AFTER_FIX',
  ),
  robot_rejected: entry(
    msg('The robot refused the order'),
    msg('The robot answered but would not accept the command, for example because it was busy, stopped or not localized.'),
    ['TECHNICIAN'],
    msg('Open the robot to see its state and fix it, then assign the job again.'),
    'AFTER_FIX',
  ),
  ack_timeout: entry(
    msg('The robot did not answer'),
    msg('The robot did not acknowledge the command in time.'),
    ['TECHNICIAN'],
    msg('Check the robot\'s connection (network, MQTT), then assign the job again.'),
    'AFTER_FIX',
  ),
  navigation_blocked: entry(
    msg('The robot\'s path is blocked'),
    msg('The robot could not find or keep a free path to its goal.'),
    ['STAFF', 'TECHNICIAN'],
    msg('Clear the obstacle in the aisle, then resume the job. If it keeps happening, report an issue.'),
    'AFTER_FIX',
  ),
  human_confirm_timeout: entry(
    msg('Nobody confirmed in time'),
    msg('A step needed a person to confirm it on the floor and nobody did.'),
    ['STAFF'],
    msg('Confirm the step in the mobile app, or cancel the job.'),
    'AFTER_FIX',
  ),
  robot_busy: entry(
    msg('The robot is busy'),
    msg('The robot still has a command in progress.'),
    ['SYSTEM'],
    msg('Wait a moment and run the job again, or use another robot.'),
    'NOW',
  ),
  robot_disabled: entry(
    msg('The robot is disabled'),
    msg('An administrator turned this robot off, so it takes no jobs.'),
    ['ADMIN'],
    msg('Enable the robot in Fleet, or run the job on another robot.'),
    'AFTER_FIX',
  ),
  robot_in_maintenance: entry(
    msg('The robot is in maintenance'),
    msg('The robot is out of service for maintenance.'),
    ['TECHNICIAN'],
    msg('Finish the maintenance and return the robot to service, or use another robot.'),
    'AFTER_FIX',
  ),
  robot_in_manual_mode: entry(
    msg('The robot is being driven by hand'),
    msg('Someone holds the manual-drive lease of this robot.'),
    ['TECHNICIAN'],
    msg('Wait until the driver is done, or use another robot.'),
    'AFTER_FIX',
  ),
  robot_motion_held: entry(
    msg('The robot is stopped'),
    msg('After a stop the robot holds still until someone lets it move again.'),
    ['TECHNICIAN', 'STAFF'],
    msg('Check that it is safe, resume the robot from Fleet, then run the job again.'),
    'AFTER_FIX',
  ),
  robot_map_mismatch: entry(
    msg('The robot is on another map'),
    msg('The robot is on a different map version than the job.'),
    ['ADMIN', 'TECHNICIAN'],
    msg('Put the robot on the job\'s map in Fleet, or use another robot.'),
    'AFTER_FIX',
  ),
  robot_not_available: entry(
    msg('The robot is not available'),
    msg('The robot is offline, disabled or busy.'),
    ['TECHNICIAN'],
    msg('Open the robot, fix what it reports, then run the job again.'),
    'AFTER_FIX',
  ),
  robot_not_localized: entry(
    msg('The robot does not know where it is'),
    msg('The robot has no reliable position on the map.'),
    ['TECHNICIAN'],
    msg('Localize the robot, then run the job again.'),
    'AFTER_FIX',
  ),
  robot_telemetry_stale: entry(
    msg('The robot\'s position is unknown'),
    msg('The robot has sent no recent position, so it cannot be moved safely.'),
    ['TECHNICIAN'],
    msg('Check the robot\'s connection, then run the job again.'),
    'AFTER_FIX',
  ),
  robot_assigned_to_other_job: entry(
    msg('The robot is busy with another job'),
    msg('This robot is already running a different job.'),
    ['SYSTEM'],
    msg('Choose another robot, or wait until it is free.'),
    'NOW',
  ),
  robot_not_at_home: entry(
    msg('The robot is not at its home point'),
    msg('The job needs the robot to start from its home point.'),
    ['TECHNICIAN'],
    msg('Move the robot to its home point, then run the job again.'),
    'AFTER_FIX',
  ),
  robot_home_not_on_map: entry(
    msg('The robot\'s home point is not on this map'),
    msg('The home point set for the robot is not on the map the job runs on.'),
    ['ADMIN'],
    msg('Set a home point on the job\'s map for the robot, or use another robot.'),
    'AFTER_FIX',
  ),
  robot_required: entry(
    msg('The job has no robot'),
    msg('No robot has been chosen for this job.'),
    ['ADMIN', 'STAFF'],
    msg('Choose a robot and run the job.'),
    'NOW',
  ),
  robot_not_found: entry(
    msg('The robot no longer exists'),
    msg('The robot record this job was using is missing.'),
    ['ADMIN'],
    msg('Assign the job to another robot.'),
    'AFTER_FIX',
  ),

  // Checks the workflow makes before moving (check_failed_<condition>)
  check_failed_robot_ready: entry(
    msg('The robot was not ready'),
    msg('Before the move the robot was offline, disabled, in maintenance, stopped or not localized.'),
    ['TECHNICIAN'],
    msg('Open the robot, fix what it reports, then run the job again.'),
    'AFTER_FIX',
  ),
  check_failed_battery_min: entry(
    msg('The battery is too low'),
    msg('The robot\'s battery was below the minimum this workflow needs, or its level is unknown.'),
    ['STAFF', 'TECHNICIAN'],
    msg('Charge the robot, or run the job on a robot with more battery.'),
    'AFTER_FIX',
  ),
  check_failed_endpoint_available: entry(
    msg('The pickup or drop-off point is unavailable'),
    msg('The point is disabled, missing from the job\'s map or occupied.'),
    ['ADMIN', 'STAFF'],
    msg('Enable or free the endpoint on Facility, then run the job again.'),
    'AFTER_FIX',
  ),
  check_failed_load_state: entry(
    msg('The robot\'s load is not what the step expects'),
    msg('The robot carries something it should not, or nothing when it should carry a container.'),
    ['STAFF', 'TECHNICIAN'],
    msg('Check what is on the robot and clear it, then run the job again.'),
    'AFTER_FIX',
  ),
  check_failed_request_active: entry(
    msg('The request is no longer active'),
    msg('The transport request was cancelled or finished while this job was waiting.'),
    ['ADMIN'],
    msg('Nothing to retry. Create a new request if the move is still needed.'),
    'NEVER',
  ),
  check_failed_inventory_available: entry(
    msg('The stock is not available'),
    msg('The product is not in stock where the request wants to take it from.'),
    ['STAFF'],
    msg('Check the stock and the receiving, then create the request again.'),
    'AFTER_FIX',
  ),
  check_failed: entry(
    msg('A check before the move failed'),
    msg('The workflow checks the situation before it moves and one check did not pass.'),
    ['ADMIN'],
    msg('Open the failed step to see what it checked.'),
    'AFTER_FIX',
  ),

  // The workflow itself (a configuration problem: running again fails the same way)
  input_resolution_failed: entry(
    msg('A step\'s inputs could not be worked out'),
    msg('The workflow asks for a value (a variable or a bound field) that this job cannot provide.'),
    ['ADMIN'],
    msg('Fix the workflow\'s variables and bindings. Running it again will fail the same way.'),
    'NEVER',
  ),
  wait_duration_invalid: entry(
    msg('A wait step has an invalid time'),
    msg('The wait step\'s duration is outside the allowed range.'),
    ['ADMIN'],
    msg('Edit the workflow and publish a new version.'),
    'NEVER',
  ),
  step_type_not_supported: entry(
    msg('A step type is not supported'),
    msg('The workflow uses a kind of step the system cannot run yet.'),
    ['ADMIN'],
    msg('Edit the workflow to remove it, or report an issue.'),
    'NEVER',
  ),
  job_plan_invalid: entry(
    msg('The job\'s plan is invalid'),
    msg('The job could not be planned from its request and workflow.'),
    ['ADMIN'],
    msg('Report an issue, then create the request again.'),
    'NEVER',
  ),
  job_not_startable: entry(
    msg('The job cannot be started now'),
    msg('The job is already running, or it has finished or been cancelled.'),
    ['ADMIN', 'STAFF'],
    msg('Open the job to see its state.'),
    'NEVER',
  ),

  // The map and the traffic service
  endpoint_unavailable: entry(
    msg('The destination point is unavailable'),
    msg('The point is missing, disabled or not on this job\'s map.'),
    ['ADMIN'],
    msg('Enable the endpoint on Facility, or choose another one in the request.'),
    'AFTER_FIX',
  ),
  semantic_map_unavailable: entry(
    msg('The navigation map is not loaded'),
    msg('The traffic service has no semantic map for this job.'),
    ['ADMIN'],
    msg('Check the traffic settings and that the map is published, then run the job again.'),
    'AFTER_FIX',
  ),
  semantic_map_mismatch: entry(
    msg('The navigation map is for another version'),
    msg('The loaded semantic map is not the map version this job runs on.'),
    ['ADMIN'],
    msg('Load the semantic map of the published version, then run the job again.'),
    'AFTER_FIX',
  ),
  semantic_policy_unavailable: entry(
    msg('The map\'s traffic rules could not be loaded'),
    msg('The zones and single-occupancy rules of the map failed to load.'),
    ['ADMIN'],
    msg('Publish the map again. If it keeps failing, report an issue.'),
    'AFTER_FIX',
  ),
  semantic_policy_in_use: entry(
    msg('The map\'s traffic rules are in use'),
    msg('Other robots still use the current rules, so they cannot be switched now.'),
    ['ADMIN'],
    msg('Wait until the other robots finish, then run the job again.'),
    'AFTER_FIX',
  ),
  traffic_robot_unavailable: entry(
    msg('Traffic control cannot use this robot'),
    msg('The robot has no recent position, or it is quarantined.'),
    ['TECHNICIAN'],
    msg('Check the robot\'s localization and connection, then run the job again.'),
    'AFTER_FIX',
  ),
  navigate_rejected: entry(
    msg('The robot refused to navigate'),
    msg('The robot rejected the move order.'),
    ['TECHNICIAN'],
    msg('Open the robot to see why and fix it, then run the job again.'),
    'AFTER_FIX',
  ),
  traffic_graph_unavailable: entry(
    msg('The traffic graph is missing'),
    msg('The map has no compiled traffic graph.'),
    ['ADMIN'],
    msg('Check the map\'s topology on Facility, then run the job again.'),
    'AFTER_FIX',
  ),
  traffic_graph_in_use: entry(
    msg('The traffic graph is in use'),
    msg('Other robots hold resources on another graph, so it cannot be switched now.'),
    ['ADMIN'],
    msg('Wait until they finish, then run the job again.'),
    'AFTER_FIX',
  ),
  traffic_path_unavailable: entry(
    msg('There is no route to the destination'),
    msg('The traffic service found no path from the robot to the target.'),
    ['ADMIN', 'TECHNICIAN'],
    msg('Check that the robot and the target are connected on the map and that no zone blocks them, then run the job again.'),
    'AFTER_FIX',
  ),
  traffic_grant_rejected: entry(
    msg('The route was not granted'),
    msg('Another robot holds part of the route.'),
    ['SYSTEM'],
    msg('Run the job again in a moment. If it keeps happening, report an issue.'),
    'NOW',
  ),
  shadow_single_mover: entry(
    msg('Only one robot may move at a time'),
    msg('The traffic service is in shadow mode and another robot is moving.'),
    ['SYSTEM'],
    msg('Run the job again when the other robot has finished.'),
    'NOW',
  ),
  traffic_nodes_unresolved: entry(
    msg('The start or the goal is not on the route map'),
    msg('The robot\'s position or the target could not be placed on the traffic graph.'),
    ['TECHNICIAN'],
    msg('Localize the robot again or check the endpoint on the map, then run the job again.'),
    'AFTER_FIX',
  ),
  station_bay_unavailable: entry(
    msg('The station bay is busy'),
    msg('The bay could not be reserved for this job.'),
    ['SYSTEM'],
    msg('Run the job again in a moment.'),
    'NOW',
  ),
}

/** For a code with no entry: still tells the person what to do. */
const UNKNOWN: Entry = entry(
  msg('The system reported a problem'),
  msg('This failure has no plain-language description yet.'),
  ['ADMIN'],
  msg('Open the failed step for the details. If it repeats, report an issue.'),
)

/** For a Job that is stuck but has no failure code: what its state means. */
const BY_STATUS: Partial<Record<JobStatus, Entry>> = {
  CREATED: entry(
    msg('Waiting to be started'),
    msg('The job is planned but no robot is running it yet.'),
    ['ADMIN', 'STAFF'],
    msg('Run it on a robot from this page.'),
  ),
  QUEUED: entry(
    msg('Waiting to be started'),
    msg('The job is planned but no robot is running it yet.'),
    ['ADMIN', 'STAFF'],
    msg('Run it on a robot from this page.'),
  ),
  PAUSED: entry(
    msg('Paused'),
    msg('The job is paused and will not move.'),
    ['ADMIN', 'STAFF'],
    msg('Resume it, or cancel it, from this page.'),
  ),
  REASSIGNING: entry(
    msg('Needs another robot'),
    msg('The robot could not finish this job.'),
    ['ADMIN', 'STAFF'],
    msg('Assign the job to a different robot from this page.'),
  ),
  RECOVERY_REQUIRED: entry(
    msg('Needs recovery'),
    msg('The job lost its robot and cargo may still be on board.'),
    ['ADMIN'],
    msg('Find where the cargo is and recover it, then decide whether to cancel or resume the job.'),
  ),
}

const OWNER_LABEL: Record<FailureOwner, string> = {
  ADMIN: msg('Admin'),
  TECHNICIAN: msg('Technician'),
  STAFF: msg('Staff'),
  SYSTEM: msg('The system'),
}

const RETRY_TEXT: Record<RetryAdvice, string> = {
  NOW: msg('Safe to run again now.'),
  AFTER_FIX: msg('Run it again only after the cause is fixed.'),
  NEVER: msg('Running it again will not help: change the request or the workflow.'),
}

export type ProblemTone = 'red' | 'amber' | 'grey'

export interface JobProblem {
  /** The machine code, kept for support; null when the problem comes from the Job's state alone. */
  code: string | null
  title: string
  meaning: string
  /** Who has to act, in the interface language. Empty when nobody has to. */
  owners: string[]
  next: string
  retry: string | null
  /** False when the code has no catalog entry and the generic wording is shown. */
  known: boolean
  tone: ProblemTone
}

function toProblem(code: string | null, source: Entry, known: boolean, tone: ProblemTone): JobProblem {
  return {
    code,
    title: t(source.title),
    meaning: t(source.meaning),
    owners: source.owners.map((owner) => t(OWNER_LABEL[owner])),
    next: t(source.next),
    retry: source.retry ? t(RETRY_TEXT[source.retry]) : null,
    known,
    tone,
  }
}

function lookup(code: string): { source: Entry; known: boolean } {
  const key = code.trim().toLowerCase()
  const direct = CATALOG[key]
  if (direct) return { source: direct, known: true }
  // A check this catalog has not met yet still says it was a check.
  if (key.startsWith('check_failed')) return { source: CATALOG.check_failed, known: true }
  return { source: UNKNOWN, known: false }
}

/** What a failure code (a Job's, or a step's error code) means; null when there is no code. */
export function explainFailureCode(code: string | null | undefined, tone: ProblemTone = 'red'): JobProblem | null {
  if (!code || !code.trim()) return null
  const { source, known } = lookup(code)
  return toProblem(code, source, known, tone)
}

/**
 * The problem a Job shows: its failure code in plain words, or what its state means when it is stuck without a code.
 * A finished or running Job has none.
 */
export function explainJobProblem(job: { status: JobStatus; failureCode: string | null }): JobProblem | null {
  // A new Job that has simply not been started yet is news, not an alarm.
  const notStarted = !job.failureCode && (job.status === 'CREATED' || job.status === 'QUEUED')
  const tone: ProblemTone = job.status === 'CANCELLED' || notStarted ? 'grey' : job.status === 'FAILED' ? 'red' : 'amber'
  if (job.failureCode) return explainFailureCode(job.failureCode, tone)
  const byStatus = BY_STATUS[job.status]
  return byStatus ? toProblem(null, byStatus, true, tone) : null
}

/** The short form (a table cell, a notification): the title when the code is known, else the code as it is. */
export function failureTitle(code: string): string {
  // The statistics group Jobs that carry no code under UNKNOWN.
  if (code.toUpperCase() === 'UNKNOWN') return t('Unknown')
  const problem = explainFailureCode(code)
  return problem && problem.known ? problem.title : code
}

/** Every code the catalog describes (the coverage test checks the backend's codes against it). */
export function knownFailureCodes(): string[] {
  return Object.keys(CATALOG)
}
