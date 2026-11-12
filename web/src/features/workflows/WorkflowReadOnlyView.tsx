import { useState } from 'react'
import type { OperationMetadata, WorkflowMetadata, WorkflowUpsert } from '@/shared/api/types'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/ui/Button'
import { InfoTip } from '@/shared/ui/InfoTip'
import { inputRows, valueText, variableValue } from './readOnlyView'
import { ScopeBadge } from './scope-badge'

function operationOf(metadata: WorkflowMetadata, stepType: string, operationCode: string): OperationMetadata | null {
  return metadata.stepTypes.find((s) => s.stepType === stepType)?.operations.find((o) => o.code === operationCode) ?? null
}

/** Why the workflow cannot be changed here, and what to do instead: an "i" beside the status badge. */
export function ReadOnlyInfo({ published, canWrite }: { published: boolean; canWrite: boolean }) {
  const text = published
    ? canWrite
      ? t('This workflow is published, so it is fixed: Jobs that ran on it can always be traced back to what it said. Everything is open to read below. To change it, create a new version; the new version starts as a draft.')
      : t('This workflow is published, so it is fixed. Everything is open to read below.')
    : t('You can read this draft but not change it: changing workflows needs the workflow.write permission.')
  return <InfoTip label={t('Why this workflow cannot be changed')}>{text}</InfoTip>
}

/**
 * A workflow that cannot be edited (published, or the viewer may not change it), laid out to be read: the variables, then
 * each task and each step opened to see its type, operation, how often it runs, what to do when it fails and where each
 * input comes from. Nothing here is a form control, so nothing is greyed out and every value is shown in full.
 */
export function WorkflowReadOnlyView({
  draft,
  metadata,
  showIdentity,
}: {
  draft: WorkflowUpsert
  metadata: WorkflowMetadata
  /** The panel has no page header, so it shows the name, code and description itself. */
  showIdentity: boolean
}) {
  const [openTasks, setOpenTasks] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    return next
  }
  const everyStep = draft.tasks.flatMap((task, taskIndex) => task.steps.map((_, stepIndex) => `${taskIndex}:${stepIndex}`))
  const allOpen = draft.tasks.length > 0 && openTasks.size === draft.tasks.length && openSteps.size === everyStep.length

  return (
    <div className="wf-view">
      {showIdentity ? (
        <section className="wf-card wf-view__card" aria-label={t('Workflow')}>
          <dl className="wf-view__dl">
            <dt>{t('Name')}</dt>
            <dd>{draft.name || '—'}</dd>
            <dt>{t('Code')}</dt>
            <dd>
              <code>{draft.code || '—'}</code>
            </dd>
            <dt>{t('Description')}</dt>
            <dd>{draft.description || '—'}</dd>
          </dl>
        </section>
      ) : null}

      <section className="wf-card wf-view__card" aria-label={t('Variables')}>
        <h2 className="wf-view__title">{t('Variables')}</h2>
        {draft.variables.length === 0 ? (
          <p className="muted">{t('This workflow has no variables.')}</p>
        ) : (
          <div className="wf-view__scroll" tabIndex={0} aria-label={t('Variables table, scroll horizontally')}>
            <table className="wf-view__table">
              <thead>
                <tr>
                  <th>{t('Key')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Source')}</th>
                  <th>{t('Required')}</th>
                  <th>{t('Configured value')}</th>
                </tr>
              </thead>
              <tbody>
                {draft.variables.map((variable) => (
                  <tr key={variable.key}>
                    <td>
                      <code>{variable.key}</code>
                    </td>
                    <td>{variable.name || '—'}</td>
                    <td>{variable.dataType}</td>
                    <td>{variable.source}</td>
                    <td>{variable.isRequired ? t('Yes') : t('No')}</td>
                    <td>{variableValue(variable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wf-card wf-view__card" aria-label={t('Tasks & Steps')}>
        <div className="wf-view__bar">
          <h2 className="wf-view__title">{t('Tasks & Steps')}</h2>
          {draft.tasks.length > 0 ? (
            <Button
              variant="surface"
              size="sm"
              onClick={() => {
                setOpenTasks(allOpen ? new Set() : new Set(draft.tasks.map((_, index) => index)))
                setOpenSteps(allOpen ? new Set() : new Set(everyStep))
              }}
            >
              {allOpen ? t('Collapse all') : t('Expand all')}
            </Button>
          ) : null}
        </div>
        {draft.tasks.length === 0 ? <p className="muted">{t('This workflow has no tasks.')}</p> : null}

        <div className="wf-tree__list">
          {draft.tasks.map((task, taskIndex) => {
            const taskOpen = openTasks.has(taskIndex)
            return (
              <div key={taskIndex} className={`wf-task-block${taskOpen ? ' wf-task-block--open' : ''}`}>
                <div className="wf-task-block__head">
                  <button
                    type="button"
                    className="wf-task-block__toggle"
                    aria-expanded={taskOpen}
                    onClick={() => setOpenTasks(toggle(openTasks, taskIndex))}
                  >
                    <span className="wf-task-block__chevron" aria-hidden>
                      {taskOpen ? '▾' : '▸'}
                    </span>
                    <span className="wf-task-block__title">
                      {t('Task {value}', { value: taskIndex + 1 })}
                      {task.name ? (
                        <>
                          : <strong>{task.name}</strong>
                        </>
                      ) : null}
                    </span>
                    <span className="wf-task-block__count">
                      {task.steps.length} {task.steps.length === 1 ? t('step') : t('steps')}
                    </span>
                  </button>
                </div>

                {taskOpen ? (
                  <div className="wf-task-block__body">
                    {task.steps.length === 0 ? <p className="muted">{t('No steps in this task yet.')}</p> : null}
                    <ul className="wf-step-list">
                      {task.steps.map((step, stepIndex) => {
                        const key = `${taskIndex}:${stepIndex}`
                        const stepOpen = openSteps.has(key)
                        const operation = operationOf(metadata, step.stepType, step.operationCode)
                        const inputs = inputRows(step, operation, draft.tasks, draft.variables)
                        return (
                          <li key={key} className={`wf-step-card${stepOpen ? ' wf-step-card--open' : ''}`}>
                            <div className="wf-step-card__head">
                              <button
                                type="button"
                                className="wf-step-card__toggle"
                                aria-expanded={stepOpen}
                                onClick={() => setOpenSteps(toggle(openSteps, key))}
                              >
                                <span className="wf-step-list__index">
                                  {t('Step')} {stepIndex + 1}
                                </span>
                                <span className="wf-step-list__label">{step.name || t('Untitled step')}</span>
                                <span className="wf-step-list__meta muted">
                                  {step.stepType}
                                  {step.operationCode ? ` · ${step.operationCode}` : ''}
                                </span>
                              </button>
                            </div>

                            {stepOpen ? (
                              <div className="wf-view__step">
                                <dl className="wf-view__dl">
                                  <dt>{t('Step type')}</dt>
                                  <dd>{step.stepType}</dd>
                                  <dt>{t('Operation')}</dt>
                                  <dd>
                                    {step.operationCode ? <code>{step.operationCode}</code> : '—'}
                                    {operation?.description ? <span className="muted wf-view__aside">{operation.description}</span> : null}
                                  </dd>
                                  {operation?.executionScope ? (
                                    <>
                                      <dt>{t('Runs')}</dt>
                                      <dd>
                                        <ScopeBadge scope={operation.executionScope} stopAction={operation.stopActionFilter} />
                                      </dd>
                                    </>
                                  ) : null}
                                  <dt>{t('On failure')}</dt>
                                  <dd>{step.onFailure}</dd>
                                  <dt>{t('Timeout (s)')}</dt>
                                  <dd>{valueText(step.timeoutSeconds)}</dd>
                                  {step.maxAttempts > 1 ? (
                                    <>
                                      <dt>{t('Attempts')}</dt>
                                      <dd>{t('{count} (wait {seconds} s between)', { count: step.maxAttempts, seconds: step.retryBackoffSeconds })}</dd>
                                    </>
                                  ) : null}
                                  {step.stepType === 'HUMAN_INTERACTION' ? (
                                    <>
                                      <dt>{t('Instruction')}</dt>
                                      <dd>{step.instructionText || '—'}</dd>
                                    </>
                                  ) : null}
                                </dl>

                                {/* Inputs and outputs as one table each: a row per input, its note under its name and
                                    a rule between rows, so a description can never be read as the next input's. */}
                                <h3 className="wf-view__sub">{t('Inputs')}</h3>
                                {inputs.length === 0 ? (
                                  <p className="muted">{t('This step takes no inputs.')}</p>
                                ) : (
                                  <div className="wf-view__scroll">
                                    <table className="wf-view__io">
                                      <thead>
                                        <tr>
                                          <th>{t('Input')}</th>
                                          <th>{t('Type')}</th>
                                          <th>{t('Source')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {inputs.map((input) => (
                                          <tr key={input.key}>
                                            <td>
                                              <code className="wf-view__io-key">{input.key}</code>
                                              {input.required !== null || input.description ? (
                                                <span className="wf-view__io-note">
                                                  {[
                                                    input.required === null ? null : input.required ? t('Required') : t('Optional'),
                                                    input.description,
                                                  ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                                </span>
                                              ) : null}
                                            </td>
                                            <td className="wf-view__io-type">{input.dataType ?? '—'}</td>
                                            <td>
                                              <span className="wf-view__io-kind">{input.source.kind}</span>
                                              {input.source.value !== null ? <code className="wf-view__io-value">{input.source.value}</code> : null}
                                              {input.source.note ? <span className="wf-view__io-note">{input.source.note}</span> : null}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {operation && operation.outputs.length > 0 ? (
                                  <>
                                    <h3 className="wf-view__sub">{t('Outputs (read-only metadata)')}</h3>
                                    <div className="wf-view__scroll">
                                      <table className="wf-view__io">
                                        <thead>
                                          <tr>
                                            <th>{t('Output')}</th>
                                            <th>{t('Type')}</th>
                                            <th>{t('Description')}</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {operation.outputs.map((output) => (
                                            <tr key={output.key}>
                                              <td>
                                                <code className="wf-view__io-key">{output.key}</code>
                                              </td>
                                              <td className="wf-view__io-type">{output.dataType}</td>
                                              <td className="wf-view__io-desc">{output.description || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
