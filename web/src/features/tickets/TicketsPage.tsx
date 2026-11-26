import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import { useAuth } from '@/features/auth/authContext'
import { listRobots } from '@/shared/api/fleet'
import { listTickets, TICKET_STATUSES, TICKET_TYPES, type TicketStatus, type TicketType } from '@/shared/api/tickets'
import { hasPermission, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime, formatRelativeTime } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/Field'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { controlClass } from '@/shared/ui/controlClass'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { CreateTicketDialog } from './CreateTicketDialog'
import { TicketDetail } from './TicketDetail'
import { RESULT_LABEL, RESULT_TONE, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from './ticketModel'

const PAGE_SIZE = 30

/**
 * Technical tickets (phiếu kỹ thuật) of every robot the reader may see: Technicians in their portal, Admins under
 * Operations. Filters live in the address; a ticket opens beside the list (/…/tickets/{id}).
 */
export function TicketsPage() {
  const paths = usePaths()
  const navigate = useNavigate()
  const { ticketId } = useParams()
  const { capabilities } = useAuth()
  const [params, setParams] = useSearchParams()
  const robotId = params.get('robotId') ?? ''
  const type = (params.get('type') ?? '') as TicketType | ''
  const status = (params.get('status') ?? '') as TicketStatus | ''
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const [creating, setCreating] = useState(false)

  const setParam = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )

  const robots = useQuery({ queryKey: ['fleet-robots', 'tickets'], queryFn: () => listRobots({ take: 100 }), staleTime: 60_000 })
  const robotItems = useMemo(() => [...(robots.data?.items ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [robots.data])
  const chosenRobot = robotItems.find((robot) => robot.id === robotId)
  const tickets = useQuery({
    queryKey: ['tickets', 'list', robotId, type, status, search, page],
    queryFn: () => listTickets({ robotId: robotId || undefined, type, status, search: search || undefined, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const items = tickets.data?.items ?? []
  const total = tickets.data?.total ?? 0
  const mayCreate = capabilities ? hasPermission(capabilities, PERMISSIONS.robotMaintenance) : false

  return (
    <div className="flex h-full overflow-hidden">
      <div className="h-full min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1100px] px-10 pt-8 pb-16">
          <SectionHead
            title={t('Technical tickets')}
            hint={t('Inspections, diagnoses, repairs, maintenance and reports of the robots: what was seen, what was done, the result.')}
          >
            {mayCreate ? (
              <Button
                variant="primary"
                disabled={!chosenRobot}
                title={chosenRobot ? undefined : t('Choose a robot first')}
                onClick={() => setCreating(true)}
              >{t('New ticket')}</Button>
            ) : null}
          </SectionHead>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select className={controlClass('pill')} aria-label={t('Robot')} value={robotId} onChange={(event) => setParam('robotId', event.target.value)}>
              <option value="">{t('All robots')}</option>
              {robotItems.map((robot) => (
                <option key={robot.id} value={robot.id}>{robot.code}</option>
              ))}
            </select>
            <select className={controlClass('pill')} aria-label={t('Kind')} value={type} onChange={(event) => setParam('type', event.target.value)}>
              <option value="">{t('All kinds')}</option>
              {TICKET_TYPES.map((value) => (
                <option key={value} value={value}>{TYPE_LABEL[value]}</option>
              ))}
            </select>
            <select className={controlClass('pill')} aria-label={t('Status')} value={status} onChange={(event) => setParam('status', event.target.value)}>
              <option value="">{t('Any status')}</option>
              {TICKET_STATUSES.map((value) => (
                <option key={value} value={value}>{STATUS_LABEL[value]}</option>
              ))}
            </select>
            <div className="w-64">
              <SearchInput value={search} onChange={(value) => setParam('q', value)} placeholder={t('Ticket, title, robot, findings…')} />
            </div>
          </div>

          <div className={cx('transition-opacity', tickets.isPlaceholderData && 'opacity-60')}>
            <Table>
              <thead>
                <tr>
                  <Th>{t('Ticket')}</Th>
                  <Th>{t('Robot')}</Th>
                  <Th>{t('Kind')}</Th>
                  <Th>{t('Status')}</Th>
                  <Th>{t('Opened')}</Th>
                  <Th>{t('By')}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <Tr
                    key={ticket.id}
                    className={cx('cursor-pointer', ticket.id === ticketId && 'bg-container')}
                    onClick={() => navigate(`${paths.tickets(ticket.id)}?${params.toString()}`)}
                  >
                    <Td className="align-top">
                      <div className="font-medium">{ticket.title}</div>
                      <div className="text-xs text-muted">{ticket.ticketNo}</div>
                    </Td>
                    <Td className="align-top">{ticket.robotCode}</Td>
                    <Td className="align-top">{TYPE_LABEL[ticket.type]}</Td>
                    <Td className="align-top">
                      <span className="flex flex-wrap gap-1">
                        <StatusBadge tone={STATUS_TONE[ticket.status]} withDot>{STATUS_LABEL[ticket.status]}</StatusBadge>
                        {ticket.result ? <StatusBadge tone={RESULT_TONE[ticket.result]}>{RESULT_LABEL[ticket.result]}</StatusBadge> : null}
                      </span>
                    </Td>
                    <Td tone="faint" className="align-top whitespace-nowrap">
                      <span title={formatIsoDateTime(ticket.createdAt)}>{formatRelativeTime(ticket.createdAt)}</span>
                    </Td>
                    <Td tone="faint" className="align-top">{ticket.createdByName ?? '—'}</Td>
                  </Tr>
                ))}
                {tickets.isLoading ? <EmptyRow colSpan={6}>{t('Loading…')}</EmptyRow> : null}
                {tickets.isError ? <EmptyRow colSpan={6}>{(tickets.error as Error).message}</EmptyRow> : null}
                {!tickets.isLoading && !tickets.isError && items.length === 0 ? (
                  <EmptyRow colSpan={6}>{t('No technical tickets yet.')}</EmptyRow>
                ) : null}
              </tbody>
            </Table>
          </div>
          {total > PAGE_SIZE ? (
            <div className="mt-6 flex justify-end">
              <Pagination page={page} pageCount={pageCountOf(total, PAGE_SIZE)} onChange={(next) => setParam('page', next > 1 ? String(next) : '')} />
            </div>
          ) : null}
        </div>
      </div>

      {ticketId ? (
        <aside className="h-full w-[480px] flex-none overflow-auto border-l border-outline-soft bg-surface">
          <TicketDetail key={ticketId} ticketId={ticketId} onClose={() => navigate(`${paths.tickets()}?${params.toString()}`)} />
        </aside>
      ) : null}

      {creating && chosenRobot ? (
        <CreateTicketDialog
          robotId={chosenRobot.id}
          robotCode={chosenRobot.code}
          onClose={() => setCreating(false)}
          onCreated={(ticket) => navigate(`${paths.tickets(ticket.id)}?${params.toString()}`)}
        />
      ) : null}
    </div>
  )
}
