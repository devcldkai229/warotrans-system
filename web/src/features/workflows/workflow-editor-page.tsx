import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/authContext'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { formatDateTimeWithYear } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
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
  deleteWorkflow,
  fetchWorkflowMetadata,
  getWorkflow,
  publishWorkflow,
  updateWorkflow,
} from '@/shared/api/workflows'
import { BindingEditor } from './binding-editor'
import { shouldLoadDraft } from './draftSync'
import { ReadOnlyNotice, WorkflowReadOnlyView } from './WorkflowReadOnlyView'
import { ScopeBadge } from './scope-badge'
import {
  isMovementFieldAvailable,
  preferredMovementEndpointPath,
} from './movement-scope'
import {
  emptyStep,
  emptyTask,
  emptyVariable,
  emptyWorkflow,
  reorderItem,
} from './workflow-defaults'
import { t } from '@/shared/i18n'
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

function findOperation(
  metadata: WorkflowMetadata,
  stepType: string,
  operationCode: string,
): OperationMetadata | null {
  const typeMeta = metadata.stepTypes.find((s) => s.stepType === stepType)
  return typeMeta?.operations.find((o) => o.code === operationCode) ?? null
}

/**
 * Seed bindings from metadata when the operation changes:
 * - operationFieldName (e.g. MOVE.purpose) → CONSTANT = operationCode
 * - endpoint UUID inputs → CURRENT_MOVEMENT source/destination by stopActionFilter
 */
function bindingsForOperationChange(
  stepTypeMeta: StepTypeMetadata | null,
  operationCode: string,
  operationMeta: OperationMetadata | null,
): Record<string, StepInputBinding> {
  const bindings: Record<string, StepInputBinding> = {}
  if (!operationCode || !operationMeta) return bindings

  const fieldName = stepTypeMeta?.operationFieldName
  if (fieldName) {
    const fieldInput = operationMeta.inputs.find((i) => i.key === fieldName)
    if (fieldInput) {
      bindings[fieldName] = {
        sourceType: 'CONSTANT',
        sourceReference: null,
        outputKey: null,
        constantValue: operationCode,
      }
    }
  }

  const movementPath = preferredMovementEndpointPath(operationMeta.stopActionFilter)
  if (movementPath) {
    for (const input of operationMeta.inputs) {
      if (input.dataType !== 'UUID') continue
      if (input.key !== 'targetEndpointId' && input.key !== 'endpointId') continue
      bindings[input.key] = {
        sourceType: 'CURRENT_MOVEMENT',
        sourceReference: movementPath,
        outputKey: null,
        constantValue: undefined,
      }
    }
  }

  return bindings
}

function isAutoSyncedOperationField(
  stepTypeMeta: StepTypeMetadata | null,
  inputKey: string,
): boolean {
  return Boolean(stepTypeMeta?.operationFieldName && stepTypeMeta.operationFieldName === inputKey)
}

/** How a step is named in a warning: the name the user typed (the key is generated and not shown). */
function stepLabel(step: { name: string; stepKey: string }) {
  return step.name || step.stepKey || '?'
}

/** Lightweight pre-publish checks mirroring metadata + scope rules (backend remains authority). */
function collectClientWarnings(
  draft: WorkflowUpsert,
  metadata: WorkflowMetadata,
): string[] {
  const warnings: string[] = []

  if (!draft.name.trim()) warnings.push(t('Workflow name is required.'))
  if (draft.tasks.length === 0) warnings.push(t('Add at least one task before publish.'))

  for (const variable of draft.variables) {
    if (variable.source === 'ADMIN_INPUT' && variable.isRequired) {
      if (variable.configuredValue === undefined || variable.configuredValue === '') {
        warnings.push(t('ADMIN_INPUT \'{key}\' needs a configured value.', { key: variable.key }))
      }
    }
    if (variable.source === 'SYSTEM_VALUE') {
      const sys = metadata.systemVariables.find((s) => s.key === variable.key)
      if (!sys) {
        warnings.push(t('SYSTEM_VALUE \'{key}\' is not in the system variable catalog.', { key: variable.key }))
      } else if (sys.dataType !== variable.dataType) {
        warnings.push(
          t('SYSTEM_VALUE \'{key}\' dataType should be {dataType}, got {dataType2}.', { key: variable.key, dataType: sys.dataType, dataType2: variable.dataType }),
        )
      }
    }
  }

  for (const task of draft.tasks) {
    for (const step of task.steps) {
      if (!step.operationCode) {
        warnings.push(t('Step \'{value}\' has no operation selected.', { value: stepLabel(step) }))
        continue
      }
      const op = findOperation(metadata, step.stepType, step.operationCode)
      if (!op) {
        warnings.push(
          t('Step \'{value}\' operation {stepType}.{operationCode} is unknown.', { value: stepLabel(step), stepType: step.stepType, operationCode: step.operationCode }),
        )
        continue
      }

      for (const input of op.inputs) {
        const binding = step.inputBindings[input.key]
        if (input.required && !binding) {
          warnings.push(t('Step \'{value}\' missing required binding for \'{key}\'.', { value: stepLabel(step), key: input.key }))
          continue
        }
        if (!binding) continue

        if (binding.sourceType === 'CURRENT_MOVEMENT') {
          const field = metadata.currentMovementFields.find((f) => f.key === binding.sourceReference)
          if (!field) {
            warnings.push(
              t('Step \'{value}\' CURRENT_MOVEMENT path \'{sourceReference}\' is unknown.', { value: stepLabel(step), sourceReference: binding.sourceReference }),
            )
          } else if (
            !isMovementFieldAvailable(field, op.executionScope, op.stopActionFilter)
          ) {
            warnings.push(
              t('Step \'{value}\' CURRENT_MOVEMENT \'{sourceReference}\' is not available at {executionScope}{value2}.', { value: stepLabel(step), sourceReference: binding.sourceReference, executionScope: op.executionScope, value2: op.stopActionFilter ? `/${op.stopActionFilter}` : '' }),
            )
          }
          if (op.executionScope === 'ONCE_PER_JOB') {
            warnings.push(
              t('Step \'{value}\' is ONCE_PER_JOB and cannot use CURRENT_MOVEMENT.', { value: stepLabel(step) }),
            )
          }
        }

        if (binding.sourceType === 'WORKFLOW_VAR') {
          const variable = draft.variables.find((v) => v.key === binding.sourceReference)
          if (!variable) {
            warnings.push(
              t('Step \'{value}\' WORKFLOW_VAR \'{sourceReference}\' does not exist.', { value: stepLabel(step), sourceReference: binding.sourceReference }),
            )
          } else if (
            variable.dataType !== input.dataType &&
            !(variable.dataType === 'INTEGER' && input.dataType === 'DECIMAL')
          ) {
            warnings.push(
              t('Step \'{value}\' \'{key}\' type mismatch: variable {dataType} vs input {dataType2}.', { value: stepLabel(step), key: input.key, dataType: variable.dataType, dataType2: input.dataType }),
            )
          }
        }

        if (binding.sourceType === 'CONSTANT' && input.allowedValues?.length) {
          const value = String(binding.constantValue ?? '')
          if (value && !input.allowedValues.includes(value)) {
            warnings.push(
              t('Step \'{value}\' CONSTANT \'{key}\'="{value2}" is not an allowed value.', { value: stepLabel(step), key: input.key, value2: value }),
            )
          }
        }

        if (binding.sourceType === 'STEP_OUTPUT') {
          const typeMeta = metadata.stepTypes.find((s) => s.stepType === step.stepType)
          // Existence of earlier output is checked loosely; backend validates order.
          if (!binding.sourceReference || !binding.outputKey) {
            warnings.push(t('Step \'{value}\' STEP_OUTPUT for \'{key}\' is incomplete.', { value: stepLabel(step), key: input.key }))
          } else {
            void typeMeta
          }
        }
      }

      // INVENTORY_AVAILABLE runs once per Container at the pickup: containerId comes from the movement.
      if (step.operationCode === 'INVENTORY_AVAILABLE') {
        const containerBinding = step.inputBindings.containerId
        if (!containerBinding) {
          warnings.push(
            t('CHECK INVENTORY_AVAILABLE (\'{value}\') requires containerId. Bind it to CURRENT_MOVEMENT containerId.', { value: stepLabel(step) }),
          )
        }
      }
    }
  }

  return warnings
}

export type WorkflowEditorProps = {
  /** When set (Map Editor panel), overrides the route param. Use `'new'` to create. */
  workflowId?: string
  variant?: 'page' | 'panel'
  onClose?: () => void
  /** Called after create/version so the host can keep editing without leaving the map. */
  onSaved?: (id: string) => void
}

export function WorkflowEditor({
  workflowId: workflowIdProp,
  variant = 'page',
  onClose,
  onSaved,
}: WorkflowEditorProps) {
  const params = useParams()
  const id = workflowIdProp ?? params.id
  const isNew = !id || id === 'new'
  const isPanel = variant === 'panel'
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
  // Which workflow the draft was loaded from. Starts as null so that a workflow that is already cached is still loaded.
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState(0)
  const [selectedStep, setSelectedStep] = useState(0)
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [showPublishWarnings, setShowPublishWarnings] = useState(false)
  const [dragStep, setDragStep] = useState<{ taskIndex: number; stepIndex: number } | null>(null)
  const [dropStep, setDropStep] = useState<{ taskIndex: number; stepIndex: number } | null>(null)

  // Sync local draft when route/query identity changes (avoid cascading setState-in-effect lint).
  if (shouldLoadDraft(draftKey, loadedKey, isNew || Boolean(detailQuery.data))) {
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

  // A published workflow is fixed, and only someone who may change workflows (workflow.write) edits a draft.
  const canWrite = useAuth().can(PERMISSIONS.workflowWrite)
  const readOnly = status === 'PUBLISHED' || !canWrite

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) return createWorkflow(draft)
      return updateWorkflow(id!, draft)
    },
    onSuccess: (saved) => {
      setServerErrors([])
      setMessage(t('Saved.'))
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', saved.id] })
      if (isNew) {
        setDraft(toUpsert(saved))
        setStatus(saved.status)
        setDraftKey(saved.id)
        onSaved?.(saved.id)
        if (!isPanel) navigate(`/configure/workflows/${saved.id}`, { replace: true })
      } else {
        setDraft(toUpsert(saved))
        setStatus(saved.status)
        onSaved?.(saved.id)
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
      setMessage(t('Published.'))
      setDraft(toUpsert(saved))
      setStatus(saved.status)
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', saved.id] })
      onSaved?.(saved.id)
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
      onSaved?.(created.id)
      if (!isPanel) navigate(`/configure/workflows/${created.id}`)
    },
    onError: (err) => setServerErrors([(err as Error).message]),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkflow(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      // Not onSaved: the map editor host would reopen the id that was just deleted.
      if (isPanel) onClose?.()
      else navigate('/configure/workflows', { replace: true })
    },
    onError: (err) => setServerErrors([(err as Error).message]),
  })

  function runDelete() {
    const label = `${draft.code} v${detailQuery.data?.versionNo ?? ''}`.trim()
    const note = status === 'PUBLISHED' ? t(' It is published: transport requests can no longer pick it.') : ''
    if (window.confirm(t('Delete workflow {label}?{note} This cannot be undone.', { label, note }))) deleteMutation.mutate()
  }

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

  // After panel create we already have draft + draftKey=id; skip loading flash while detail refetches.
  if (metadataQuery.isLoading || (!isNew && detailQuery.isLoading && draftKey !== id)) {
    return <p>{t('Loading…')}</p>
  }

  if (metadataQuery.error) {
    return <p className="error">{(metadataQuery.error as Error).message}</p>
  }

  if (!isNew && detailQuery.error) {
    return <p className="error">{(detailQuery.error as Error).message}</p>
  }

  if (!metadata) return null

  function runSave() {
    setMessage(null)
    setShowPublishWarnings(false)
    saveMutation.mutate()
  }

  function runPublish() {
    setMessage(null)
    setShowPublishWarnings(true)
    if (clientWarnings.length > 0) return
    publishMutation.mutate()
  }

  const saveLabel = isNew ? t('Create workflow') : t('Save draft')
  const statusTone: Tone = status === 'PUBLISHED' ? 'green' : 'amber'
  const stepCount = draft.tasks.reduce((n, t) => n + t.steps.length, 0)

  const actionButtons = (
    <>
      {!readOnly && (
        <Button variant="primary" disabled={saveMutation.isPending} onClick={runSave}>
          <Icon name="save" size={15} />
          {saveMutation.isPending ? t('Saving…') : saveLabel}
        </Button>
      )}
      {!isNew && status === 'DRAFT' && canWrite && (
        <Button variant="surface" disabled={publishMutation.isPending} onClick={runPublish}>
          {publishMutation.isPending ? t('Publishing…') : t('Publish')}
        </Button>
      )}
      {!isNew && status === 'PUBLISHED' && canWrite && (
        <Button
          variant="primary"
          disabled={versionMutation.isPending}
          onClick={() => versionMutation.mutate()}
        >{t('New version')}</Button>
      )}
      {!isNew && canWrite && (
        <Button variant="dangerGhost" disabled={deleteMutation.isPending} onClick={runDelete}>
          <Icon name="trash" size={15} />
          {deleteMutation.isPending ? t('Deleting…') : t('Delete')}
        </Button>
      )}
      {isPanel && onClose && (
        <Button variant="surface" onClick={onClose}>{t('Done')}</Button>
      )}
    </>
  )

  const pageHeader = !isPanel && (
    <header className="wf-page-hero">
      <div className="wf-page-hero__top">
        <Link className="wf-page-hero__back" to="/configure/workflows">
          <Icon name="arrowLeft" size={16} />{' '}{t('Workflows')}</Link>
        <div className="wf-actions">{actionButtons}</div>
      </div>
      <div className="wf-page-hero__title-row">
        <div className="min-w-0">
          <p className="wf-page-hero__code">
            {draft.code || (isNew ? t('NEW DRAFT') : t('Workflow'))}
            {!isNew && detailQuery.data ? ` · v${detailQuery.data.versionNo}` : ''}
          </p>
          <h1 className="wf-page-hero__title">
            {isNew ? t('New workflow template') : draft.name || draft.code || t('Workflow editor')}
          </h1>
          <div className="wf-page-hero__meta">
            <StatusBadge tone={statusTone} withDot>
              {status}
            </StatusBadge>
            {!isNew && detailQuery.data?.createdAt ? (
              <span>{t('Created')}{' '}{formatDateTimeWithYear(detailQuery.data.createdAt)}</span>
            ) : null}
            {!isNew && detailQuery.data?.publishedAt ? (
              <span>{t('Published')}{' '}{formatDateTimeWithYear(detailQuery.data.publishedAt)}</span>
            ) : null}
          </div>
        </div>
      </div>
      {draft.description ? (
        <p className="wf-page-hero__desc">{draft.description}</p>
      ) : null}
      <div className="wf-page-hero__stats">
        <div className="wf-page-hero__stat">
          <span className="wf-page-hero__stat-label">{t('Variables')}</span>
          <span className="wf-page-hero__stat-value">{draft.variables.length}</span>
        </div>
        <div className="wf-page-hero__stat">
          <span className="wf-page-hero__stat-label">{t('Tasks')}</span>
          <span className="wf-page-hero__stat-value">{draft.tasks.length}</span>
        </div>
        <div className="wf-page-hero__stat">
          <span className="wf-page-hero__stat-label">{t('Steps')}</span>
          <span className="wf-page-hero__stat-value">{stepCount}</span>
        </div>
      </div>
    </header>
  )

  const panelHeader = isPanel && (
    <header className="wf-header">
      <div>
        <h1>{isNew ? t('New workflow template') : draft.name || draft.code || t('Workflow editor')}</h1>
        <p className="wf-panel-status">
          <StatusBadge tone={statusTone} withDot>
            {status}
          </StatusBadge>
          {!isNew && detailQuery.data ? (
            <span className="muted">v{detailQuery.data.versionNo}</span>
          ) : null}
        </p>
      </div>
    </header>
  )

  const editorBody = (
    <>
      {pageHeader}
      {panelHeader}

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
          <p>{t('Fix these issues before publish (client checks; backend ValidateForPublish is still the authority):')}</p>
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
          >{t('Publish anyway')}</button>
        </div>
      )}

      {readOnly ? (
        <>
          <ReadOnlyNotice published={status === 'PUBLISHED'} canWrite={canWrite} />
          <WorkflowReadOnlyView draft={draft} metadata={metadata} showIdentity={isPanel} />
        </>
      ) : (
        <>
      <fieldset className="wf-card">
        <div className="grid-2">
          <label>{t('Name')}<input
              value={draft.name}
              placeholder={t('e.g. Inbound Putaway')}
              onChange={(e) => {
                const name = e.target.value
                setDraft({ ...draft, name })
              }}
            />
            <span className="muted wf-code-preview">
              {draft.code ? (
                <>{t('Code:')}{' '}<code>{draft.code}</code>
                </>
              ) : (
                t('The code is generated when you save.')
              )}
            </span>
          </label>
          <label>{t('Description')}<input
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="wf-card">
        <legend>{t('Variables')}<button
            type="button"
            className="btn small"
            onClick={() =>
              setDraft({
                ...draft,
                variables: [...draft.variables, emptyVariable(draft.variables.length)],
              })
            }
          >{t('+ Variable')}</button>
        </legend>
        {draft.variables.length > 0 && (
          <div className="var-table" tabIndex={0} aria-label={t('Variables table, scroll horizontally')}>
            <div className="var-row var-row--head" aria-hidden>
              <span>{t('Key')}</span>
              <span>{t('Name')}</span>
              <span>{t('Type')}</span>
              <span>{t('Source')}</span>
              <span>{t('Required')}</span>
              <span>{t('Configured value')}</span>
              <span />
            </div>
            {draft.variables.map((variable, index) => (
              <div key={index} className="var-row">
                {variable.source === 'SYSTEM_VALUE' ? (
                  <select
                    aria-label={t('System variable key')}
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
                    <option value="">{t('Select SYSTEM_VALUE…')}</option>
                    {metadata.systemVariables.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.key}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder={t('key')}
                    aria-label={t('Variable key')}
                    value={variable.key}
                    onChange={(e) => updateVariable(index, { key: e.target.value })}
                  />
                )}
                <input
                  placeholder={t('name')}
                  aria-label={t('Variable name')}
                  value={variable.name}
                  onChange={(e) => updateVariable(index, { name: e.target.value })}
                />
                <select
                  aria-label={t('Data type')}
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
                  aria-label={t('Variable source')}
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
                <label className="checkbox var-row__required">
                  <input
                    type="checkbox"
                    checked={variable.isRequired}
                    onChange={(e) => updateVariable(index, { isRequired: e.target.checked })}
                  />
                </label>
                {variable.source === 'ADMIN_INPUT' ? (
                  <input
                    type={
                      variable.dataType === 'INTEGER' || variable.dataType === 'DECIMAL'
                        ? 'number'
                        : 'text'
                    }
                    step={variable.dataType === 'DECIMAL' ? 'any' : undefined}
                    placeholder={t('configured value')}
                    aria-label={t('Configured value')}
                    value={
                      variable.configuredValue == null ||
                      (typeof variable.configuredValue === 'number' &&
                        !Number.isFinite(variable.configuredValue))
                        ? ''
                        : String(variable.configuredValue)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim()
                      let value: unknown = e.target.value
                      if (raw === '') value = undefined
                      else if (variable.dataType === 'INTEGER') {
                        const n = Number.parseInt(raw, 10)
                        value = Number.isFinite(n) ? n : undefined
                      } else if (variable.dataType === 'DECIMAL') {
                        const n = Number.parseFloat(raw)
                        value = Number.isFinite(n) ? n : undefined
                      } else if (variable.dataType === 'BOOLEAN') {
                        value = raw === 'true'
                      }
                      updateVariable(index, { configuredValue: value })
                    }}
                  />
                ) : (
                  <span className="var-row__empty muted">—</span>
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
                >{t('Remove')}</button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="wf-card wf-tree">
        <legend>{t('Tasks & Steps')}<button
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
          >{t('+ Task')}</button>
        </legend>
        <p className="wf-tree__hint muted">{t('Steps belong to the task above them. Click + Step to open its config right away. Drag the handle to reorder steps.')}</p>

        {draft.tasks.length === 0 && (
          <p className="muted">{t('No tasks yet. Add a task, then add steps under that task.')}</p>
        )}

        <div className="wf-tree__list">
          {draft.tasks.map((taskBlock, taskIndex) => {
            const taskOpen = selectedTask === taskIndex
            return (
              <div
                key={taskIndex}
                className={`wf-task-block${taskOpen ? ' wf-task-block--open' : ''}`}
              >
                <div className="wf-task-block__head">
                  <button
                    type="button"
                    className="wf-task-block__toggle"
                    aria-expanded={taskOpen}
                    onClick={() => {
                      setSelectedTask(taskIndex)
                      if (taskBlock.steps.length > 0) setSelectedStep(0)
                    }}
                  >
                    <span className="wf-task-block__chevron" aria-hidden>
                      {taskOpen ? '▾' : '▸'}
                    </span>
                    <span className="wf-task-block__title">{t('Task {value}', { value: taskIndex + 1 })}{taskBlock.name ? (
                        <>
                          : <strong>{taskBlock.name}</strong>
                        </>
                      ) : null}
                    </span>
                    <span className="wf-task-block__count">
                      {taskBlock.steps.length} {taskBlock.steps.length === 1 ? t('step') : t('steps')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    title={t('Remove task')}
                    onClick={() => {
                      const nextTasks = draft.tasks.filter((_, i) => i !== taskIndex)
                      setDraft({ ...draft, tasks: nextTasks })
                      if (selectedTask >= nextTasks.length) {
                        setSelectedTask(Math.max(0, nextTasks.length - 1))
                      }
                      setSelectedStep(0)
                    }}
                  >{t('Remove')}</button>
                </div>

                {taskOpen && (
                  <div className="wf-task-block__body">
                    <div className="grid-2">
                      <label>{t('Name')}<input
                          value={taskBlock.name}
                          onChange={(e) => updateTask(taskIndex, { name: e.target.value })}
                        />
                      </label>
                    </div>

                    <div className="wf-steps-under-task">
                      <div className="wf-steps-under-task__bar">
                        <strong>{t('Steps in this task')}</strong>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => {
                            const next = emptyStep(taskBlock.steps.length + 1)
                            updateTask(taskIndex, { steps: [...taskBlock.steps, next] })
                            setSelectedTask(taskIndex)
                            setSelectedStep(taskBlock.steps.length)
                          }}
                        >{t('+ Step')}</button>
                      </div>

                      {taskBlock.steps.length === 0 && (
                        <p className="muted">{t('No steps in this task yet.')}</p>
                      )}

                      <ul className="wf-step-list">
                        {taskBlock.steps.map((s, stepIndex) => {
                          const stepOpen =
                            selectedTask === taskIndex && selectedStep === stepIndex
                          const isDropTarget =
                            dropStep?.taskIndex === taskIndex &&
                            dropStep.stepIndex === stepIndex &&
                            dragStep != null &&
                            !(
                              dragStep.taskIndex === taskIndex &&
                              dragStep.stepIndex === stepIndex
                            )
                          return (
                            <li
                              key={stepIndex}
                              className={[
                                'wf-step-card',
                                stepOpen ? 'wf-step-card--open' : '',
                                isDropTarget ? 'wf-step-card--drop' : '',
                                dragStep?.taskIndex === taskIndex &&
                                dragStep.stepIndex === stepIndex
                                  ? 'wf-step-card--dragging'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onDragOver={(e: DragEvent) => {
                                if (dragStep?.taskIndex !== taskIndex) return
                                e.preventDefault()
                                setDropStep({ taskIndex, stepIndex })
                              }}
                              onDrop={(e: DragEvent) => {
                                e.preventDefault()
                                if (dragStep?.taskIndex !== taskIndex) return
                                const from = dragStep.stepIndex
                                const to = stepIndex
                                setDragStep(null)
                                setDropStep(null)
                                if (from === to) return
                                updateTask(taskIndex, {
                                  steps: reorderItem(taskBlock.steps, from, to),
                                })
                                setSelectedTask(taskIndex)
                                setSelectedStep(to)
                              }}
                            >
                              <div className="wf-step-card__head">
                                <button
                                  type="button"
                                  className="wf-step-card__handle"
                                  title={t('Drag to reorder')}
                                  draggable={!readOnly}
                                  aria-label={t('Drag step {value}', { value: stepIndex + 1 })}
                                  onDragStart={(e: DragEvent) => {
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', String(stepIndex))
                                    setDragStep({ taskIndex, stepIndex })
                                  }}
                                  onDragEnd={() => {
                                    setDragStep(null)
                                    setDropStep(null)
                                  }}
                                >
                                  ⠿
                                </button>
                                <button
                                  type="button"
                                  className="wf-step-card__toggle"
                                  aria-expanded={stepOpen}
                                  onClick={() => {
                                    setSelectedTask(taskIndex)
                                    setSelectedStep(stepIndex)
                                  }}
                                >
                                  <span className="wf-step-list__index">{t('Step')}{' '}{stepIndex + 1}</span>
                                  <span className="wf-step-list__label">
                                    {s.name || t('Untitled step')}
                                  </span>
                                  <span className="wf-step-list__meta muted">
                                    {s.stepType}
                                    {s.operationCode ? ` · ${s.operationCode}` : ''}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn small danger"
                                  title={t('Remove step')}
                                  onClick={() => {
                                    const nextSteps = taskBlock.steps.filter((_, i) => i !== stepIndex)
                                    updateTask(taskIndex, { steps: nextSteps })
                                    if (
                                      selectedTask === taskIndex &&
                                      selectedStep >= nextSteps.length
                                    ) {
                                      setSelectedStep(Math.max(0, nextSteps.length - 1))
                                    }
                                  }}
                                >{t('Remove')}</button>
                              </div>

                              {stepOpen && step && (
                                <div className="step-form">
                                  <div className="grid-2">
                                    <label>{t('Name')}<input
                                        value={step.name}
                                        onChange={(e) =>
                                          updateStep(taskIndex, stepIndex, {
                                            name: e.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                    <label>{t('Step type')}<select
                                        value={step.stepType}
                                        onChange={(e) =>
                                          updateStep(taskIndex, stepIndex, {
                                            stepType: e.target.value as StepType,
                                            operationCode: '',
                                            inputBindings: {},
                                          })
                                        }
                                      >
                                        {metadata.stepTypes.map((meta) => (
                                          <option key={meta.stepType} value={meta.stepType}>
                                            {meta.stepType}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>{t('Operation')}<select
                                        value={step.operationCode}
                                        onChange={(e) => applyOperationCode(e.target.value)}
                                      >
                                        <option value="">{t('Select…')}</option>
                                        {stepTypeMeta?.operations.map((o) => (
                                          <option key={o.code} value={o.code}>
                                            {o.code}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>{t('On failure')}<select
                                        value={step.onFailure}
                                        onChange={(e) =>
                                          updateStep(taskIndex, stepIndex, {
                                            onFailure: e.target
                                              .value as WorkflowStepDraft['onFailure'],
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
                                    <label>{t('Timeout (s)')}<input
                                        type="number"
                                        value={step.timeoutSeconds}
                                        onChange={(e) =>
                                          updateStep(taskIndex, stepIndex, {
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
                                        <span className="muted scope-hint">{t('CURRENT_MOVEMENT is not available for this operation.')}</span>
                                      )}
                                    </div>
                                  )}

                                  {needsAssignedRobotId && (
                                    <div className="add-system-var-prompt">
                                      <span>{t('This operation requires robotId.')}</span>
                                      <button
                                        type="button"
                                        className="btn small"
                                        onClick={addAssignedRobotId}
                                      >{t('Add required system variable: assignedRobotId')}</button>
                                    </div>
                                  )}

                                  {step.stepType === 'HUMAN_INTERACTION' && (
                                    <label>{t('Instruction')}<input
                                        value={step.instructionText ?? ''}
                                        onChange={(e) =>
                                          updateStep(taskIndex, stepIndex, {
                                            instructionText: e.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                  )}

                                  <h3>{t('Input bindings')}</h3>
                                  {!operationMeta && (
                                    <p className="muted">{t('Select an operation to bind inputs.')}</p>
                                  )}
                                  {operationMeta?.inputs.map((input) => (
                                    <BindingEditor
                                      key={input.key}
                                      input={input}
                                      binding={step.inputBindings[input.key]}
                                      variables={draft.variables}
                                      tasks={draft.tasks}
                                      currentTaskIndex={taskIndex}
                                      currentStepIndex={stepIndex}
                                      metadata={metadata}
                                      executionScope={operationMeta.executionScope}
                                      stopActionFilter={operationMeta.stopActionFilter}
                                      readOnlyConstant={isAutoSyncedOperationField(
                                        stepTypeMeta,
                                        input.key,
                                      )}
                                      onChange={(binding) =>
                                        updateStep(taskIndex, stepIndex, {
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
                                      <h3>{t('Outputs (read-only metadata)')}</h3>
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
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>
        </>
      )}
    </>
  )

  if (isPanel) {
    return (
      <section className="wf-page wf-page--panel">
        <div className="wf-page--panel__scroll">{editorBody}</div>
        <footer className="wf-panel-actions">
          <div className="wf-panel-actions__row">{actionButtons}</div>
        </footer>
      </section>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1100px] px-10 pt-8 pb-16">
        <section className="wf-page wf-page--full">{editorBody}</section>
      </div>
    </div>
  )
}

/** Full-page route wrapper for `/configure/workflows/new` and `/:id`. */
export function WorkflowEditorPage() {
  return <WorkflowEditor variant="page" />
}
