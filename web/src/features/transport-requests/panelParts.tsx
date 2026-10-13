import type { ReactNode } from 'react'
import { IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'

// Building blocks shared by the Request and Job drawers that float over the map.

interface DrawerProps {
  label: string
  kind: string
  code: string
  status: string
  tone: Tone
  onClose: () => void
  children: ReactNode
}

export function Drawer({ label, kind, code, status, tone, onClose, children }: DrawerProps) {
  return (
    <aside
      className="pointer-events-auto flex min-h-0 w-[360px] animate-panel-in flex-col rounded-lg bg-surface shadow-float motion-reduce:animate-none"
      aria-label={label}
    >
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="mr-auto min-w-0">
          <span className="block text-xs text-muted">{kind}</span>
          <strong className="block truncate font-mono text-sm font-medium">{code}</strong>
        </div>
        <StatusBadge tone={tone}>{status}</StatusBadge>
        <IconButton size="sm" aria-label="Close" className="-mr-1" onClick={onClose}>
          <Icon name="close" size={15} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">{children}</div>
    </aside>
  )
}

export function MetaList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>
}

export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export function DrawerHeading({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 mb-1 text-sm font-medium">{children}</h2>
}

export function FailureNote({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-sm bg-red-soft px-3 py-2 text-xs text-red-ink">{children}</p>
}

interface LineItemProps {
  sequence: number
  title: string
  /** Barcodes and other machine identifiers are set in the code face. */
  code?: boolean
  note: string
  status: string
  tone: Tone
}

/** One numbered line of a plan: a Container movement or a Job step. */
export function LineItem({ sequence, title, code = false, note, status, tone }: LineItemProps) {
  return (
    <li className="flex items-center gap-3 border-b border-outline-soft py-2.5 last:border-b-0">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-container-high text-xs text-ink-2 tabular-nums">
        {sequence}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-xs">
        <strong className={code ? 'font-mono font-medium' : 'font-medium'}>{title}</strong>
        <span className="truncate text-muted">{note}</span>
      </span>
      <StatusBadge tone={tone}>{status}</StatusBadge>
    </li>
  )
}
