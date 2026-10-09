import type { ReactNode } from 'react'

interface SectionHeadProps {
  title: string
  hint?: string
  children?: ReactNode
}

/** Title line of a Management section: what it is, and the filters / add button on the right. */
export function SectionHead({ title, hint, children }: SectionHeadProps) {
  return (
    <header className="msec__head">
      <div>
        <h2>{title}</h2>
        {hint ? <p>{hint}</p> : null}
      </div>
      {children ? <div className="msec__tools">{children}</div> : null}
    </header>
  )
}
