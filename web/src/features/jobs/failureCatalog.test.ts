import { afterEach, describe, expect, it } from 'vitest'
import { setLanguageForTests } from '@/shared/i18n'
import { explainFailureCode, explainJobProblem, failureTitle, knownFailureCodes } from './failureCatalog'

afterEach(() => setLanguageForTests('en'))

/**
 * Every failure code the backend writes onto a Job, a step or an assignment (WorkflowExecution's JobExecutionEngine,
 * Fleet's RobotCommand / AssignmentEndReason, and the domain exceptions that carry a code into a failed step).
 * A code added there needs an entry in the catalog.
 */
const BACKEND_CODES = [
  'operator_paused', 'request_cancelled_cargo_onboard', 'job_cancelled',
  'ROBOT_OFFLINE', 'ROBOT_REJECTED', 'ACK_TIMEOUT', 'NAVIGATION_BLOCKED', 'HUMAN_CONFIRM_TIMEOUT',
  'check_failed_robot_ready', 'check_failed_battery_min', 'check_failed_endpoint_available', 'check_failed_load_state',
  'check_failed_request_active', 'check_failed_inventory_available',
  'input_resolution_failed', 'wait_duration_invalid', 'step_type_not_supported', 'endpoint_unavailable', 'robot_not_found',
  'semantic_map_unavailable', 'semantic_map_mismatch', 'semantic_policy_unavailable', 'semantic_policy_in_use',
  'traffic_robot_unavailable', 'navigate_rejected', 'traffic_graph_unavailable', 'traffic_graph_in_use',
  'traffic_path_unavailable', 'traffic_grant_rejected', 'shadow_single_mover', 'traffic_nodes_unresolved', 'station_bay_unavailable',
  'robot_offline', 'robot_busy', 'robot_disabled', 'robot_in_maintenance', 'robot_in_manual_mode', 'robot_motion_held',
  'robot_map_mismatch', 'robot_not_available', 'robot_not_localized', 'robot_telemetry_stale', 'robot_assigned_to_other_job',
  'robot_not_at_home', 'robot_home_not_on_map', 'robot_required', 'job_plan_invalid', 'job_not_startable',
]

describe('failure catalog', () => {
  it('explains every code the backend writes', () => {
    const unknown = BACKEND_CODES.filter((code) => !explainFailureCode(code)?.known)

    expect(unknown).toEqual([])
  })

  it('names who acts and what to do for every entry (only a cancelled job needs nobody)', () => {
    for (const code of knownFailureCodes()) {
      const problem = explainFailureCode(code)!
      expect(problem.title, code).not.toBe('')
      expect(problem.next, code).not.toBe('')
      if (code !== 'job_cancelled') expect(problem.owners.length, code).toBeGreaterThan(0)
    }
  })

  it('finds a code whatever its case, since the backend writes ROBOT_OFFLINE and robot_offline', () => {
    expect(explainFailureCode('ROBOT_OFFLINE')?.title).toBe(explainFailureCode('robot_offline')?.title)
  })

  it('treats a check this catalog has not met yet as a failed check, and any other code as unknown but still helpful', () => {
    expect(explainFailureCode('check_failed_something_new')).toMatchObject({ known: true, title: 'A check before the move failed' })

    const unknown = explainFailureCode('mystery_code')!
    expect(unknown).toMatchObject({ known: false, code: 'mystery_code', title: 'The system reported a problem' })
    expect(unknown.next).not.toBe('')
    expect(explainFailureCode(null)).toBeNull()
    expect(explainFailureCode('  ')).toBeNull()
  })

  it('says whether it is worth running the job again', () => {
    expect(explainFailureCode('shadow_single_mover')?.retry).toBe('Safe to run again now.')
    expect(explainFailureCode('check_failed_battery_min')?.retry).toBe('Run it again only after the cause is fixed.')
    expect(explainFailureCode('input_resolution_failed')?.retry).toBe('Running it again will not help: change the request or the workflow.')
    expect(explainFailureCode('operator_paused')?.retry).toBeNull()
  })

  it('words a Job by its code, or by its state when it is stuck without one', () => {
    expect(explainJobProblem({ status: 'FAILED', failureCode: 'check_failed_battery_min' })).toMatchObject({
      title: 'The battery is too low',
      tone: 'red',
      owners: ['Staff', 'Technician'],
    })
    expect(explainJobProblem({ status: 'REASSIGNING', failureCode: null })).toMatchObject({ title: 'Needs another robot', tone: 'amber', code: null })
    expect(explainJobProblem({ status: 'RECOVERY_REQUIRED', failureCode: null })?.owners).toEqual(['Admin'])
    expect(explainJobProblem({ status: 'CANCELLED', failureCode: 'job_cancelled' })?.tone).toBe('grey')
  })

  it('does not raise an alarm for a Job that is new, running or done', () => {
    expect(explainJobProblem({ status: 'CREATED', failureCode: null })?.tone).toBe('grey')
    expect(explainJobProblem({ status: 'RUNNING', failureCode: null })).toBeNull()
    expect(explainJobProblem({ status: 'COMPLETED', failureCode: null })).toBeNull()
  })

  it('gives the short title of a known code and leaves an unknown one as written', () => {
    expect(failureTitle('check_failed_battery_min')).toBe('The battery is too low')
    expect(failureTitle('mystery_code')).toBe('mystery_code')
    expect(failureTitle('UNKNOWN')).toBe('Unknown')
  })

  it('is worded in Vietnamese', () => {
    setLanguageForTests('vi')

    const problem = explainJobProblem({ status: 'FAILED', failureCode: 'check_failed_battery_min' })!
    expect(problem.title).toBe('Pin quá yếu')
    expect(problem.owners).toEqual(['Nhân viên', 'Kỹ thuật viên'])
    expect(problem.next).toBe('Hãy sạc robot, hoặc chạy công việc trên robot còn nhiều pin hơn.')
    expect(problem.retry).toBe('Chỉ chạy lại sau khi đã khắc phục nguyên nhân.')
  })
})
