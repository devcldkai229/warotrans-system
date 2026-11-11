import { t } from '@/shared/i18n'

const SCOPE_LABELS: Record<string, string> = {
  ONCE_PER_JOB: t('Once per job'),
  ONCE_PER_STOP: t('Once per stop'),
  PER_CONTAINER_AT_STOP: t('Per container at stop'),
}

const SCOPE_TOOLTIPS: Record<string, string> = {
  ONCE_PER_JOB: t('Step runs once for the entire Job, regardless of containers or stops.'),
  ONCE_PER_STOP: t('Step runs once for each endpoint stop, even if that stop contains multiple containers.'),
  PER_CONTAINER_AT_STOP: t('Step runs separately for each container at each stop.'),
}

/** How often a step runs inside a Job: once, once per stop, or once per container at each stop. */
export function ScopeBadge({ scope, stopAction }: { scope?: string | null; stopAction?: string | null }) {
  if (!scope) return null
  const label = SCOPE_LABELS[scope] ?? scope
  const action = stopAction === 'PICKUP' ? t(' · Pickup') : stopAction === 'DROPOFF' ? t(' · Dropoff') : ''
  return (
    <span className="scope-badge" title={SCOPE_TOOLTIPS[scope] ?? scope}>
      {label}
      {action}
    </span>
  )
}
