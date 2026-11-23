import { useState } from 'react'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { problemsFor, type ContainerProblemScope } from '@/features/operations/containerProblems'

export interface ContainerProblemChoice {
  /** The problems chosen, the main one first (one, unless `multiple`). */
  codes: string[]
  note: string
  containerId: string
}

interface ContainerProblemDialogProps {
  title: string
  /** What happens when it is sent, e.g. "The container leaves the Job and is held where it is." */
  subtitle: string
  submitLabel: string
  /** HANDOVER: what is seen from outside; INSPECTION: also what is inside. */
  scope: ContainerProblemScope
  /** An inspection may find several problems at once. */
  multiple?: boolean
  /** The containers to choose from; with one it is chosen already. */
  containers: { id: string; label: string }[]
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (choice: ContainerProblemChoice) => void
}

/**
 * Says what is wrong with a container, with the one list of problem codes: "Container failed" at a handover, a failed
 * inspection, or a problem reported from the web. A note is always required (what the person saw).
 */
export function ContainerProblemDialog({
  title,
  subtitle,
  submitLabel,
  scope,
  multiple = false,
  containers,
  busy = false,
  error = null,
  onClose,
  onSubmit,
}: ContainerProblemDialogProps) {
  const options = problemsFor(scope)
  const [codes, setCodes] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [containerId, setContainerId] = useState(containers.length === 1 ? containers[0].id : '')
  const [tried, setTried] = useState(false)

  const toggle = (code: string) =>
    setCodes((current) =>
      multiple ? (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]) : [code],
    )
  const missing = codes.length === 0 ? t('Choose what is wrong.') : !containerId ? t('Choose the container.') : !note.trim() ? t('Say what you saw.') : null

  return (
    <Dialog
      title={title}
      submitLabel={submitLabel}
      busy={busy}
      width="w-[560px]"
      onClose={onClose}
      onSubmit={() => {
        setTried(true)
        if (!missing) onSubmit({ codes, note: note.trim(), containerId })
      }}
    >
      <p className="-mt-1 text-sm text-ink-2">{subtitle}</p>

      {containers.length > 1 ? (
        <Field label={t('Container')}>
          <select className={controlClass('md')} value={containerId} onChange={(event) => setContainerId(event.target.value)}>
            <option value="">{t('Choose…')}</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      ) : containers.length === 1 ? (
        <p className="text-sm">
          {t('Container')}: <b className="font-mono font-medium">{containers[0].label}</b>
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{multiple ? t('What is wrong (one or more)') : t('What is wrong')}</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role={multiple ? 'group' : 'radiogroup'}>
          {options.map((p) => {
            const chosen = codes.includes(p.code)
            return (
              <button
                key={p.code}
                type="button"
                role={multiple ? 'checkbox' : 'radio'}
                aria-checked={chosen}
                onClick={() => toggle(p.code)}
                className={cx(
                  'flex flex-col items-start rounded-sm border px-3 py-2 text-left transition-colors duration-200',
                  chosen ? 'border-primary bg-blue-soft/50' : 'border-outline-soft hover:bg-container-high',
                )}
              >
                <span className="text-sm font-medium">
                  {p.label}
                  {p.blocksHandover ? <span className="ml-1.5 text-[11px] font-normal text-red-ink">{t('blocks confirm')}</span> : null}
                  {p.scope === 'INSPECTION' ? <span className="ml-1.5 text-[11px] font-normal text-muted">{t('inside')}</span> : null}
                </span>
                <span className="text-xs text-muted">{p.hint}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <Field label={t('Note')}>
        <textarea
          className={controlClass('md')}
          rows={2}
          maxLength={500}
          placeholder={t('What did you see?')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {tried && missing ? <FormError>{missing}</FormError> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  )
}
