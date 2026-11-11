import type { FormEvent, ReactNode } from 'react'
import { cx } from '@/shared/lib/cx'
import { Button, IconButton } from './Button'
import { Icon } from './Icon'
import { t } from '@/shared/i18n'
interface ModalProps {

  title: string
  subtitle?: string
  onClose: () => void
  /** False when a click beside the card must not dismiss it, e.g. while it shows something that cannot be shown again. */
  closeOnBackdrop?: boolean
  /** Tailwind width class of the card. */
  width?: string
  children: ReactNode
}

/** Dimmed backdrop with a centred card. Clicking the backdrop closes it. */
export function Modal({ title, subtitle, onClose, closeOnBackdrop = true, width = 'w-[480px]', children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-100 grid place-items-center bg-scrim p-4" role="presentation" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className={cx('max-h-full max-w-full overflow-auto rounded-lg bg-surface shadow-modal', width)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-xl font-book">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
          </div>
          <IconButton aria-label={t('Close')} className="-mt-1 -mr-2" onClick={onClose}>
            <Icon name="close" size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  )
}

interface DialogProps {
  title: string
  submitLabel: string
  onClose: () => void
  onSubmit: () => void
  /** True while the save runs: the submit button is disabled and says so. */
  busy?: boolean
  /** Tailwind width class of the card, for forms that list wide rows. */
  width?: string
  children: ReactNode
}

/** Modal form used by the admin screens. The caller owns validation and the actual save. */
export function Dialog({ title, submitLabel, onClose, onSubmit, busy = false, width, children }: DialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Modal title={title} onClose={onClose} width={width}>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
        <footer className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t('Saving…') : submitLabel}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
