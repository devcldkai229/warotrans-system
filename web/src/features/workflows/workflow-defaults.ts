import type {
  StepType,
  WorkflowStepDraft,
  WorkflowTaskDraft,
  WorkflowUpsert,
  WorkflowVariable,
} from '@/shared/api/types'

/** Business code from display name, e.g. "Inbound Putaway" → `INBOUND_PUTAWAY`. */
export function workflowCodeFromName(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
  return ascii
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100)
}

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
  return reorderItem(items, index, index + delta)
}

/** Move item from `from` to `to` and renumber sequenceNo when present. */
export function reorderItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [removed] = next.splice(from, 1)
  if (removed === undefined) return items
  next.splice(to, 0, removed)
  return next.map((item, i) => {
    if (item && typeof item === 'object' && 'sequenceNo' in item) {
      return { ...item, sequenceNo: i + 1 }
    }
    return item
  })
}
