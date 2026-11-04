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
  /**
   * `pill` — toolbar search (rounded-full).
   * `field` — form control aligned with `controlClass` selects (full width, bordered, icon inset).
   */
  variant?: 'pill' | 'field'
  autoFocus?: boolean
  className?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  tone = 'tonal',
  variant = 'pill',
  autoFocus,
  className,
}: SearchInputProps) {
  const field = variant === 'field'

  return (
    <label
      className={cx(
        // Explicit row + nowrap so icon and text stay on one line.
        'box-border flex h-9 w-full min-w-0 flex-row flex-nowrap items-center gap-2 text-muted',
        'transition-colors duration-200',
        field
          ? 'rounded-sm border border-outline bg-container-high px-2.5 hover:border-ink/30 focus-within:border-blue focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-blue/25'
          : cx(
              'rounded-full px-3.5 focus-within:outline-2 focus-within:outline-blue/60',
              tone === 'surface' ? 'bg-surface' : 'bg-container-high',
            ),
        className,
      )}
      style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }}
    >
      <Icon name="search" size={15} className="pointer-events-none block shrink-0" />
      <input
        className={cx(
          'box-border m-0 min-h-0 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0',
          'align-middle text-ink shadow-none outline-none placeholder:text-muted',
          field ? 'h-auto text-xs leading-normal' : 'h-auto text-sm leading-normal',
        )}
        style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, height: 'auto' }}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Search'}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
