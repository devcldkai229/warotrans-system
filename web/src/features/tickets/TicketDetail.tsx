import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/shared/api/client'
import {
  addTicketAction,
  cancelTicket,
  completeTicket,
  getTicket,
  TICKET_RESULTS,
  updateTicket,
  type TechnicalTicket,
  type TicketChecklistItem,
  type TicketResult,
} from '@/shared/api/tickets'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatIsoDateTime } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { Button } from '@/shared/ui/Button'
import { FormError } from '@/shared/ui/Field'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { controlClass } from '@/shared/ui/controlClass'
import { RESULT_LABEL, RESULT_TONE, snapshotSummary, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from './ticketModel'

/**
 * One technical ticket: what was seen, what was done (a log, newest last), the checklist, the result. While it is open
 * a Technician adds actions, ticks the checklist and closes it with a result; Admins read the same page.
 */
export function TicketDetail({ ticketId, onClose }: { ticketId: string; onClose?: () => void }) {
  const paths = usePaths()
  const queryClient = useQueryClient()
  const { capabilities } = useAuth()
  const ticket = useQuery({ queryKey: ['tickets', 'one', ticketId], queryFn: () => getTicket(ticketId) })
  const [action, setAction] = useState('')
  const [findings, setFindings] = useState('')
  const [checklist, setChecklist] = useState<TicketChecklistItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [result, setResult] = useState<TicketResult>('PASSED')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ticket.data) {
      setFindings(ticket.data.findings ?? '')
      setChecklist(ticket.data.checklist)
    }
  }, [ticket.data])

  const saved = (next: TechnicalTicket) => {
    setError(null)
    queryClient.setQueryData(['tickets', 'one', ticketId], next)
    void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    void queryClient.invalidateQueries({ queryKey: ['robot-history'] })
  }
  const failed = (failure: unknown) => setError(failure instanceof ApiError ? failure.message : t('The ticket could not be saved.'))
  const log = useMutation({ mutationFn: () => addTicketAction(ticketId, action), onSuccess: (next) => { setAction(''); saved(next) }, onError: failed })
  const save = useMutation({ mutationFn: () => updateTicket(ticketId, { findings, checklist }), onSuccess: saved, onError: failed })
  const complete = useMutation({ mutationFn: () => completeTicket(ticketId, { result, findings, checklist }), onSuccess: saved, onError: failed })
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelTicket(ticketId, reason),
    onSuccess: saved,
    onError: failed,
  })

  if (ticket.isPending) return <p className="p-6 text-sm text-muted">{t('Loading…')}</p>
  if (ticket.isError) return <p className="p-6 text-sm text-red-ink">{(ticket.error as Error).message}</p>
  const data = ticket.data
  const open = data.status === 'OPEN'
  const mayWrite = canActOnRobot(capabilities, PERMISSIONS.robotMaintenance, data.robotId) && open
  const byMaintenance = data.maintenanceRecordId !== null
  const dirty = findings !== (data.findings ?? '') || JSON.stringify(checklist) !== JSON.stringify(data.checklist)
  const summary = snapshotSummary(data)

  return (
    <article className="flex flex-col gap-5 p-6 text-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            {data.ticketNo} · {TYPE_LABEL[data.type]}
          </p>
          <h2 className="mt-1 text-xl font-book">{data.title}</h2>
          <p className="mt-1 text-xs text-ink-2">
            <Link className="underline underline-offset-2" to={paths.fleet(data.robotCode)}>{data.robotCode}</Link>
            {' · '}
            {t('opened by {who} {when}', { who: data.createdByName ?? '—', when: formatIsoDateTime(data.createdAt) })}
            {data.completedAt
              ? ` · ${t('closed by {who} {when}', { who: data.completedByName ?? '—', when: formatIsoDateTime(data.completedAt) })}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={STATUS_TONE[data.status]} withDot>{STATUS_LABEL[data.status]}</StatusBadge>
          {data.result ? <StatusBadge tone={RESULT_TONE[data.result]}>{RESULT_LABEL[data.result]}</StatusBadge> : null}
          {onClose ? <Button size="sm" variant="ghost" onClick={onClose}>{t('Close')}</Button> : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link className="rounded-full bg-container-high px-2.5 py-1" to={paths.robotTechnical(data.robotCode)}>{t('Technical')}</Link>
        <Link className="rounded-full bg-container-high px-2.5 py-1" to={paths.robotHistory(data.robotCode)}>{t('Robot history')}</Link>
        {data.jobId ? <Link className="rounded-full bg-container-high px-2.5 py-1" to={paths.job(data.jobId)}>{t('Job')}</Link> : null}
        {data.issueId ? <Link className="rounded-full bg-container-high px-2.5 py-1" to={paths.issues(data.issueId)}>{t('Issue')}</Link> : null}
      </div>

      {data.description ? (
        <section>
          <h3 className="text-xs font-medium text-muted">{t('What was seen / why')}</h3>
          <p className="mt-1 whitespace-pre-line">{data.description}</p>
        </section>
      ) : null}
      {summary ? (
        <section>
          <h3 className="text-xs font-medium text-muted">{t('Robot when the ticket was opened')}</h3>
          <p className="mt-1 text-ink-2">{summary}</p>
        </section>
      ) : null}

      <section>
        <h3 className="text-xs font-medium text-muted">{t('Actions done')}</h3>
        {data.actions.length === 0 ? (
          <p className="mt-1 text-muted">{t('Nothing logged yet.')}</p>
        ) : (
          <ol className="mt-1 divide-y divide-outline-soft">
            {data.actions.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="py-2">
                <p className="whitespace-pre-line">{entry.text}</p>
                <p className="text-[11px] text-muted">{formatIsoDateTime(entry.at)} · {entry.byName ?? '—'}</p>
              </li>
            ))}
          </ol>
        )}
        {mayWrite ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (action.trim()) log.mutate()
            }}
          >
            <input
              className={controlClass('md', 'flex-1')}
              value={action}
              maxLength={1000}
              placeholder={t('e.g. Cleaned the lidar window, restarted Nav2')}
              onChange={(event) => setAction(event.target.value)}
            />
            <Button type="submit" size="sm" variant="tonal" disabled={!action.trim() || log.isPending}>{t('Log')}</Button>
          </form>
        ) : null}
      </section>

      <section>
        <h3 className="text-xs font-medium text-muted">{t('Checklist')}</h3>
        {checklist.length === 0 && !mayWrite ? <p className="mt-1 text-muted">—</p> : null}
        <ul className="mt-1 flex flex-col gap-1">
          {checklist.map((item, index) => (
            <li key={`${item.item}-${index}`} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.ok}
                disabled={!mayWrite}
                onChange={(event) =>
                  setChecklist((current) => current.map((row, i) => (i === index ? { ...row, ok: event.target.checked } : row)))
                }
              />
              <span className={item.ok ? 'text-ink' : 'text-ink-2'}>{item.item}</span>
            </li>
          ))}
        </ul>
        {mayWrite ? (
          <div className="mt-2 flex gap-2">
            <input
              className={controlClass('md', 'flex-1')}
              value={newItem}
              maxLength={200}
              placeholder={t('Add a check…')}
              onChange={(event) => setNewItem(event.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!newItem.trim()}
              onClick={() => {
                setChecklist((current) => [...current, { item: newItem.trim(), ok: false }])
                setNewItem('')
              }}
            >{t('Add')}</Button>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="text-xs font-medium text-muted">{t('Findings / cause')}</h3>
        {mayWrite ? (
          <textarea
            className={controlClass('area', 'mt-1 min-h-24')}
            value={findings}
            maxLength={4000}
            onChange={(event) => setFindings(event.target.value)}
          />
        ) : (
          <p className="mt-1 whitespace-pre-line">{data.findings || '—'}</p>
        )}
      </section>

      {error ? <FormError>{error}</FormError> : null}

      {mayWrite ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-outline-soft pt-4">
          <Button size="sm" variant="tonal" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{t('Save')}</Button>
          {byMaintenance ? (
            <p className="text-xs text-muted">{t('This ticket closes when the robot returns to service (Control ▸ Return to service).')}</p>
          ) : (
            <>
              <select className={controlClass('pill')} value={result} onChange={(event) => setResult(event.target.value as TicketResult)} aria-label={t('Result')}>
                {TICKET_RESULTS.map((value) => (
                  <option key={value} value={value}>{RESULT_LABEL[value]}</option>
                ))}
              </select>
              <Button size="sm" variant="primary" disabled={complete.isPending} onClick={() => complete.mutate()}>{t('Complete ticket')}</Button>
              <Button
                size="sm"
                variant="dangerGhost"
                disabled={cancel.isPending}
                onClick={() => {
                  const reason = window.prompt(t('Why is this ticket cancelled?'))
                  if (reason?.trim()) cancel.mutate(reason.trim())
                }}
              >{t('Cancel ticket')}</Button>
            </>
          )}
        </footer>
      ) : null}
    </article>
  )
}
