import type {
  StepType,
  WorkflowStepDraft,
  WorkflowTaskDraft,
  WorkflowUpsert,
  WorkflowVariable,
} from '@/shared/api/types'

export function emptyWorkflow(): WorkflowUpsert {
  return {
    code: '',
    name: '',
    description: '',
    variables: [],
    tasks: [],
  }
}

export function emptyVariable(sequenceNo: number): WorkflowVariable {
  return {
    key: '',
    name: '',
    dataType: 'STRING',
    source: 'STAFF_INPUT',
    isRequired: true,
    sequenceNo,
    configuredValue: undefined,
    description: '',
  }
}

export function emptyTask(sequenceNo: number): WorkflowTaskDraft {
  return {
    taskKey: '',
    name: '',
    sequenceNo,
    steps: [],
  }
}

export function emptyStep(sequenceNo: number, stepType: StepType = 'CHECK'): WorkflowStepDraft {
  return {
    stepKey: '',
    name: '',
    stepType,
    sequenceNo,
    operationCode: '',
    instructionText: '',
    inputBindings: {},
    timeoutSeconds: 0,
    maxAttempts: 1,
    retryBackoffSeconds: 0,
    onFailure: 'FAIL_JOB',
  }
}

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items]
  const target = index + delta
  if (target < 0 || target >= next.length) return items
  ;[next[index], next[target]] = [next[target], next[index]]
  return next.map((item, i) => {
    if (item && typeof item === 'object' && 'sequenceNo' in item) {
      return { ...item, sequenceNo: i + 1 }
    }
    return item
  })
}
