import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { evidenceApi, type JournalListItem } from '@/shared/api/evidence'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatDateTime, formatRelativeTime, humanize } from '@/shared/lib/format'
import { usePaths } from '@/shared/routing/usePaths'
import { controlClass } from '@/shared/ui/controlClass'
import { Icon } from '@/shared/ui/Icon'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EVIDENCE_LABEL, EVIDENCE_TONE, VIDEO_LABEL, VIDEO_TONE } from './journalTones'
import { formatElapsed } from './replay/replayModel'

type Quick = 'all' | 'incidents' | 'ongoing' | 'complete' | 'incomplete'

const QUICK: { key: Quick; label: string; status?: string; severity?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'incidents', label: 'With incidents', severity: 'WARNING' },
  { key: 'ongoing', label: 'Recording', status: 'OPEN' },
  { key: 'complete', label: 'Complete', status: 'FINALIZED' },
  { key: 'incomplete', label: 'Incomplete', status: 'PARTIAL' },
]

/** Typed text is sent after a short pause, not on every key. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

/**
 * Transport journals (spec §11.2): one per transport request, newest first. The request's own status is shown as
 * Transportation states it; the evidence status says how complete the recording is — two different things.
 * A Technician only sees journals of robots in their scope (the server filters).
 */
export function JournalListPage() {
  const paths = usePaths()
  const [search, setSearch] = useState('')
  const [robot, setRobot] = useState('')
  const [quick, setQuick] = useState<Quick>('all')
  const [severity, setSeverity] = useState('')
  const [page, setPage] = useState(1)
  const searchQ = useDebounced(search)
  const robotQ = useDebounced(robot)
  const preset = QUICK.find((q) => q.key === quick)!
  const status = preset.status ?? ''
  const minSeverity = severity || preset.severity || ''
  const query = useQuery({
    queryKey: ['evidence-journals', searchQ, robotQ, status, minSeverity, page],
    queryFn: () => evidenceApi.searchJournals({ search: searchQ, robot: robotQ, status, severity: minSeverity, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const data = query.data
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-16 sm:px-10">
        <header className="mb-5">
          <h2 className="text-xl font-semibold">{t('Transport journals')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
            {t('Replay what the robots did during a transport request: video, path, plans and events on one timeline.')}
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-container p-1" role="radiogroup" aria-label={t('Show')}>
            {QUICK.map((q) => (
              <button
                key={q.key}
                type="button"
                role="radio"
                aria-checked={quick === q.key}
                onClick={() => {
                  setQuick(q.key)
                  setPage(1)
                }}
                className={cx(
                  'h-8 rounded-full px-3.5 text-xs font-semibold transition-colors',
                  quick === q.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t(q.label)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative">
              <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                className={cx(controlClass('pill'), 'pl-8')}
                placeholder={t('Request code')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <input
              className={controlClass('pill')}
              placeholder={t('Robot')}
              value={robot}
              onChange={(e) => {
                setRobot(e.target.value.toUpperCase())
                setPage(1)
              }}
            />
            <select
              className={controlClass('pill')}
              aria-label={t('Incidents')}
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value)
                setPage(1)
              }}
            >
              <option value="">{t('Any incident')}</option>
              <option value="WARNING">{t('With warnings')}</option>
              <option value="ERROR">{t('With errors')}</option>
              <option value="CRITICAL">{t('With critical')}</option>
            </select>
          </div>
        </div>

        {query.isError ? <p className="mb-4 rounded-sm bg-red-soft px-3 py-2 text-sm text-red-ink">{(query.error as Error).message}</p> : null}

        <ul className="flex flex-col gap-2">
          {query.isLoading
            ? Array.from({ length: 4 }, (_, i) => <li key={i} className="h-[76px] animate-pulse rounded-lg bg-container" />)
            : null}
          {data && data.items.length === 0 ? (
            <li className="flex flex-col items-center gap-2 rounded-lg bg-container px-6 py-12 text-center">
              <Icon name="history" size={24} className="text-muted" />
              <span className="text-sm font-semibold">{t('No journal yet.')}</span>
              <span className="max-w-md text-xs text-ink-2">
                {t('A journal is opened when a robot takes a trip of a transport request; its camera recording is added as it uploads.')}
              </span>
            </li>
          ) : null}
          {(data?.items ?? []).map((j) => (
            <li key={j.id}>
              <JournalRow journal={j} href={paths.journals(j.id)} />
            </li>
          ))}
        </ul>
        {data && pageCount > 1 ? <Pagination className="mt-4" page={data.page} pageCount={pageCount} onChange={setPage} /> : null}
      </div>
    </div>
  )
}

function JournalRow({ journal: j, href }: { journal: JournalListItem; href: string }) {
  const started = j.firstStartedAtUtc ? Date.parse(j.firstStartedAtUtc) : null
  const ended = j.lastEndedAtUtc ? Date.parse(j.lastEndedAtUtc) : null
  const incidents = Object.entries(j.incidentsBySeverity).filter(([, n]) => n > 0)
  const worst = ['CRITICAL', 'ERROR', 'WARNING'].find((s) => (j.incidentsBySeverity[s] ?? 0) > 0)
  const videoReady = j.videoAvailability === 'READY' || j.videoAvailability === 'PARTIAL'

  return (
    <Link
      to={href}
      className={cx(
        'group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-outline-soft bg-surface px-4 py-3 transition-colors hover:border-primary/40 hover:bg-container/60',
        'sm:grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]',
      )}
    >
      <span
        className={cx(
          'flex size-10 items-center justify-center rounded-full',
          videoReady ? 'bg-primary/10 text-primary' : 'bg-container-high text-muted',
        )}
        title={t(VIDEO_LABEL[j.videoAvailability] ?? j.videoAvailability)}
      >
        <Icon name={videoReady ? 'play' : j.videoAvailability === 'PROCESSING' ? 'refresh' : 'history'} size={16} />
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{j.requestCode}</span>
          <StatusBadge tone={EVIDENCE_TONE[j.evidenceStatus] ?? 'grey'}>{t(EVIDENCE_LABEL[j.evidenceStatus] ?? j.evidenceStatus)}</StatusBadge>
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-2">
          {j.sourceTransportStatus ? humanize(j.sourceTransportStatus) : '—'} · {t('{count} containers', { count: j.requestedContainerCount })}
        </div>
      </div>

      <div className="hidden min-w-0 flex-wrap gap-1 sm:flex">
        {j.robots.length === 0 ? <span className="text-xs text-muted">—</span> : null}
        {j.robots.map((code) => (
          <span key={code} className="rounded-full bg-container-high px-2 py-0.5 font-mono text-[11px]">
            {code}
          </span>
        ))}
      </div>

      <div className="hidden min-w-0 text-xs sm:block">
        <div className="text-ink" title={formatDateTime(j.firstStartedAtUtc)}>
          {j.firstStartedAtUtc ? formatRelativeTime(j.firstStartedAtUtc) : '—'}
        </div>
        <div className="text-ink-2">
          {started && ended ? formatElapsed(ended - started) : started ? t('ongoing') : ''}
          {' · '}
          <StatusText tone={VIDEO_TONE[j.videoAvailability]}>{t(VIDEO_LABEL[j.videoAvailability] ?? j.videoAvailability)}</StatusText>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {incidents.length > 0 ? (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              worst === 'WARNING' ? 'bg-amber-soft text-amber-ink' : 'bg-red-soft text-red-ink',
            )}
            title={incidents.map(([s, n]) => `${n} ${s}`).join(', ')}
          >
            <Icon name="alert" size={12} />
            {incidents.reduce((sum, [, n]) => sum + n, 0)}
          </span>
        ) : null}
        <Icon name="chevronRight" size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

function StatusText({ tone, children }: { tone: string | undefined; children: string }) {
  const color = tone === 'green' ? 'text-green-ink' : tone === 'amber' ? 'text-amber-ink' : tone === 'teal' ? 'text-teal-ink' : 'text-ink-2'
  return <span className={color}>{children}</span>
}
