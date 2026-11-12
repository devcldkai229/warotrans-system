import type {
  OperationMetadata,
  StepInputBinding,
  WorkflowStepDraft,
  WorkflowTaskDraft,
  WorkflowVariable,
} from '@/shared/api/types'
import { t } from '@/shared/i18n'

/** A value in a workflow as it is read: nothing is "—", true / false are words, the rest is as written. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' && !Number.isFinite(value)) return '—'
  return String(value)
}

/** What a variable holds in the workflow: only an Admin-entered variable has a value of its own. */
export function variableValue(variable: WorkflowVariable): string {
  if (variable.source !== 'ADMIN_INPUT') return '—'
  return valueText(variable.configuredValue ?? variable.defaultValue)
}

function findStep(tasks: readonly WorkflowTaskDraft[], stepKey: string): WorkflowStepDraft | null {
  for (const task of tasks) {
    const step = task.steps.find((candidate) => candidate.stepKey === stepKey)
    if (step) return step
  }
  return null
}

/**
 * Where an input of a step gets its value, in words. Reads the binding itself, so it shows what the workflow says even
 * when the editor's pickers could not (a variable of another type, an output of a step that moved).
 */
export function describeBinding(
  binding: StepInputBinding | null | undefined,
  tasks: readonly WorkflowTaskDraft[],
  variables: readonly WorkflowVariable[],
): string {
  if (!binding || !binding.sourceType) return t('Not bound')
  const reference = binding.sourceReference ?? ''
  switch (binding.sourceType) {
    case 'WORKFLOW_VAR': {
      if (!reference) return t('Not bound')
      const variable = variables.find((candidate) => candidate.key === reference)
      return variable?.name && variable.name !== reference
        ? t('Workflow variable {key} ({name})', { key: reference, name: variable.name })
        : t('Workflow variable {key}', { key: reference })
    }
    case 'CURRENT_MOVEMENT':
      return reference ? t('Current movement · {path}', { path: reference }) : t('Not bound')
    case 'STEP_OUTPUT': {
      if (!reference || !binding.outputKey) return t('Not bound')
      const step = findStep(tasks, reference)
      return t('Output {output} of "{step}"', { output: binding.outputKey, step: step?.name || reference })
    }
    case 'CONSTANT':
      return t('Constant · {value}', { value: valueText(binding.constantValue) })
    default:
      return [binding.sourceType, reference].filter(Boolean).join(' · ')
  }
}

export interface InputRow {
  key: string
  dataType: string | null
  required: boolean | null
  description: string | null
  text: string
}

/**
 * The inputs of a step: every input the operation takes (in its order), with where it comes from, then any binding the
 * workflow holds for an input the operation no longer lists, so nothing the workflow says is hidden.
 */
export function inputRows(
  step: WorkflowStepDraft,
  operation: OperationMetadata | null,
  tasks: readonly WorkflowTaskDraft[],
  variables: readonly WorkflowVariable[],
): InputRow[] {
  const bindings = step.inputBindings ?? {}
  const rows: InputRow[] = (operation?.inputs ?? []).map((input) => ({
    key: input.key,
    dataType: input.dataType,
    required: input.required,
    description: input.description || null,
    text: describeBinding(bindings[input.key], tasks, variables),
  }))
  const listed = new Set(rows.map((row) => row.key))
  for (const [key, binding] of Object.entries(bindings)) {
    if (listed.has(key)) continue
    rows.push({ key, dataType: null, required: null, description: null, text: describeBinding(binding, tasks, variables) })
  }
  return rows
}
