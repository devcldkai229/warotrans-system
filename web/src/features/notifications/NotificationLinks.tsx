import { Link } from 'react-router-dom'
import type { NotificationLink } from '@/shared/api/contracts'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import type { ConsolePaths } from '@/shared/routing/consolePaths'

/** The label of a link, worded from its kind ("Robot RBT-002", "Job J251126039", "History"). */
export function notificationLinkLabel(link: NotificationLink): string {
  switch (link.kind) {
    case 'ROBOT':
      return t('Robot {code}', { code: link.text })
    case 'TECHNICAL':
      return t('Technical')
    case 'HISTORY':
      return t('Robot history')
    case 'JOB':
      return t('Job {code}', { code: link.text })
    case 'REQUEST':
      return t('Request {code}', { code: link.text })
    case 'JOURNAL':
      return t('Replay')
    case 'ISSUE':
      return t('Issue {code}', { code: link.text })
    case 'TICKET':
      return t('Ticket {code}', { code: link.text })
    default:
      return link.text
  }
}

/**
 * The places a notification leads to besides its main one, as small chips. Each route is rewritten into the portal
 * shown (a Technician has no transport request screen, so that chip is left out).
 */
export function NotificationLinks({
  links,
  paths,
  onOpen,
  className,
}: {
  links: NotificationLink[] | null | undefined
  paths: Pick<ConsolePaths, 'translate'>
  onOpen?: () => void
  className?: string
}) {
  const shown = (links ?? [])
    .map((link) => ({ link, to: paths.translate(link.route) }))
    .filter((entry): entry is { link: NotificationLink; to: string } => entry.to !== null)
  if (shown.length === 0) return null
  return (
    <span className={cx('flex flex-wrap gap-1.5', className)}>
      {shown.map(({ link, to }) => (
        <Link
          key={to}
          to={to}
          onClick={(event) => {
            event.stopPropagation()
            onOpen?.()
          }}
          className="rounded-full border border-outline-soft bg-surface px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:bg-container-high hover:text-ink"
        >
          {notificationLinkLabel(link)}
        </Link>
      ))}
    </span>
  )
}
