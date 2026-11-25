import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { listTickets } from '@/shared/api/tickets'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatRelativeTime } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { CreateTicketDialog } from './CreateTicketDialog'
import { RESULT_LABEL, RESULT_TONE, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from './ticketModel'

/** The robot's technical tickets on its panel: the open ones first, the latest closed, and "New ticket". */
export function RobotTicketsCard({ robotId, robotCode }: { robotId: string; robotCode: string }) {
  const paths = usePaths()
  const navigate = useNavigate()
  const { capabilities } = useAuth()
  const [creating, setCreating] = useState(false)
  const tickets = useQuery({
    queryKey: ['tickets', 'robot', robotId],
    queryFn: () => listTickets({ robotId, take: 6 }),
    refetchInterval: 30_000,
  })
  const mayWrite = canActOnRobot(capabilities, PERMISSIONS.robotMaintenance, robotId)
  const items = [...(tickets.data?.items ?? [])].sort((a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN'))
  const open = items.filter((ticket) => ticket.status === 'OPEN').length

  return (
    <section className="mb-6 rounded-md bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {t('Technical tickets')}
          {open > 0 ? <span className="ml-2 text-xs text-amber-ink">{t('{count} open', { count: open })}</span> : null}
        </h2>
        <div className="flex gap-1.5">
          <Link className="rounded-sm px-2 py-1 text-xs text-ink-2 hover:bg-container-high" to={`${paths.tickets()}?robotId=${robotId}`}>{t('All')}</Link>
          {mayWrite ? <Button size="sm" variant="tonal" onClick={() => setCreating(true)}>{t('New ticket')}</Button> : null}
        </div>
      </div>
      {tickets.isError ? <p className="mt-2 text-xs text-red-ink">{(tickets.error as Error).message}</p> : null}
      {items.length === 0 && !tickets.isPending ? <p className="mt-2 text-xs text-muted">{t('No ticket for this robot yet.')}</p> : null}
      <ul className="mt-2 divide-y divide-outline-soft">
        {items.map((ticket) => (
          <li key={ticket.id}>
            <Link to={paths.tickets(ticket.id)} className="flex items-start justify-between gap-3 py-2 text-sm hover:text-ink">
              <span className="min-w-0">
                <span className="block truncate font-medium">{ticket.title}</span>
                <span className="block text-xs text-muted">
                  {ticket.ticketNo} · {TYPE_LABEL[ticket.type]} · {formatRelativeTime(ticket.createdAt)}
                </span>
              </span>
              <span className="flex flex-none gap-1">
                <StatusBadge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</StatusBadge>
                {ticket.result ? <StatusBadge tone={RESULT_TONE[ticket.result]}>{RESULT_LABEL[ticket.result]}</StatusBadge> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {creating ? (
        <CreateTicketDialog
          robotId={robotId}
          robotCode={robotCode}
          onClose={() => setCreating(false)}
          onCreated={(ticket) => navigate(paths.tickets(ticket.id))}
        />
      ) : null}
    </section>
  )
}
