import type { ReactNode } from 'react'
import { cx } from '@/shared/lib/cx'

interface CellProps {
  children?: ReactNode
  align?: 'left' | 'right'
  className?: string
}

/** Data table on the page background: quiet header, hairline rows, no outer frame. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cx('w-full border-collapse text-sm', className)}>{children}</table>
}

export function Th({ children, align = 'left', className }: CellProps) {
  return (
    <th
      className={cx(
        'border-b border-outline px-4 py-3 text-xs font-normal text-muted',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

interface TdProps extends CellProps {
  /** `strong` for the cell that names the row, `faint` for supporting values. */
  tone?: 'default' | 'strong' | 'faint'
  colSpan?: number
}

export function Td({ children, align = 'left', tone = 'default', colSpan, className }: TdProps) {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        'border-b border-outline-soft px-4 py-3.5 group-last/row:border-b-0',
        align === 'right' ? 'text-right tabular-nums' : 'text-left',
        tone === 'strong' && 'font-medium text-ink',
        tone === 'faint' && 'text-muted',
        tone === 'default' && 'text-ink-2',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx('group/row transition-colors duration-200 hover:bg-container', className)}>{children}</tr>
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  )
}
