import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'

interface SectionHeadProps {
  title: string
  hint?: string
  children?: ReactNode
}

/** Title line of a Management section: what it is, and the filters / add button on the right. */
export function SectionHead({ title, hint, children }: SectionHeadProps) {
  return (
    <header className="mb-6 flex items-end justify-between gap-8">
      <div className="min-w-0">
        <h2 className="text-xl font-book">{title}</h2>
        {hint ? <p className="mt-1.5 text-sm text-ink-2">{hint}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  )
}

/** The "add a record" button of a section. */
export function AddButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button variant="primary" onClick={onClick}>
      <Icon name="plus" size={15} /> {children}
    </Button>
  )
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-muted">{children}</p>
}
