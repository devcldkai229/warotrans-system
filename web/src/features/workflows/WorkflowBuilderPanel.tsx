/**
 * @deprecated Legacy Map Editor mock builder. Do not use for real Workflow authoring.
 * Canonical editor: `/configure/workflows` → WorkflowEditorPage (metadata API + UpsertWorkflowRequest).
 * This panel uses hard-coded INPUT_SPECS/OUTPUT_SPECS that diverge from StepTypeRegistry
 * (e.g. speedProfile, confirmedContainerId). Kept only so accidental imports fail loudly in review.
 */
import { useState, type ReactNode } from 'react'
import type {
  BindingSourceType,
  InputBinding,
  StepType,
  Workflow,
  WorkflowStep,
  WorkflowTask,
  WorkflowVariable,
  WorkflowVariableSource,
} from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon } from '@/shared/ui/Icon'
import {
  BINDING_SOURCES,
  CURRENT_MOVEMENT_PATHS,
  CURRENT_MOVEMENT_TYPES,
  INPUT_SPECS,
  OUTPUT_SPECS,
  SUPPORTED_STEP_TYPES,
  VARIABLE_DATA_TYPES,
  VARIABLE_SOURCES,
  accepts,
  allowsConstant,
  type InputSpec,
  type ValueType,
} from './constants'

interface WorkflowBuilderPanelProps {
  workflow: Workflow
  onChange: (workflow: Workflow) => void
}

interface ValueRef {
  ref: string
  type: ValueType
}

interface BindingContext {
  variables: WorkflowVariable[]
  /** Outputs of the Steps that run before this one. */
  earlier: ValueRef[]
}

interface Candidate {
  value: string
  label: string
}

/** Outputs of steps that run before `step` (a Workflow must not bind from a later step), typed from OUTPUT_SPECS. */
function earlierOutputs(tasks: WorkflowTask[], taskIndex: number, step: WorkflowStep): ValueRef[] {
  const result: ValueRef[] = []
  tasks.forEach((task, index) => {
    if (index > taskIndex) return
    task.steps.forEach((candidate) => {
      const earlier = index < taskIndex || candidate.sequenceNo < step.sequenceNo
      if (earlier) {
        OUTPUT_SPECS[candidate.stepType].forEach((output) =>
          result.push({ ref: `${candidate.stepKey}.${output.name}`, type: output.type }),
        )
      }
    })
  })
  return result
}

const specFor = (stepType: StepType, name: string): InputSpec =>
  INPUT_SPECS[stepType].find((spec) => spec.name === name) ?? { name, type: 'ANY' }

/** Values a source may offer to an input: only those whose type the input accepts. */
function candidatesFor(spec: InputSpec, source: BindingSourceType, ctx: BindingContext): Candidate[] {
  if (source === 'WORKFLOW_VAR') {
    return ctx.variables
      .filter((variable) => accepts(spec.type, variable.dataType))
      .map((variable) => ({ value: variable.key, label: `${variable.key} (${variable.dataType})` }))
  }
  if (source === 'CURRENT_MOVEMENT') {
    return CURRENT_MOVEMENT_PATHS.filter((path) => accepts(spec.type, CURRENT_MOVEMENT_TYPES[path])).map((path) => ({
      value: path,
      label: `${path} (${CURRENT_MOVEMENT_TYPES[path]})`,
    }))
  }
  if (source === 'STEP_OUTPUT') {
    return ctx.earlier
      .filter((output) => accepts(spec.type, output.type))
      .map((output) => ({ value: output.ref, label: `${output.ref} (${output.type})` }))
  }
  return []
}

function sourceAvailable(spec: InputSpec, source: BindingSourceType, ctx: BindingContext): boolean {
  if (source === 'CONSTANT') return Boolean(spec.options) || allowsConstant(spec.type)
  // An input with a fixed list of choices cannot be fed from anywhere else.
  if (spec.options) return false
  return candidatesFor(spec, source, ctx).length > 0
}

function initialPath(spec: InputSpec, source: BindingSourceType, ctx: BindingContext): string {
  if (source === 'CONSTANT') return spec.options?.[0] ?? (spec.type === 'BOOL' ? 'true' : '')
  return candidatesFor(spec, source, ctx)[0]?.value ?? ''
}

/** The binding a new input starts with, or null when nothing compatible exists yet. */
function firstBinding(spec: InputSpec, ctx: BindingContext): InputBinding | null {
  if (spec.defaultBinding) return spec.defaultBinding
  const order: BindingSourceType[] = ['CURRENT_MOVEMENT', 'WORKFLOW_VAR', 'STEP_OUTPUT', 'CONSTANT']
  const source = order.find((candidate) => sourceAvailable(spec, candidate, ctx))
  return source ? { sourceType: source, path: initialPath(spec, source, ctx) } : null
}

interface BindingRowProps {
  input: string
  spec: InputSpec
  binding: InputBinding
  ctx: BindingContext
  onChange: (binding: InputBinding) => void
  onRemove: () => void
}

function BindingRow({ input, spec, binding, ctx, onChange, onRemove }: BindingRowProps) {
  const list = binding.sourceType === 'CONSTANT' ? null : candidatesFor(spec, binding.sourceType, ctx)
  const listed = list?.some((candidate) => candidate.value === binding.path) ?? false

  return (
    <div className="mb-1.5 rounded-sm bg-container p-2.5">
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <span className="min-w-0 truncate text-xs font-medium" title={input}>
          {input}
          {spec.required ? (
            <b className="text-red" title="Required">
              {' '}
              *
            </b>
          ) : null}
        </span>
        <span className="mr-auto text-xs text-muted">{spec.type}</span>
        {spec.required ? null : (
          <IconButton size="sm" onClick={onRemove} aria-label={`Remove ${input}`}>
            <Icon name="close" size={13} />
          </IconButton>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1.5">
        <select
          className={controlClass('sm')}
          value={binding.sourceType}
          aria-label={`${input} source`}
          onChange={(event) => {
            const sourceType = event.target.value as BindingSourceType
            onChange({ sourceType, path: initialPath(spec, sourceType, ctx) })
          }}
        >
          {BINDING_SOURCES.map((source) => (
            <option
              key={source}
              value={source}
              disabled={source !== binding.sourceType && !sourceAvailable(spec, source, ctx)}
            >
              {source}
            </option>
          ))}
        </select>

        {list ? (
          <select
            className={controlClass('sm')}
            value={listed ? binding.path : ''}
            aria-label={`${input} value`}
            onChange={(event) => onChange({ ...binding, path: event.target.value })}
          >
            {!listed ? <option value="">Select…</option> : null}
            {list.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
        ) : spec.options || spec.type === 'BOOL' ? (
          <select
            className={controlClass('sm')}
            value={binding.path}
            aria-label={`${input} value`}
            onChange={(event) => onChange({ ...binding, path: event.target.value })}
          >
            {!(spec.options ?? ['true', 'false']).includes(binding.path) ? <option value="">Select…</option> : null}
            {(spec.options ?? ['true', 'false']).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={controlClass('sm')}
            type={spec.type === 'INT' || spec.type === 'DECIMAL' ? 'number' : 'text'}
            step={spec.type === 'DECIMAL' ? 'any' : undefined}
            value={binding.path}
            aria-label={`${input} value`}
            onChange={(event) => onChange({ ...binding, path: event.target.value })}
          />
        )}
      </div>
    </div>
  )
}

function SectionHead({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-baseline gap-2 text-md font-book">
        {title}
        {count === undefined ? null : <span className="text-sm text-muted">{count}</span>}
      </h3>
      {children}
    </header>
  )
}

const SUBHEADING = 'mt-4 mb-2 text-xs font-medium'
const VARIABLE_GRID = 'grid grid-cols-[1.2fr_1.3fr_1.2fr_0.8fr_28px] items-center gap-1.5'

export function WorkflowBuilderPanel({ workflow, onChange }: WorkflowBuilderPanelProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(workflow.tasks[0]?.id ?? null)
  const [expandedStep, setExpandedStep] = useState<string | null>(workflow.tasks[0]?.steps[0]?.id ?? null)
  const [stepMenuFor, setStepMenuFor] = useState<string | null>(null)
  const isDraft = workflow.status === 'DRAFT'

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
        inputBindings: Object.fromEntries(
          INPUT_SPECS[stepType]
            .filter((spec) => spec.required && spec.defaultBinding)
            .map((spec) => [spec.name, spec.defaultBinding as InputBinding]),
        ),
        // Not edited in the builder, but the columns are NOT NULL: a failed Step stops and waits for an Admin.
        timeoutSeconds: 300,
        maxAttempts: 1,
        retryBackoffSeconds: 0,
        onFailure: 'PAUSE_FOR_OPERATOR',
        outputs: OUTPUT_SPECS[stepType].map((output) => output.name),
      }
      return { ...task, steps: [...task.steps, step] }
    })
    setStepMenuFor(null)
  }

  function addInput(taskId: string, step: WorkflowStep, name: string, ctx: BindingContext) {
    const binding = firstBinding(specFor(step.stepType, name), ctx)
    if (!name || !binding) return
    updateStep(taskId, step.id, { inputBindings: { ...step.inputBindings, [name]: binding } })
  }

  function setBinding(taskId: string, step: WorkflowStep, input: string, binding: InputBinding | null) {
    const next = { ...step.inputBindings }
    if (binding) next[input] = binding
    else delete next[input]
    updateStep(taskId, step.id, { inputBindings: next })
  }

  return (
    <div className="flex flex-col gap-8 px-5 pt-5 pb-10">
      <Field label="Workflow name" hint={`Version ${workflow.versionNo}, ${workflow.status.toLowerCase()}`}>
        <input className={controlClass()} value={workflow.name} onChange={(event) => patch({ name: event.target.value })} />
      </Field>

      <section>
        <SectionHead title="Variables" count={workflow.variablesSchema.length}>
          <Button size="sm" onClick={addVariable}>
            <Icon name="plus" size={14} /> Variable
          </Button>
        </SectionHead>
        {workflow.variablesSchema.length === 0 ? (
          <p className="text-xs text-muted">No variables yet. Add one to pass values into the steps.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className={cx(VARIABLE_GRID, 'text-xs text-muted')}>
              <span>Name</span>
              <span>Type</span>
              <span>Source</span>
              <span>Value</span>
              <span />
            </div>
            {workflow.variablesSchema.map((variable, index) => (
              <div key={index} className={VARIABLE_GRID}>
                <input
                  className={controlClass('sm')}
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
                  className={controlClass('sm')}
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
                  className={controlClass('sm')}
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
                  className={controlClass('sm')}
                  value={variable.source === 'ADMIN_INPUT' ? (variable.value ?? '') : ''}
                  disabled={variable.source !== 'ADMIN_INPUT'}
                  placeholder="—"
                  aria-label="Value"
                  onChange={(event) => updateVariable(index, { value: event.target.value })}
                />
                <IconButton
                  size="sm"
                  aria-label="Remove variable"
                  onClick={() => patch({ variablesSchema: workflow.variablesSchema.filter((_, i) => i !== index) })}
                >
                  <Icon name="close" size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Tasks" count={workflow.tasks.length}>
          <Button size="sm" onClick={addTask}>
            <Icon name="plus" size={14} /> Task
          </Button>
        </SectionHead>
        {workflow.tasks.length === 0 ? <p className="text-xs text-muted">No tasks yet. A task groups the steps a robot runs in order.</p> : null}

        {workflow.tasks.map((task, taskIndex) => {
          const taskOpen = expandedTask === task.id
          return (
            <div key={task.id} className="mb-2 rounded-md bg-container">
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
                aria-expanded={taskOpen}
                onClick={() => setExpandedTask(taskOpen ? null : task.id)}
              >
                <Icon name={taskOpen ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
                <strong className="min-w-0 flex-1 truncate text-base font-medium">{task.name || task.taskKey}</strong>
                <span className="text-xs text-muted">
                  {task.steps.length} {task.steps.length === 1 ? 'step' : 'steps'}
                </span>
              </button>

              {taskOpen ? (
                <div className="px-3 pb-3">
                  <Field label="Task name" hint={`Key ${task.taskKey}`} className="mb-3 px-1">
                    <input
                      className={controlClass('sm')}
                      value={task.name}
                      disabled={!isDraft}
                      onChange={(event) => updateTask(task.id, (current) => ({ ...current, name: event.target.value }))}
                    />
                  </Field>
                  {task.steps.map((step) => {
                    const stepOpen = expandedStep === step.id
                    const usedInputs = Object.keys(step.inputBindings)
                    const ctx: BindingContext = {
                      variables: workflow.variablesSchema,
                      earlier: earlierOutputs(workflow.tasks, taskIndex, step),
                    }
                    // Only inputs the Step Type defines, whose precondition holds and that can be fed from somewhere.
                    const addable = INPUT_SPECS[step.stepType].filter((spec) => {
                      if (usedInputs.includes(spec.name)) return false
                      const gate = spec.onlyWhen && step.inputBindings[spec.onlyWhen.input]
                      if (spec.onlyWhen && !(gate?.sourceType === 'CONSTANT' && gate.path === spec.onlyWhen.value)) return false
                      return firstBinding(spec, ctx) !== null
                    })
                    return (
                      <div key={step.id} className="mb-1.5 rounded-md bg-surface">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                          aria-expanded={stepOpen}
                          onClick={() => setExpandedStep(stepOpen ? null : step.id)}
                        >
                          <span
                            className={cx(
                              'grid size-8 shrink-0 place-items-center rounded-full',
                              step.stepType === 'MOVE' ? 'bg-blue-soft text-blue-ink' : 'bg-container-high text-ink-2',
                            )}
                          >
                            <Icon name={step.stepType === 'MOVE' ? 'navigate' : 'user'} size={14} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-xs text-muted">
                              Step {step.sequenceNo}, {step.stepType}
                            </span>
                            <strong className="truncate font-medium">{step.name || step.stepKey}</strong>
                          </span>
                          <Icon name={stepOpen ? 'chevronDown' : 'chevronRight'} size={14} className="text-muted" />
                        </button>

                        {stepOpen ? (
                          <div className="min-w-0 px-3 pb-3">
                            <Field label="Step name" hint={`Key ${step.stepKey}`}>
                              <input
                                className={controlClass('sm')}
                                value={step.name}
                                disabled={!isDraft}
                                onChange={(event) => updateStep(task.id, step.id, { name: event.target.value })}
                              />
                            </Field>

                            <h4 className={SUBHEADING}>Inputs</h4>
                            {usedInputs.length === 0 ? <p className="mb-2 text-xs text-muted">None</p> : null}
                            {Object.entries(step.inputBindings).map(([input, binding]) => (
                              <BindingRow
                                key={input}
                                input={input}
                                spec={specFor(step.stepType, input)}
                                binding={binding}
                                ctx={ctx}
                                onChange={(next) => setBinding(task.id, step, input, next)}
                                onRemove={() => setBinding(task.id, step, input, null)}
                              />
                            ))}
                            {addable.length > 0 ? (
                              <select
                                className={controlClass('sm', 'border-dashed')}
                                value=""
                                aria-label="Add input"
                                onChange={(event) => addInput(task.id, step, event.target.value, ctx)}
                              >
                                <option value="">Add an input…</option>
                                {addable.map((spec) => (
                                  <option key={spec.name} value={spec.name}>
                                    {spec.name} ({spec.type})
                                  </option>
                                ))}
                              </select>
                            ) : null}

                            <h4 className={SUBHEADING}>Outputs</h4>
                            {OUTPUT_SPECS[step.stepType].length === 0 ? (
                              <p className="text-xs text-muted">None</p>
                            ) : (
                              <ul className="flex flex-wrap gap-1.5">
                                {OUTPUT_SPECS[step.stepType].map((output) => (
                                  <li key={output.name} className="rounded-full bg-container-high px-2.5 py-1 text-xs">
                                    {output.name} <span className="text-muted">{output.type}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <div className="relative mt-2">
                    <Button
                      variant="surface"
                      size="sm"
                      aria-expanded={stepMenuFor === task.id}
                      onClick={() => setStepMenuFor(stepMenuFor === task.id ? null : task.id)}
                    >
                      <Icon name="plus" size={14} /> Step
                    </Button>
                    {stepMenuFor === task.id ? (
                      <ul className="absolute top-10 left-0 z-5 min-w-48 rounded-md bg-surface p-1.5 shadow-float">
                        {SUPPORTED_STEP_TYPES.map((type) => (
                          <li key={type}>
                            <button
                              type="button"
                              className="flex h-9 w-full items-center rounded-sm px-3 text-left text-sm transition-colors duration-200 hover:bg-container-high"
                              onClick={() => addStep(task.id, type)}
                            >
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
