import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { evidenceApi } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { formatDateTime } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { controlClass } from '@/shared/ui/controlClass'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { EVIDENCE_TONE, VIDEO_TONE } from './journalTones'

/**
 * Transport journals (spec §11.2): one per transport request, newest first. The request's own status is shown as
 * Transportation states it; the evidence status says how complete the recording is — two different things.
 * A Technician only sees journals of robots in their scope (the server filters).
 */
export function JournalListPage() {
  const paths = usePaths()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [robot, setRobot] = useState('')
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['evidence-journals', search, robot, status, severity, page],
    queryFn: () => evidenceApi.searchJournals({ search, robot, status, severity, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const data = query.data

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1200px] px-10 pt-8 pb-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-book">{t('Transport journals')}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{t('Replay what the robots did during a transport request: video, path, plans and events on one timeline.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className={controlClass('pill')} placeholder={t('Request code')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
            <input className={controlClass('pill')} placeholder={t('Robot')} value={robot} onChange={(e) => { setRobot(e.target.value.toUpperCase()); setPage(1) }} />
            <select className={controlClass('pill')} aria-label={t('Evidence')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="">{t('Any evidence status')}</option>
              {['OPEN', 'FINALIZING', 'FINALIZED', 'PARTIAL'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className={controlClass('pill')} aria-label={t('Incidents')} value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }}>
              <option value="">{t('Any incident')}</option>
              <option value="WARNING">{t('With warnings')}</option>
              <option value="ERROR">{t('With errors')}</option>
              <option value="CRITICAL">{t('With critical')}</option>
            </select>
          </div>
        </header>

        {query.isError ? <p className="mb-4 text-sm text-red-700">{(query.error as Error).message}</p> : null}
        <Table>
          <thead>
            <tr>
              <Th>{t('Request')}</Th>
              <Th>{t('Robots')}</Th>
              <Th>{t('Time')}</Th>
              <Th>{t('Request status')}</Th>
              <Th>{t('Evidence')}</Th>
              <Th>{t('Incidents')}</Th>
              <Th>{t('Video')}</Th>
            </tr>
          </thead>
          <tbody>
            {data && data.items.length === 0 ? <EmptyRow colSpan={7}>{t('No journal yet.')}</EmptyRow> : null}
            {(data?.items ?? []).map((j) => (
              <Tr key={j.id} onClick={() => navigate(paths.journals(j.id))}>
                <Td>
                  <span className="font-medium">{j.requestCode}</span>
                  <div className="text-xs text-ink-2">{t('{count} containers', { count: j.requestedContainerCount })}</div>
                </Td>
                <Td>{j.robots.join(', ') || '—'}</Td>
                <Td>
                  {formatDateTime(j.firstStartedAtUtc)}
                  <div className="text-xs text-ink-2">→ {j.lastEndedAtUtc ? formatDateTime(j.lastEndedAtUtc) : t('ongoing')}</div>
                </Td>
                <Td>{j.sourceTransportStatus ?? '—'}</Td>
                <Td>
                  <StatusBadge tone={EVIDENCE_TONE[j.evidenceStatus] ?? 'grey'}>{j.evidenceStatus}</StatusBadge>
                </Td>
                <Td>
                  {Object.entries(j.incidentsBySeverity).length === 0
                    ? '—'
                    : Object.entries(j.incidentsBySeverity).map(([s, n]) => `${n} ${s}`).join(', ')}
                </Td>
                <Td>
                  <StatusBadge tone={VIDEO_TONE[j.videoAvailability] ?? 'grey'}>{j.videoAvailability}</StatusBadge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {data ? <Pagination className="mt-4" page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} /> : null}
      </div>
    </div>
  )
}
