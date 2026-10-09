import type {
  FieldMetadata,
  StepInputBinding,
  WorkflowMetadata,
  WorkflowStepDraft,
  WorkflowTaskDraft,
  WorkflowVariable,
} from '@/shared/api/types'

interface BindingEditorProps {
  input: FieldMetadata
  binding: StepInputBinding | undefined
  variables: WorkflowVariable[]
  tasks: WorkflowTaskDraft[]
  currentTaskIndex: number
  currentStepIndex: number
  metadata: WorkflowMetadata
  onChange: (binding: StepInputBinding) => void
}

function earlierSteps(
  tasks: WorkflowTaskDraft[],
  taskIndex: number,
  stepIndex: number,
): WorkflowStepDraft[] {
  const result: WorkflowStepDraft[] = []
  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti]
    if (!task) continue
    for (let si = 0; si < task.steps.length; si++) {
      if (ti > taskIndex || (ti === taskIndex && si >= stepIndex)) break
      const step = task.steps[si]
      if (step) result.push(step)
    }
  }
  return result
}

function compatible(
  sourceType: string,
  targetType: string,
): boolean {
  return sourceType === targetType || (sourceType === 'INTEGER' && targetType === 'DECIMAL')
}

export function BindingEditor({
  input,
  binding,
  variables,
  tasks,
  currentTaskIndex,
  currentStepIndex,
  metadata,
  onChange,
}: BindingEditorProps) {
  const sourceType = binding?.sourceType ?? 'WORKFLOW_VAR'
  const previous = earlierSteps(tasks, currentTaskIndex, currentStepIndex)

  const compatibleVars = variables.filter((v) => compatible(v.dataType, input.dataType))
  const compatibleMovement = metadata.currentMovementFields.filter((f) =>
    compatible(f.dataType, input.dataType),
  )

  const stepOptions = previous.flatMap((step) => {
    const typeMeta = metadata.stepTypes.find((s) => s.stepType === step.stepType)
    const op = typeMeta?.operations.find((o) => o.code === step.operationCode)
    if (!op) return []
    return op.outputs
      .filter((o) => compatible(o.dataType, input.dataType))
      .map((o) => ({
        stepKey: step.stepKey,
        outputKey: o.key,
        label: `${step.stepKey}.${o.key} (${o.dataType})`,
      }))
  })

  return (
    <div className="binding-row">
      <div className="binding-label">
        <strong>{input.key}</strong>
        <span>
          {input.dataType}
          {input.required ? ' · required' : ' · optional'}
        </span>
        <small>{input.description}</small>
      </div>

      <select
        value={sourceType}
        onChange={(e) =>
          onChange({
            sourceType: e.target.value as StepInputBinding['sourceType'],
            sourceReference: '',
            outputKey: null,
            constantValue: undefined,
          })
        }
      >
        {metadata.bindingSources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {sourceType === 'WORKFLOW_VAR' && (
        <select
          value={binding?.sourceReference ?? ''}
          onChange={(e) =>
            onChange({
              sourceType,
              sourceReference: e.target.value,
              outputKey: null,
              constantValue: undefined,
            })
          }
        >
          <option value="">Select variable…</option>
          {compatibleVars.map((v) => (
            <option key={v.key} value={v.key}>
              {v.key} ({v.dataType} / {v.source})
            </option>
          ))}
        </select>
      )}

      {sourceType === 'CURRENT_MOVEMENT' && (
        <select
          value={binding?.sourceReference ?? ''}
          onChange={(e) =>
            onChange({
              sourceType,
              sourceReference: e.target.value,
              outputKey: null,
              constantValue: undefined,
            })
          }
        >
          <option value="">Select path…</option>
          {compatibleMovement.map((f) => (
            <option key={f.key} value={f.key}>
              {f.key} ({f.dataType})
            </option>
          ))}
        </select>
      )}

      {sourceType === 'STEP_OUTPUT' && (
        <select
          value={
            binding?.sourceReference && binding.outputKey
              ? `${binding.sourceReference}::${binding.outputKey}`
              : ''
          }
          onChange={(e) => {
            const [stepKey, outputKey] = e.target.value.split('::')
            onChange({
              sourceType,
              sourceReference: stepKey,
              outputKey,
              constantValue: undefined,
            })
          }}
        >
          <option value="">Select earlier output…</option>
          {stepOptions.map((o) => (
            <option key={o.label} value={`${o.stepKey}::${o.outputKey}`}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {sourceType === 'CONSTANT' &&
        (input.allowedValues && input.allowedValues.length > 0 ? (
          <select
            value={String(binding?.constantValue ?? '')}
            onChange={(e) =>
              onChange({
                sourceType,
                sourceReference: null,
                outputKey: null,
                constantValue: e.target.value,
              })
            }
          >
            <option value="">Select value…</option>
            {input.allowedValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={binding?.constantValue == null ? '' : String(binding.constantValue)}
            placeholder={`Constant ${input.dataType}`}
            onChange={(e) => {
              let value: unknown = e.target.value
              if (input.dataType === 'INTEGER') value = Number.parseInt(e.target.value, 10)
              if (input.dataType === 'DECIMAL') value = Number.parseFloat(e.target.value)
              if (input.dataType === 'BOOLEAN') value = e.target.value === 'true'
              onChange({
                sourceType,
                sourceReference: null,
                outputKey: null,
                constantValue: value,
              })
            }}
          />
        ))}
    </div>
  )
}
