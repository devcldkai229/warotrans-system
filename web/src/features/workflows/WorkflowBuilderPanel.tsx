import { useState } from 'react'
import type {
  BindingSourceType,
  InputBinding,
  StepFailurePolicy,
  StepType,
  Workflow,
  WorkflowStep,
  WorkflowTask,
  WorkflowVariable,
  WorkflowVariableSource,
} from '@/shared/api/contracts'
import { Icon } from '@/shared/ui/Icon'
import {
  BINDING_SOURCES,
  CURRENT_MOVEMENT_PATHS,
  FAILURE_POLICIES,
  STEP_INPUT_NAMES,
  SUPPORTED_STEP_TYPES,
  VARIABLE_DATA_TYPES,
  VARIABLE_SOURCES,
} from './constants'
import './workflows.css'

interface WorkflowBuilderPanelProps {
  workflow: Workflow
  onChange: (workflow: Workflow) => void
}

/** Outputs of steps that run before `step`, as `<stepKey>.<outputName>` (a Workflow must not bind from a later step). */
function earlierOutputs(tasks: WorkflowTask[], taskIndex: number, step: WorkflowStep): string[] {
  const result: string[] = []
  tasks.forEach((task, index) => {
    if (index > taskIndex) return
    task.steps.forEach((candidate) => {
      const earlier = index < taskIndex || candidate.sequenceNo < step.sequenceNo
      if (earlier) (candidate.outputs ?? []).forEach((output) => result.push(`${candidate.stepKey}.${output}`))
    })
  })
  return result
}

function defaultPath(sourceType: BindingSourceType, variableKeys: string[], outputs: string[]): string {
  if (sourceType === 'WORKFLOW_VAR') return variableKeys[0] ?? ''
  if (sourceType === 'CURRENT_MOVEMENT') return CURRENT_MOVEMENT_PATHS[0]
  if (sourceType === 'STEP_OUTPUT') return outputs[0] ?? ''
  return ''
}

interface BindingRowProps {
  input: string
  binding: InputBinding
  variableKeys: string[]
  outputs: string[]
  onChange: (binding: InputBinding) => void
  onRemove: () => void
}

function BindingRow({ input, binding, variableKeys, outputs, onChange, onRemove }: BindingRowProps) {
  const options =
    binding.sourceType === 'WORKFLOW_VAR'
      ? variableKeys
      : binding.sourceType === 'CURRENT_MOVEMENT'
        ? CURRENT_MOVEMENT_PATHS
        : binding.sourceType === 'STEP_OUTPUT'
          ? outputs
          : null

  return (
    <div className="wf-bind">
      <span className="wf-bind__name" title={input}>
        {input}
      </span>
      <i>←</i>
      <select
        value={binding.sourceType}
        aria-label={`${input} source`}
        onChange={(event) => {
          const sourceType = event.target.value as BindingSourceType
          onChange({ sourceType, path: defaultPath(sourceType, variableKeys, outputs) })
        }}
      >
        {BINDING_SOURCES.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
      {options ? (
        <select
          value={options.includes(binding.path as never) ? binding.path : ''}
          aria-label={`${input} path`}
          onChange={(event) => onChange({ ...binding, path: event.target.value })}
        >
          {!options.includes(binding.path as never) ? <option value="">Select…</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={binding.path}
          aria-label={`${input} constant`}
          onChange={(event) => onChange({ ...binding, path: event.target.value })}
        />
      )}
      <button type="button" className="wf-bind__x" onClick={onRemove} aria-label={`Remove ${input}`}>
        <Icon name="close" size={11} />
      </button>
    </div>
  )
}

export function WorkflowBuilderPanel({ workflow, onChange }: WorkflowBuilderPanelProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(workflow.tasks[0]?.id ?? null)
  const [expandedStep, setExpandedStep] = useState<string | null>(workflow.tasks[0]?.steps[0]?.id ?? null)
  const [stepMenuFor, setStepMenuFor] = useState<string | null>(null)
  const isDraft = workflow.status === 'DRAFT'
  const variableKeys = workflow.variablesSchema.map((variable) => variable.key)

  const patch = (changes: Partial<Workflow>) => onChange({ ...workflow, ...changes })

  /* ----- variables ----- */
  function updateVariable(index: number, changes: Partial<WorkflowVariable>) {
    patch({
      variablesSchema: workflow.variablesSchema.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    })
  }

  function addVariable() {
    const next = workflow.variablesSchema.length + 1
    patch({
      variablesSchema: [
        ...workflow.variablesSchema,
        { key: `variable${next}`, label: `Variable ${next}`, dataType: 'STRING', source: 'ADMIN_INPUT', required: true },
      ],
    })
  }

  /* ----- tasks / steps ----- */
  function updateTask(taskId: string, update: (task: WorkflowTask) => WorkflowTask) {
    patch({ tasks: workflow.tasks.map((task) => (task.id === taskId ? update(task) : task)) })
  }

  function updateStep(taskId: string, stepId: string, changes: Partial<WorkflowStep>) {
    updateTask(taskId, (task) => ({
      ...task,
      steps: task.steps.map((step) => (step.id === stepId ? { ...step, ...changes } : step)),
    }))
  }

  function addTask() {
    const next = workflow.tasks.length + 1
    patch({
      tasks: [
        ...workflow.tasks,
        { id: `task-${next}`, taskKey: `TASK_${next}`, name: `TASK_${next}`, sequenceNo: next, steps: [] },
      ],
    })
  }

  function addStep(taskId: string, stepType: StepType) {
    updateTask(taskId, (task) => {
      const next = task.steps.length + 1
      const step: WorkflowStep = {
        id: `${taskId}-step-${next}`,
        stepKey: `${stepType}_${next}`,
        name: `${stepType}_${next}`,
        stepType,
        sequenceNo: next,
        inputBindings: {},
        timeoutSeconds: 300,
        maxAttempts: 1,
        retryBackoffSeconds: 0,
        onFailure: 'FAIL_JOB',
        outputs: [],
      }
      return { ...task, steps: [...task.steps, step] }
    })
    setStepMenuFor(null)
  }

  function addInput(taskId: string, step: WorkflowStep) {
    const used = Object.keys(step.inputBindings)
    const name = STEP_INPUT_NAMES[step.stepType].find((candidate) => !used.includes(candidate))
    if (!name) return
    updateStep(taskId, step.id, {
      inputBindings: { ...step.inputBindings, [name]: { sourceType: 'CONSTANT', path: '' } },
    })
  }

  function setBinding(taskId: string, step: WorkflowStep, input: string, binding: InputBinding | null) {
    const next = { ...step.inputBindings }
    if (binding) next[input] = binding
    else delete next[input]
    updateStep(taskId, step.id, { inputBindings: next })
  }

  return (
    <div className="wf">
      <label className="wf__field">
        <span>Workflow code</span>
        <input
          value={workflow.code}
          disabled={!isDraft}
          onChange={(event) => patch({ code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
        />
      </label>
      <p className="wf__meta">
        Version {workflow.versionNo} · {workflow.status}
      </p>

      <label className="wf__field">
        <span>Name</span>
        <input value={workflow.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>

      <section className="wf__section">
        <header>
          <h4>
            Variables <em>{workflow.variablesSchema.length}</em>
          </h4>
          <button type="button" className="wf__add" onClick={addVariable}>
            + Variable
          </button>
        </header>
        <div className="wf-vars">
          <div className="wf-vars__head">
            <span>Name</span>
            <span>Type</span>
            <span>Source</span>
            <span>Value</span>
            <span />
          </div>
          {workflow.variablesSchema.map((variable, index) => (
            <div key={index} className="wf-vars__row">
              <input
                value={variable.key}
                aria-label="Variable key"
                onChange={(event) =>
                  updateVariable(index, {
                    key: event.target.value,
                    label: variable.label === variable.key ? event.target.value : variable.label,
                  })
                }
              />
              <select
                value={variable.dataType}
                aria-label="Data type"
                onChange={(event) => updateVariable(index, { dataType: event.target.value })}
              >
                {(VARIABLE_DATA_TYPES.includes(variable.dataType)
                  ? VARIABLE_DATA_TYPES
                  : [variable.dataType, ...VARIABLE_DATA_TYPES]
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={variable.source}
                aria-label="Variable source"
                onChange={(event) => updateVariable(index, { source: event.target.value as WorkflowVariableSource })}
              >
                {VARIABLE_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
              <input
                value={variable.source === 'ADMIN_INPUT' ? (variable.value ?? '') : ''}
                disabled={variable.source !== 'ADMIN_INPUT'}
                placeholder="—"
                aria-label="Value"
                onChange={(event) => updateVariable(index, { value: event.target.value })}
              />
              <button
                type="button"
                aria-label="Remove variable"
                onClick={() => patch({ variablesSchema: workflow.variablesSchema.filter((_, i) => i !== index) })}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="wf__section">
        <header>
          <h4>Tasks</h4>
          <button type="button" className="wf__add" onClick={addTask}>
            + Add task
          </button>
        </header>

        {workflow.tasks.map((task, taskIndex) => {
          const taskOpen = expandedTask === task.id
          return (
            <div key={task.id} className="wf-task">
              <button
                type="button"
                className="wf-task__head"
                onClick={() => setExpandedTask(taskOpen ? null : task.id)}
              >
                <Icon name={taskOpen ? 'chevronDown' : 'chevronRight'} size={12} />
                <strong>{task.name}</strong>
                <em>{task.steps.length}</em>
              </button>

              {taskOpen ? (
                <div className="wf-task__steps">
                  {task.steps.map((step) => {
                    const stepOpen = expandedStep === step.id
                    const usedInputs = Object.keys(step.inputBindings)
                    const canAddInput = STEP_INPUT_NAMES[step.stepType].some((name) => !usedInputs.includes(name))
                    return (
                      <div key={step.id} className={`wf-step${stepOpen ? ' is-open' : ''}`}>
                        <button
                          type="button"
                          className="wf-step__head"
                          onClick={() => setExpandedStep(stepOpen ? null : step.id)}
                        >
                          <span className={`wf-step__icon wf-step__icon--${step.stepType}`}>
                            <Icon name={step.stepType === 'MOVE' ? 'navigate' : 'user'} size={12} />
                          </span>
                          <span>
                            <small>
                              Step {step.sequenceNo} · {step.stepType}
                            </small>
                            <strong>{step.name}</strong>
                          </span>
                          <Icon name={stepOpen ? 'chevronDown' : 'chevronRight'} size={11} />
                        </button>

                        {stepOpen ? (
                          <div className="wf-step__body">
                            <h5>Inputs</h5>
                            {usedInputs.length === 0 ? <p className="wf-none">None</p> : null}
                            {Object.entries(step.inputBindings).map(([input, binding]) => (
                              <BindingRow
                                key={input}
                                input={input}
                                binding={binding}
                                variableKeys={variableKeys}
                                outputs={earlierOutputs(workflow.tasks, taskIndex, step)}
                                onChange={(next) => setBinding(task.id, step, input, next)}
                                onRemove={() => setBinding(task.id, step, input, null)}
                              />
                            ))}
                            {canAddInput ? (
                              <button type="button" className="wf__ghost" onClick={() => addInput(task.id, step)}>
                                + Input
                              </button>
                            ) : null}

                            <h5>Outputs</h5>
                            <p className="wf-outputs">{(step.outputs ?? []).join(', ') || 'None'}</p>

                            <h5>Execution</h5>
                            <div className="wf-exec">
                              <label>
                                <span>On failure</span>
                                <select
                                  value={step.onFailure}
                                  onChange={(event) =>
                                    updateStep(task.id, step.id, { onFailure: event.target.value as StepFailurePolicy })
                                  }
                                >
                                  {FAILURE_POLICIES.map((policy) => (
                                    <option key={policy} value={policy}>
                                      {policy}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Timeout (s)</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={step.timeoutSeconds}
                                  onChange={(event) =>
                                    updateStep(task.id, step.id, { timeoutSeconds: Number(event.target.value) })
                                  }
                                />
                              </label>
                              <label>
                                <span>Max attempts</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={step.maxAttempts}
                                  onChange={(event) =>
                                    updateStep(task.id, step.id, { maxAttempts: Number(event.target.value) })
                                  }
                                />
                              </label>
                              <label>
                                <span>Retry backoff (s)</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={step.retryBackoffSeconds}
                                  onChange={(event) =>
                                    updateStep(task.id, step.id, { retryBackoffSeconds: Number(event.target.value) })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <div className="wf-addstep">
                    <button
                      type="button"
                      className="wf__ghost"
                      onClick={() => setStepMenuFor(stepMenuFor === task.id ? null : task.id)}
                    >
                      + Add step
                    </button>
                    {stepMenuFor === task.id ? (
                      <ul>
                        {SUPPORTED_STEP_TYPES.map((type) => (
                          <li key={type}>
                            <button type="button" onClick={() => addStep(task.id, type)}>
                              {type}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </section>
    </div>
  )
}
