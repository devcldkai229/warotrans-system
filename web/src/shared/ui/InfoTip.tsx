import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cx } from '@/shared/lib/cx'
import { Icon } from './Icon'

interface InfoTipProps {
  /** What the "i" explains, for screen readers ("Why this workflow cannot be changed"). */
  label: string
  children: ReactNode
  /** Which edge of the "i" the bubble lines up with. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * A small "i" that shows an explanation on hover or keyboard focus. A click keeps it open (touch screens have no
 * hover); Escape or a click elsewhere closes it.
 */
export function InfoTip({ label, children, align = 'start', className }: InfoTipProps) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const id = useId()
  const open = hovered || pinned

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false)
        setHovered(false)
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <span
      ref={root}
      className={cx('relative inline-flex', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={cx(
          'grid size-6 place-items-center rounded-full transition-colors duration-200',
          open ? 'bg-container-high text-ink' : 'text-muted hover:bg-container-high hover:text-ink',
        )}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setPinned((value) => !value)}
      >
        <Icon name="info" size={15} />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cx(
            'absolute top-[calc(100%+6px)] z-50 w-80 max-w-[calc(100vw-32px)] rounded-md bg-surface p-3',
            'text-left text-xs leading-relaxed font-normal text-ink-2 shadow-float',
            align === 'start' ? 'left-0' : 'right-0',
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}
