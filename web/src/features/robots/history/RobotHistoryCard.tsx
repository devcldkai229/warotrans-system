import { useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import type { Robot } from '@/shared/api/contracts'
import { getRobotHistory } from '@/shared/api/fleet'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { formatDateTimeWithYear } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import {
  describeDetails,
  describeHistoryItem,
  filtersAreActive,
  HISTORY_SOURCES,
  historyQuery,
  historyStatus,
  NO_FILTERS,
  rangeIsBackwards,
  sourceApplies,
  sourceLabel,
  uniqueLines,
  type HistoryFilters,
} from './historyModel'

const PAGE_SIZE = 20

/**
 * WEB-FLEET-02: what a robot went through, newest first: its changes of state and the commands it was given. Filters by
 * kind, source and date are applied by the server, so the count and the paging stay right. Needs robot.read for this
 * robot; the server refuses the rest.
 */
export function RobotHistoryCard({ robot }: { robot: Pick<Robot, 'id' | 'code'> }) {
  const { capabilities } = useAuth()
  const allowed = canActOnRobot(capabilities, PERMISSIONS.robotRead, robot.id)
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS)
  // The page is kept here, not in the address: the card also sits in the Fleet robot panel, whose address is its own.
  const [page, setPage] = useState(1)
  // The Fleet panel keeps this card while another robot is picked: that robot's history starts on page 1.
  const [pageRobot, setPageRobot] = useState(robot.id)
  if (pageRobot !== robot.id) {
    setPageRobot(robot.id)
    setPage(1)
  }
  const backwards = rangeIsBackwards(filters)
  // A new filter starts again from page 1.
  const set = (change: Partial<HistoryFilters>) => {
    setFilters((current) => ({ ...current, ...change }))
    setPage(1)
  }

  const history = useQuery({
    queryKey: ['robot-history', robot.id, filters, page],
    queryFn: () => getRobotHistory(robot.id, historyQuery(filters, (page - 1) * PAGE_SIZE, PAGE_SIZE)),
    // Keep the old page on screen while the next one loads.
    placeholderData: keepPreviousData,
    enabled: allowed && !backwards,
    // No hub event says "the robot changed state", so the newest lines are looked for now and then.
    refetchInterval: 15_000,
    retry: false,
  })

  const items = useMemo(() => uniqueLines(history.data?.items ?? []), [history.data])
  const total = history.data?.total ?? 0
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1

  // New lines push older ones onto later pages; if this page is now past the end, show the last one there is.
  // Adjusted while rendering (React's pattern for state that follows other state), not in an effect.
  const settled = history.data !== undefined && !history.isPlaceholderData
  if (settled && page > pageCount) setPage(pageCount)

  const top = useRef<HTMLDivElement>(null)
  const goToPage = (target: number) => {
    setPage(target)
    top.current?.scrollIntoView({ block: 'nearest' })
  }

  if (!allowed) {
    return <p className="py-3 text-sm text-muted">{t('You do not have access to the history of this robot.')}</p>
  }

  return (
    <div ref={top} className="py-2">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('Show')}
          <select
            className={controlClass('sm', 'w-auto')}
            value={filters.kind}
            onChange={(event) => set({ kind: event.target.value as HistoryFilters['kind'] })}
          >
            <option value="">{t('State changes and commands')}</option>
            <option value="STATE">{t('State changes only')}</option>
            <option value="COMMAND">{t('Commands only')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('Source')}
          <select
            className={controlClass('sm', 'w-auto')}
            value={filters.source}
            disabled={!sourceApplies(filters)}
            title={sourceApplies(filters) ? undefined : t('Commands have no source.')}
            onChange={(event) => set({ source: event.target.value as HistoryFilters['source'] })}
          >
            <option value="">{t('Any source')}</option>
            {HISTORY_SOURCES.map((source) => (
              <option key={source} value={source}>
                {sourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('From')}
          <input
            type="date"
            className={controlClass('sm', 'w-auto')}
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={(event) => set({ fromDate: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('To')}
          <input
            type="date"
            className={controlClass('sm', 'w-auto')}
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={(event) => set({ toDate: event.target.value })}
          />
        </label>
        {filtersAreActive(filters) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(NO_FILTERS)
              setPage(1)
            }}
          >
            {t('Clear filters')}
          </Button>
        ) : null}
      </div>

      {backwards ? (
        <p role="alert" className="py-2 text-sm text-amber-ink">
          {t('The end date is before the start date.')}
        </p>
      ) : history.isError ? (
        <p role="alert" className="py-2 text-sm text-red-ink">
          {t('The history could not be loaded.')}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void history.refetch()}>
            {t('Try again')}
          </button>
        </p>
      ) : history.isPending ? (
        <p className="py-2 text-sm text-muted">{t('Loading…')}</p>
      ) : items.length === 0 ? (
        <p className="py-2 text-sm text-muted">
          {filtersAreActive(filters) ? t('Nothing in the history matches these filters.') : t('Nothing has been recorded for this robot yet.')}
        </p>
      ) : (
        <>
          <ol className={cx('transition-opacity duration-200', history.isPlaceholderData && 'opacity-60')}>
            {items.map((item) => {
              const badge = historyStatus(item)
              const source = sourceLabel(item.source)
              return (
                <li key={`${item.kind}|${item.occurredAt}|${item.commandId ?? ''}|${item.reason ?? ''}|${item.toStatus ?? ''}`} className="border-b border-outline-soft py-2.5 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm break-words text-ink">{describeHistoryItem(item)}</p>
                      {describeDetails(item) ? <p className="mt-0.5 text-xs break-words text-ink-2">{describeDetails(item)}</p> : null}
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTimeWithYear(item.occurredAt)}
                        {item.kind === 'COMMAND' ? ` · ${t('Command')}` : source ? ` · ${source}` : ''}
                        {item.jobId ? (
                          <>
                            {' · '}
                            <Link to={`/monitor/jobs/${item.jobId}`} className="underline-offset-2 hover:underline">
                              {t('Job')}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : null}
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + items.length - 1, total })}
            </p>
            <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
          </div>
        </>
      )}
    </div>
  )
}
