import { describe, expect, it } from 'vitest'
import type { OperationMetadata, StepInputBinding, WorkflowStepDraft, WorkflowTaskDraft, WorkflowVariable } from '@/shared/api/types'
import { describeBinding, inputRows, valueText, variableValue } from './readOnlyView'

function step(overrides: Partial<WorkflowStepDraft> = {}): WorkflowStepDraft {
  return {
    stepKey: 'MOVE_PICKUP',
    name: 'Move to inbound dock',
    stepType: 'MOVE',
    sequenceNo: 1,
    operationCode: 'PICKUP',
    inputBindings: {},
    timeoutSeconds: 60,
    maxAttempts: 1,
    retryBackoffSeconds: 0,
    onFailure: 'FAIL_JOB',
    ...overrides,
  } as WorkflowStepDraft
}

const tasks: WorkflowTaskDraft[] = [
  { taskKey: 'RECEIVE', name: 'Receive', sequenceNo: 1, steps: [step(), step({ stepKey: 'CHECK_READY', name: 'Check robot is ready' })] },
]

const variables = [
  { key: 'minBatteryPercent', name: 'Minimum battery (%)', dataType: 'DECIMAL', source: 'ADMIN_INPUT', isRequired: true, configuredValue: 25 },
  { key: 'jobId', name: 'jobId', dataType: 'UUID', source: 'SYSTEM_VALUE', isRequired: true },
] as WorkflowVariable[]

const binding = (value: Partial<StepInputBinding>) => value as StepInputBinding

describe('describeBinding', () => {
  it('says a workflow variable by key, with its name when the name says more', () => {
    expect(describeBinding(binding({ sourceType: 'WORKFLOW_VAR', sourceReference: 'minBatteryPercent' }), tasks, variables)).toBe(
      'Workflow variable minBatteryPercent (Minimum battery (%))',
    )
    expect(describeBinding(binding({ sourceType: 'WORKFLOW_VAR', sourceReference: 'jobId' }), tasks, variables)).toBe('Workflow variable jobId')
  })

  it('still shows a variable the workflow no longer declares, as written', () => {
    expect(describeBinding(binding({ sourceType: 'WORKFLOW_VAR', sourceReference: 'gone' }), tasks, variables)).toBe('Workflow variable gone')
  })

  it('says a runtime movement path', () => {
    expect(describeBinding(binding({ sourceType: 'CURRENT_MOVEMENT', sourceReference: 'source.endpointId' }), tasks, variables)).toBe(
      'Current movement · source.endpointId',
    )
  })

  it('names the step an output comes from, falling back to its key', () => {
    expect(describeBinding(binding({ sourceType: 'STEP_OUTPUT', sourceReference: 'CHECK_READY', outputKey: 'robotId' }), tasks, variables)).toBe(
      'Output robotId of "Check robot is ready"',
    )
    expect(describeBinding(binding({ sourceType: 'STEP_OUTPUT', sourceReference: 'GONE_STEP', outputKey: 'x' }), tasks, variables)).toBe('Output x of "GONE_STEP"')
  })

  it('shows a constant, and an empty one as a dash instead of nothing', () => {
    expect(describeBinding(binding({ sourceType: 'CONSTANT', constantValue: 'PICKUP' }), tasks, variables)).toBe('Constant · PICKUP')
    expect(describeBinding(binding({ sourceType: 'CONSTANT', constantValue: false }), tasks, variables)).toBe('Constant · false')
    expect(describeBinding(binding({ sourceType: 'CONSTANT' }), tasks, variables)).toBe('Constant · —')
  })

  it('says "not bound" for no binding or one that points at nothing', () => {
    expect(describeBinding(undefined, tasks, variables)).toBe('Not bound')
    expect(describeBinding(binding({ sourceType: 'WORKFLOW_VAR', sourceReference: '' }), tasks, variables)).toBe('Not bound')
    expect(describeBinding(binding({ sourceType: 'STEP_OUTPUT', sourceReference: 'CHECK_READY', outputKey: null }), tasks, variables)).toBe('Not bound')
  })

  it('keeps a source it does not know instead of hiding it', () => {
    expect(describeBinding(binding({ sourceType: 'FUTURE_SOURCE' as never, sourceReference: 'x' }), tasks, variables)).toBe('FUTURE_SOURCE · x')
  })
})

describe('values', () => {
  it('shows nothing as a dash and everything else in full', () => {
    expect(valueText(null)).toBe('—')
    expect(valueText('')).toBe('—')
    expect(valueText(Number.NaN)).toBe('—')
    expect(valueText(0)).toBe('0')
    expect(valueText(false)).toBe('false')
  })

  it('gives only an Admin-entered variable a value', () => {
    expect(variableValue(variables[0])).toBe('25')
    expect(variableValue(variables[1])).toBe('—')
    expect(variableValue({ ...variables[0], configuredValue: undefined, defaultValue: 10 })).toBe('10')
  })
})

describe('inputRows', () => {
  const operation = {
    code: 'PICKUP',
    description: '',
    inputs: [
      { key: 'robotId', dataType: 'UUID', required: true, description: 'The robot' },
      { key: 'purpose', dataType: 'STRING', required: false, description: '' },
    ],
    outputs: [],
  } as unknown as OperationMetadata

  it('lists every input the operation takes, in its order, with where each comes from', () => {
    const rows = inputRows(
      step({ inputBindings: { robotId: binding({ sourceType: 'WORKFLOW_VAR', sourceReference: 'jobId' }) } }),
      operation,
      tasks,
      variables,
    )

    expect(rows.map((r) => [r.key, r.required, r.text])).toEqual([
      ['robotId', true, 'Workflow variable jobId'],
      ['purpose', false, 'Not bound'],
    ])
    expect(rows[0].description).toBe('The robot')
    expect(rows[1].description).toBeNull()
  })

  it('also lists a binding the operation no longer takes, so nothing the workflow says is hidden', () => {
    const rows = inputRows(step({ inputBindings: { legacy: binding({ sourceType: 'CONSTANT', constantValue: 1 }) } }), operation, tasks, variables)

    expect(rows.map((r) => r.key)).toEqual(['robotId', 'purpose', 'legacy'])
    expect(rows[2]).toMatchObject({ dataType: null, required: null, text: 'Constant · 1' })
  })

  it('still lists the bindings when the operation is unknown', () => {
    const rows = inputRows(step({ inputBindings: { a: binding({ sourceType: 'CONSTANT', constantValue: 'x' }) } }), null, tasks, variables)

    expect(rows.map((r) => r.key)).toEqual(['a'])
  })
})
