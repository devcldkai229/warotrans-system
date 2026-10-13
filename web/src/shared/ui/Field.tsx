import type { ReactNode } from 'react'
import { cx } from '@/shared/lib/cx'
import { Icon } from './Icon'

interface FieldProps {
  label: string
  hint?: string
  className?: string
  children: ReactNode
}

/** A labelled form control: the label wraps the control, so no `id` wiring is needed. */
export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2', className)}>
      {label}
      {children}
      {hint ? <span className="font-normal text-muted">{hint}</span> : null}
    </label>
  )
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-red-soft px-3 py-2 text-xs font-medium text-red-ink">
      {children}
    </p>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** `surface` when the field sits on a grey container. */
  tone?: 'tonal' | 'surface'
  autoFocus?: boolean
  className?: string
}

export function SearchInput({ value, onChange, placeholder, tone = 'tonal', autoFocus, className }: SearchInputProps) {
  return (
    <label
      className={cx(
        'flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 text-muted transition-colors duration-200',
        'focus-within:outline-2 focus-within:outline-blue/60',
        tone === 'surface' ? 'bg-surface' : 'bg-container-high',
        className,
      )}
    >
      <Icon name="search" size={15} />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        placeholder={placeholder}
        aria-label={placeholder ?? 'Search'}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
