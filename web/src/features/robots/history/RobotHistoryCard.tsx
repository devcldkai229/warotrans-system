import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/authContext'
import type { Robot } from '@/shared/api/contracts'
import { getRobotHistory } from '@/shared/api/fleet'
import { canActOnRobot, PERMISSIONS } from '@/shared/auth/permissions'
import { t } from '@/shared/i18n'
import { formatDateTimeWithYear } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { controlClass } from '@/shared/ui/controlClass'
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
  const backwards = rangeIsBackwards(filters)
  const set = (change: Partial<HistoryFilters>) => setFilters((current) => ({ ...current, ...change }))

  const history = useInfiniteQuery({
    queryKey: ['robot-history', robot.id, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getRobotHistory(robot.id, historyQuery(filters, pageParam, PAGE_SIZE)),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0)
      return last.items.length > 0 && loaded < last.total ? loaded : undefined
    },
    enabled: allowed && !backwards,
    // No hub event says "the robot changed state", so the newest lines are looked for now and then.
    refetchInterval: 15_000,
    retry: false,
  })

  const items = useMemo(() => uniqueLines((history.data?.pages ?? []).flatMap((page) => page.items)), [history.data])
  const total = history.data?.pages[0]?.total ?? 0

  if (!allowed) {
    return <p className="py-3 text-sm text-muted">{t('You do not have access to the history of this robot.')}</p>
  }

  return (
    <div className="py-2">
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
          <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
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
          <ol>
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
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{t('Showing {shown} of {total}', { shown: items.length, total })}</p>
            {history.hasNextPage ? (
              <Button variant="outline" size="sm" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                {history.isFetchingNextPage ? t('Loading…') : t('Load more')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
