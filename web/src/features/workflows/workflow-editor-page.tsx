import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import type {
  OperationMetadata,
  StepInputBinding,
  StepType,
  StepTypeMetadata,
  WorkflowMetadata,
  WorkflowStepDraft,
  WorkflowTaskDraft,
  WorkflowUpsert,
  WorkflowVariable,
} from '@/shared/api/types'
import {
  createWorkflow,
  createWorkflowVersion,
  fetchWorkflowMetadata,
  getWorkflow,
  publishWorkflow,
  updateWorkflow,
} from '@/shared/api/workflows'
import { BindingEditor } from './binding-editor'
import { isMovementFieldAvailable } from './movement-scope'
import {
  emptyStep,
  emptyTask,
  emptyVariable,
  emptyWorkflow,
  moveItem,
} from './workflow-defaults'
import './workflows.css'

function toUpsert(detail: {
  code: string
  name: string
  description?: string | null
  variables: WorkflowVariable[]
  tasks: Array<{
    taskKey: string
    name: string
    sequenceNo: number
    steps: WorkflowStepDraft[]
  }>
}): WorkflowUpsert {
  return {
    code: detail.code,
    name: detail.name,
    description: detail.description ?? '',
    variables: detail.variables,
    tasks: detail.tasks.map((t) => ({
      taskKey: t.taskKey,
      name: t.name,
      sequenceNo: t.sequenceNo,
      steps: t.steps.map((s) => ({
        stepKey: s.stepKey,
        name: s.name,
        stepType: s.stepType,
        sequenceNo: s.sequenceNo,
        operationCode: s.operationCode,
        instructionText: s.instructionText,
        inputBindings: s.inputBindings ?? {},
        timeoutSeconds: s.timeoutSeconds,
        maxAttempts: s.maxAttempts,
        retryBackoffSeconds: s.retryBackoffSeconds,
        onFailure: s.onFailure,
      })),
    })),
  }
}

const SCOPE_LABELS: Record<string, string> = {
  ONCE_PER_JOB: 'Once per job',
  ONCE_PER_STOP: 'Once per stop',
  PER_CONTAINER_AT_STOP: 'Per container at stop',
}

const SCOPE_TOOLTIPS: Record<string, string> = {
  ONCE_PER_JOB: 'Step runs once for the entire Job, regardless of containers or stops.',
  ONCE_PER_STOP:
    'Step runs once for each endpoint stop, even if that stop contains multiple containers.',
  PER_CONTAINER_AT_STOP: 'Step runs separately for each container at each stop.',
}

function ScopeBadge({
  scope,
  stopAction,
}: {
  scope?: string | null
  stopAction?: string | null
}) {
  if (!scope) return null
  const label = SCOPE_LABELS[scope] ?? scope
  const action =
    stopAction === 'PICKUP' ? ' · Pickup' : stopAction === 'DROPOFF' ? ' · Dropoff' : ''
  return (
    <span className="scope-badge" title={SCOPE_TOOLTIPS[scope] ?? scope}>
      {label}
      {action}
    </span>
  )
}

function findOperation(
  metadata: WorkflowMetadata,
  stepType: string,
  operationCode: string,
): OperationMetadata | null {
  const typeMeta = metadata.stepTypes.find((s) => s.stepType === stepType)
  return typeMeta?.operations.find((o) => o.code === operationCode) ?? null
}

/**
 * When operationFieldName is also a required input on that operation (e.g. MOVE.purpose),
 * auto-bind CONSTANT = operationCode so Admin does not pick the same value twice.
 */
function bindingsForOperationChange(
  stepTypeMeta: StepTypeMetadata | null,
  operationCode: string,
  operationMeta: OperationMetadata | null,
): Record<string, StepInputBinding> {
  const bindings: Record<string, StepInputBinding> = {}
  const fieldName = stepTypeMeta?.operationFieldName
  if (!fieldName || !operationCode || !operationMeta) return bindings
  const fieldInput = operationMeta.inputs.find((i) => i.key === fieldName)
  if (!fieldInput) return bindings
  bindings[fieldName] = {
    sourceType: 'CONSTANT',
    sourceReference: null,
    outputKey: null,
    constantValue: operationCode,
  }
  return bindings
}

function isAutoSyncedOperationField(
  stepTypeMeta: StepTypeMetadata | null,
  inputKey: string,
): boolean {
  return Boolean(stepTypeMeta?.operationFieldName && stepTypeMeta.operationFieldName === inputKey)
}

/** Lightweight pre-publish checks mirroring metadata + scope rules (backend remains authority). */
function collectClientWarnings(
  draft: WorkflowUpsert,
  metadata: WorkflowMetadata,
): string[] {
  const warnings: string[] = []

  if (!draft.code.trim()) warnings.push('Workflow code is required.')
  if (!draft.name.trim()) warnings.push('Workflow name is required.')
  if (draft.tasks.length === 0) warnings.push('Add at least one task before publish.')

  for (const variable of draft.variables) {
    if (variable.source === 'ADMIN_INPUT' && variable.isRequired) {
      if (variable.configuredValue === undefined || variable.configuredValue === '') {
        warnings.push(`ADMIN_INPUT '${variable.key}' needs a configured value.`)
      }
    }
    if (variable.source === 'SYSTEM_VALUE') {
      const sys = metadata.systemVariables.find((s) => s.key === variable.key)
      if (!sys) {
        warnings.push(`SYSTEM_VALUE '${variable.key}' is not in the system variable catalog.`)
      } else if (sys.dataType !== variable.dataType) {
        warnings.push(
          `SYSTEM_VALUE '${variable.key}' dataType should be ${sys.dataType}, got ${variable.dataType}.`,
        )
      }
    }
  }

  for (const task of draft.tasks) {
    for (const step of task.steps) {
      if (!step.operationCode) {
        warnings.push(`Step '${step.stepKey || step.name || '?'}' has no operation selected.`)
        continue
      }
      const op = findOperation(metadata, step.stepType, step.operationCode)
      if (!op) {
        warnings.push(
          `Step '${step.stepKey}' operation ${step.stepType}.${step.operationCode} is unknown.`,
        )
        continue
      }

      for (const input of op.inputs) {
        const binding = step.inputBindings[input.key]
        if (input.required && !binding) {
          warnings.push(`Step '${step.stepKey}' missing required binding for '${input.key}'.`)
          continue
        }
        if (!binding) continue

        if (binding.sourceType === 'CURRENT_MOVEMENT') {
          const field = metadata.currentMovementFields.find((f) => f.key === binding.sourceReference)
          if (!field) {
            warnings.push(
              `Step '${step.stepKey}' CURRENT_MOVEMENT path '${binding.sourceReference}' is unknown.`,
            )
          } else if (
            !isMovementFieldAvailable(field, op.executionScope, op.stopActionFilter)
          ) {
            warnings.push(
              `Step '${step.stepKey}' CURRENT_MOVEMENT '${binding.sourceReference}' is not available at ${op.executionScope}${op.stopActionFilter ? `/${op.stopActionFilter}` : ''}.`,
            )
          }
          if (op.executionScope === 'ONCE_PER_JOB') {
            warnings.push(
              `Step '${step.stepKey}' is ONCE_PER_JOB and cannot use CURRENT_MOVEMENT.`,
            )
          }
        }

        if (binding.sourceType === 'WORKFLOW_VAR') {
          const variable = draft.variables.find((v) => v.key === binding.sourceReference)
          if (!variable) {
            warnings.push(
              `Step '${step.stepKey}' WORKFLOW_VAR '${binding.sourceReference}' does not exist.`,
            )
          } else if (
            variable.dataType !== input.dataType &&
            !(variable.dataType === 'INTEGER' && input.dataType === 'DECIMAL')
          ) {
            warnings.push(
              `Step '${step.stepKey}' '${input.key}' type mismatch: variable ${variable.dataType} vs input ${input.dataType}.`,
            )
          }
        }

        if (binding.sourceType === 'CONSTANT' && input.allowedValues?.length) {
          const value = String(binding.constantValue ?? '')
          if (value && !input.allowedValues.includes(value)) {
            warnings.push(
              `Step '${step.stepKey}' CONSTANT '${input.key}'="${value}" is not an allowed value.`,
            )
          }
        }

        if (binding.sourceType === 'STEP_OUTPUT') {
          const typeMeta = metadata.stepTypes.find((s) => s.stepType === step.stepType)
          // Existence of earlier output is checked loosely; backend validates order.
          if (!binding.sourceReference || !binding.outputKey) {
            warnings.push(`Step '${step.stepKey}' STEP_OUTPUT for '${input.key}' is incomplete.`)
          } else {
            void typeMeta
          }
        }
      }

      // INVENTORY_AVAILABLE: ONCE_PER_JOB + required containerId — no CURRENT_MOVEMENT.
      if (step.operationCode === 'INVENTORY_AVAILABLE') {
        const containerBinding = step.inputBindings.containerId
        if (!containerBinding) {
          warnings.push(
            `CHECK INVENTORY_AVAILABLE ('${step.stepKey}') requires containerId. CURRENT_MOVEMENT is not allowed at ONCE_PER_JOB scope — use WORKFLOW_VAR/CONSTANT/STEP_OUTPUT, or omit this step until backend scope is redesigned.`,
          )
        }
      }
    }
  }

  return warnings
}

export function WorkflowEditorPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const metadataQuery = useQuery({
    queryKey: ['workflow-metadata'],
    queryFn: fetchWorkflowMetadata,
  })

  const detailQuery = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => getWorkflow(id!),
    enabled: !isNew,
  })

  const loadedKey = isNew ? 'new' : (detailQuery.data?.id ?? 'loading')
  const [draft, setDraft] = useState<WorkflowUpsert>(emptyWorkflow())
  const [draftKey, setDraftKey] = useState(loadedKey)
  const [selectedTask, setSelectedTask] = useState(0)
  const [selectedStep, setSelectedStep] = useState(0)
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [showPublishWarnings, setShowPublishWarnings] = useState(false)

  // Sync local draft when route/query identity changes (avoid cascading setState-in-effect lint).
  if (loadedKey !== 'loading' && draftKey !== loadedKey && (isNew || detailQuery.data)) {
    setDraftKey(loadedKey)
    if (isNew) {
      setDraft(emptyWorkflow())
      setStatus('DRAFT')
    } else if (detailQuery.data) {
      setDraft(toUpsert(detailQuery.data))
      setStatus(detailQuery.data.status)
    }
    setSelectedTask(0)
    setSelectedStep(0)
    setServerErrors([])
    setMessage(null)
    setShowPublishWarnings(false)
  }

  const readOnly = status === 'PUBLISHED'

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) return createWorkflow(draft)
      return updateWorkflow(id!, draft)
    },
    onSuccess: (saved) => {
      setServerErrors([])
      setMessage('Saved.')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', saved.id] })
      if (isNew) navigate(`/configure/workflows/${saved.id}`, { replace: true })
      else {
        setDraft(toUpsert(saved))
        setStatus(saved.status)
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setServerErrors(
          err.errors.length > 0
            ? err.errors.map((e) => `${e.path}: ${e.message}`)
            : [err.message],
        )
      } else {
        setServerErrors([(err as Error).message])
      }
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => publishWorkflow(id!),
    onSuccess: (saved) => {
      setServerErrors([])
      setMessage('Published.')
      setDraft(toUpsert(saved))
      setStatus(saved.status)
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', saved.id] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setServerErrors(
          err.errors.length > 0
            ? err.errors.map((e) => `${e.path}: ${e.message}`)
            : [err.message],
        )
      } else {
        setServerErrors([(err as Error).message])
      }
    },
  })

  const versionMutation = useMutation({
    mutationFn: () => createWorkflowVersion(id!),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate(`/configure/workflows/${created.id}`)
    },
    onError: (err) => setServerErrors([(err as Error).message]),
  })

  const metadata = metadataQuery.data
  const task = draft.tasks[selectedTask]
  const step = task?.steps[selectedStep]

  const stepTypeMeta = useMemo(() => {
    if (!metadata || !step) return null
    return metadata.stepTypes.find((s) => s.stepType === step.stepType) ?? null
  }, [metadata, step])

  const operationMeta = useMemo(() => {
    if (!stepTypeMeta || !step) return null
    return stepTypeMeta.operations.find((o) => o.code === step.operationCode) ?? null
  }, [stepTypeMeta, step])

  const clientWarnings = useMemo(() => {
    if (!metadata) return []
    return collectClientWarnings(draft, metadata)
  }, [draft, metadata])

  const needsAssignedRobotId = useMemo(() => {
    if (!operationMeta) return false
    const requiresRobot = operationMeta.inputs.some((i) => i.key === 'robotId' && i.required)
    if (!requiresRobot) return false
    return !draft.variables.some(
      (v) => v.key === 'assignedRobotId' && v.source === 'SYSTEM_VALUE',
    )
  }, [operationMeta, draft.variables])

  function updateVariable(index: number, patch: Partial<WorkflowVariable>) {
    setDraft((prev) => ({
      ...prev,
      variables: prev.variables.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }))
  }

  function updateTask(index: number, patch: Partial<WorkflowTaskDraft>) {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }))
  }

  function updateStep(taskIndex: number, stepIndex: number, patch: Partial<WorkflowStepDraft>) {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t, ti) =>
        ti === taskIndex
          ? {
              ...t,
              steps: t.steps.map((s, si) => (si === stepIndex ? { ...s, ...patch } : s)),
            }
          : t,
      ),
    }))
  }

  function addAssignedRobotId() {
    if (!metadata) return
    const sys = metadata.systemVariables.find((s) => s.key === 'assignedRobotId')
    if (!sys) return
    if (draft.variables.some((v) => v.key === 'assignedRobotId')) return
    setDraft((prev) => ({
      ...prev,
      variables: [
        ...prev.variables,
        {
          key: sys.key,
          name: sys.label || sys.key,
          dataType: (sys.dataType as WorkflowVariable['dataType']) ?? 'UUID',
          source: 'SYSTEM_VALUE',
          isRequired: true,
          sequenceNo: prev.variables.length,
          configuredValue: undefined,
          description: sys.description,
        },
      ],
    }))
  }

  function applyOperationCode(newCode: string) {
    if (!step || !metadata) return
    const typeMeta = metadata.stepTypes.find((s) => s.stepType === step.stepType) ?? null
    const opMeta = typeMeta?.operations.find((o) => o.code === newCode) ?? null
    const autoBindings = bindingsForOperationChange(typeMeta, newCode, opMeta)
    updateStep(selectedTask, selectedStep, {
      operationCode: newCode,
      inputBindings: autoBindings,
    })
  }

  if (metadataQuery.isLoading || (!isNew && detailQuery.isLoading)) {
    return <p>Loading…</p>
  }

  if (metadataQuery.error) {
    return <p className="error">{(metadataQuery.error as Error).message}</p>
  }

  if (!isNew && detailQuery.error) {
    return <p className="error">{(detailQuery.error as Error).message}</p>
  }

  if (!metadata) return null

  return (
    <section className="wf-page">
      <header className="wf-header">
        <div>
          <p className="crumb">
            <Link to="/configure/workflows">Workflows</Link> / {isNew ? 'New' : draft.code || id}
          </p>
          <h1>{isNew ? 'New workflow template' : draft.name || 'Workflow editor'}</h1>
          <p>
            Status: <span className={`badge ${status.toLowerCase()}`}>{status}</span>
            {!isNew && detailQuery.data ? ` · v${detailQuery.data.versionNo}` : ''}
            {!isNew && detailQuery.data?.publishedAt
              ? ` · published ${new Date(detailQuery.data.publishedAt).toLocaleString()}`
              : ''}
          </p>
        </div>
        <div className="wf-actions">
          {!readOnly && (
            <button
              type="button"
              className="btn primary"
              disabled={saveMutation.isPending}
              onClick={() => {
                setMessage(null)
                setShowPublishWarnings(false)
                saveMutation.mutate()
              }}
            >
              Save draft
            </button>
          )}
          {!isNew && status === 'DRAFT' && (
            <button
              type="button"
              className="btn"
              disabled={publishMutation.isPending}
              onClick={() => {
                setMessage(null)
                setShowPublishWarnings(true)
                if (clientWarnings.length > 0) return
                publishMutation.mutate()
              }}
            >
              Publish
            </button>
          )}
          {!isNew && status === 'PUBLISHED' && (
            <button
              type="button"
              className="btn primary"
              disabled={versionMutation.isPending}
              onClick={() => versionMutation.mutate()}
            >
              New version
            </button>
          )}
        </div>
      </header>

      {message && <p className="ok">{message}</p>}
      {serverErrors.length > 0 && (
        <ul className="error-list">
          {serverErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {showPublishWarnings && clientWarnings.length > 0 && (
        <div className="client-warnings">
          <p>
            Fix these issues before publish (client checks; backend ValidateForPublish is still the
            authority):
          </p>
          <ul>
            {clientWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setShowPublishWarnings(false)
              publishMutation.mutate()
            }}
          >
            Publish anyway
          </button>
        </div>
      )}

      <fieldset className="wf-card" disabled={readOnly}>
        <legend>Identity</legend>
        <div className="grid-3">
          <label>
            Code
            <input
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
          </label>
          <label>
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Description
            <input
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="wf-card" disabled={readOnly}>
        <legend>
          Variables
          <button
            type="button"
            className="btn small"
            onClick={() =>
              setDraft({
                ...draft,
                variables: [...draft.variables, emptyVariable(draft.variables.length)],
              })
            }
          >
            + Variable
          </button>
        </legend>
        {draft.variables.map((variable, index) => (
          <div key={index} className="var-row">
            {variable.source === 'SYSTEM_VALUE' ? (
              <select
                value={variable.key}
                onChange={(e) => {
                  const sys = metadata.systemVariables.find((s) => s.key === e.target.value)
                  updateVariable(index, {
                    key: e.target.value,
                    dataType: (sys?.dataType as WorkflowVariable['dataType']) ?? 'UUID',
                    name: variable.name || e.target.value,
                    description: sys?.description ?? variable.description,
                  })
                }}
              >
                <option value="">Select SYSTEM_VALUE…</option>
                {metadata.systemVariables.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.key}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="key"
                value={variable.key}
                onChange={(e) => updateVariable(index, { key: e.target.value })}
              />
            )}
            <input
              placeholder="name"
              value={variable.name}
              onChange={(e) => updateVariable(index, { name: e.target.value })}
            />
            <select
              value={variable.dataType}
              disabled={variable.source === 'SYSTEM_VALUE'}
              onChange={(e) =>
                updateVariable(index, {
                  dataType: e.target.value as WorkflowVariable['dataType'],
                })
              }
            >
              {metadata.dataTypes.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={variable.source}
              onChange={(e) =>
                updateVariable(index, {
                  source: e.target.value as WorkflowVariable['source'],
                  configuredValue:
                    e.target.value === 'ADMIN_INPUT' ? variable.configuredValue : undefined,
                })
              }
            >
              {metadata.variableSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={variable.isRequired}
                onChange={(e) => updateVariable(index, { isRequired: e.target.checked })}
              />
              required
            </label>
            {variable.source === 'ADMIN_INPUT' && (
              <input
                placeholder="configured value"
                value={
                  variable.configuredValue == null ? '' : String(variable.configuredValue)
                }
                onChange={(e) => {
                  let value: unknown = e.target.value
                  if (variable.dataType === 'INTEGER') value = Number.parseInt(e.target.value, 10)
                  if (variable.dataType === 'DECIMAL') value = Number.parseFloat(e.target.value)
                  if (variable.dataType === 'BOOLEAN') value = e.target.value === 'true'
                  updateVariable(index, { configuredValue: value })
                }}
              />
            )}
            <button
              type="button"
              className="btn small danger"
              onClick={() =>
                setDraft({
                  ...draft,
                  variables: draft.variables.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </fieldset>

      <div className="wf-builder">
        <fieldset className="wf-card" disabled={readOnly}>
          <legend>
            Tasks
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setDraft({
                  ...draft,
                  tasks: [...draft.tasks, emptyTask(draft.tasks.length + 1)],
                })
                setSelectedTask(draft.tasks.length)
                setSelectedStep(0)
              }}
            >
              + Task
            </button>
          </legend>
          <ul className="side-list">
            {draft.tasks.map((t, index) => (
              <li key={index} className={index === selectedTask ? 'active' : ''}>
                <button type="button" onClick={() => { setSelectedTask(index); setSelectedStep(0) }}>
                  {t.taskKey || `Task ${index + 1}`}
                </button>
                <div className="side-actions">
                  <button type="button" onClick={() => setDraft({ ...draft, tasks: moveItem(draft.tasks, index, -1) })}>
                    ↑
                  </button>
                  <button type="button" onClick={() => setDraft({ ...draft, tasks: moveItem(draft.tasks, index, 1) })}>
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {task && (
            <div className="grid-2">
              <label>
                Task key
                <input
                  value={task.taskKey}
                  onChange={(e) => updateTask(selectedTask, { taskKey: e.target.value })}
                />
              </label>
              <label>
                Name
                <input
                  value={task.name}
                  onChange={(e) => updateTask(selectedTask, { name: e.target.value })}
                />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className="wf-card" disabled={readOnly || !task}>
          <legend>
            Steps
            <button
              type="button"
              className="btn small"
              disabled={!task}
              onClick={() => {
                if (!task) return
                const next = emptyStep(task.steps.length + 1)
                updateTask(selectedTask, { steps: [...task.steps, next] })
                setSelectedStep(task.steps.length)
              }}
            >
              + Step
            </button>
          </legend>
          {task && (
            <>
              <ul className="side-list">
                {task.steps.map((s, index) => (
                  <li key={index} className={index === selectedStep ? 'active' : ''}>
                    <button type="button" onClick={() => setSelectedStep(index)}>
                      {s.stepKey || `Step ${index + 1}`}
                    </button>
                    <div className="side-actions">
                      <button
                        type="button"
                        onClick={() =>
                          updateTask(selectedTask, {
                            steps: moveItem(task.steps, index, -1),
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateTask(selectedTask, {
                            steps: moveItem(task.steps, index, 1),
                          })
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {step && (
                <div className="step-form">
                  <div className="grid-2">
                    <label>
                      Step key
                      <input
                        value={step.stepKey}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, { stepKey: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={step.name}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Step type
                      <select
                        value={step.stepType}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, {
                            stepType: e.target.value as StepType,
                            operationCode: '',
                            inputBindings: {},
                          })
                        }
                      >
                        {metadata.stepTypes.map((s) => (
                          <option key={s.stepType} value={s.stepType}>
                            {s.stepType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Operation
                      <select
                        value={step.operationCode}
                        onChange={(e) => applyOperationCode(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {stepTypeMeta?.operations.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      On failure
                      <select
                        value={step.onFailure}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, {
                            onFailure: e.target.value as WorkflowStepDraft['onFailure'],
                          })
                        }
                      >
                        {metadata.failurePolicies.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Timeout (s)
                      <input
                        type="number"
                        value={step.timeoutSeconds}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, {
                            timeoutSeconds: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>

                  {operationMeta && (
                    <div className="scope-row">
                      <ScopeBadge
                        scope={operationMeta.executionScope}
                        stopAction={operationMeta.stopActionFilter}
                      />
                      {operationMeta.executionScope === 'ONCE_PER_JOB' && (
                        <span className="muted scope-hint">
                          CURRENT_MOVEMENT is not available for this operation.
                        </span>
                      )}
                    </div>
                  )}

                  {needsAssignedRobotId && (
                    <div className="add-system-var-prompt">
                      <span>This operation requires robotId.</span>
                      <button type="button" className="btn small" onClick={addAssignedRobotId}>
                        Add required system variable: assignedRobotId
                      </button>
                    </div>
                  )}

                  {step.stepType === 'HUMAN_INTERACTION' && (
                    <label>
                      Instruction
                      <input
                        value={step.instructionText ?? ''}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, {
                            instructionText: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}

                  <h3>Input bindings</h3>
                  {!operationMeta && <p className="muted">Select an operation to bind inputs.</p>}
                  {operationMeta?.inputs.map((input) => (
                    <BindingEditor
                      key={input.key}
                      input={input}
                      binding={step.inputBindings[input.key]}
                      variables={draft.variables}
                      tasks={draft.tasks}
                      currentTaskIndex={selectedTask}
                      currentStepIndex={selectedStep}
                      metadata={metadata}
                      executionScope={operationMeta.executionScope}
                      stopActionFilter={operationMeta.stopActionFilter}
                      readOnlyConstant={isAutoSyncedOperationField(stepTypeMeta, input.key)}
                      onChange={(binding) =>
                        updateStep(selectedTask, selectedStep, {
                          inputBindings: {
                            ...step.inputBindings,
                            [input.key]: binding,
                          },
                        })
                      }
                    />
                  ))}

                  {operationMeta && operationMeta.outputs.length > 0 && (
                    <>
                      <h3>Outputs (read-only metadata)</h3>
                      <ul className="muted">
                        {operationMeta.outputs.map((o) => (
                          <li key={o.key}>
                            {o.key}: {o.dataType} — {o.description}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </fieldset>
      </div>
    </section>
  )
}
