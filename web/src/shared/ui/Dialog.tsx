import type { FormEvent, ReactNode } from 'react'
import { Icon } from './Icon'
import './Dialog.css'

interface DialogProps {
  title: string
  submitLabel: string
  onClose: () => void
  onSubmit: () => void
  children: ReactNode
}

/** Modal form used by the admin screens. The caller owns validation and the actual save. */
export function Dialog({ title, submitLabel, onClose, onSubmit, children }: DialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="dialog" role="presentation" onClick={onClose}>
      <form
        className="dialog__card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}
