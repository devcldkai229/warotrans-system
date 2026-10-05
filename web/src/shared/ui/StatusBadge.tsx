import type { Tone } from './statusTones'

interface StatusBadgeProps {
  tone: Tone
  children: string
  withDot?: boolean
}

export function StatusBadge({ tone, children, withDot = false }: StatusBadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {withDot ? <span className="dot" /> : null}
      {children}
    </span>
  )
}
