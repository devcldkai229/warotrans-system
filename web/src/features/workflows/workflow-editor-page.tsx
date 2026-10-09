import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import type {
  StepType,
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
      if (isNew) navigate(`/workflows/${saved.id}`, { replace: true })
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
      navigate(`/workflows/${created.id}`)
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

  if (metadataQuery.isLoading || (!isNew && detailQuery.isLoading)) {
    return <p>Loading…</p>
  }

  if (metadataQuery.error) {
    return <p className="error">{(metadataQuery.error as Error).message}</p>
  }

  if (!metadata) return null

  return (
    <section className="wf-page">
      <header className="wf-header">
        <div>
          <p className="crumb">
            <Link to="/workflows">Workflows</Link> / {isNew ? 'New' : draft.code || id}
          </p>
          <h1>{isNew ? 'New workflow template' : draft.name || 'Workflow editor'}</h1>
          <p>
            Status: <span className={`badge ${status.toLowerCase()}`}>{status}</span>
            {!isNew && detailQuery.data ? ` · v${detailQuery.data.versionNo}` : ''}
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
            <input
              placeholder="key"
              value={variable.key}
              onChange={(e) => updateVariable(index, { key: e.target.value })}
            />
            <input
              placeholder="name"
              value={variable.name}
              onChange={(e) => updateVariable(index, { name: e.target.value })}
            />
            <select
              value={variable.dataType}
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
            {variable.source === 'SYSTEM_VALUE' && (
              <select
                value={variable.key}
                onChange={(e) => {
                  const sys = metadata.systemVariables.find((s) => s.key === e.target.value)
                  updateVariable(index, {
                    key: e.target.value,
                    dataType: (sys?.dataType as WorkflowVariable['dataType']) ?? 'UUID',
                    name: variable.name || e.target.value,
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
                      {stepTypeMeta?.operationFieldName ?? 'operation'}
                      <select
                        value={step.operationCode}
                        onChange={(e) =>
                          updateStep(selectedTask, selectedStep, {
                            operationCode: e.target.value,
                            inputBindings: {},
                          })
                        }
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
