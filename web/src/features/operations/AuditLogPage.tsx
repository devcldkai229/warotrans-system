import { useCallback, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import { listAuditLogs, type AuditLogEntry } from '@/shared/api/operations'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime, jsonText } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import { SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Pagination } from '@/shared/ui/Pagination'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { t } from '@/shared/i18n'
const ENTITY_TYPES = ['', 'ACCOUNT', 'ROBOT', 'JOB', 'JOB_STEP', 'REQUEST', 'MAP', 'CONTAINER', 'ISSUE', 'WORKFLOW']
const PAGE_SIZE = 50

function changes(entry: AuditLogEntry): string {
  const keys = new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])
  return [...keys]
    .map((key) => {
      const before = entry.before?.[key]
      const after = entry.after?.[key]
      return before === undefined ? `${key}: ${jsonText(after)}` : `${key}: ${jsonText(before)} → ${jsonText(after)}`
    })
    .join(' · ')
}

/** SY-05 / OPS-02: who did what, newest first. A Technician sees their robots and their own actions only. */
export function AuditLogPage() {
  // Filters and page live in the address, so a reload or a shared link shows the same view.
  const [params, setParams] = useSearchParams()
  const entityType = ENTITY_TYPES.includes(params.get('entity') ?? '') ? (params.get('entity') ?? '') : ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)

  // A new filter starts again from page 1.
  const setParam = useCallback(
    (key: string, value: string) => {
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
    },
    [setParams],
  )

  // The box keeps what is typed; the address (and the query) only follow once typing pauses.
  const [text, setText] = useState(() => params.get('action') ?? '')
  const action = useDebouncedValue(text.trim(), 300)
  const addressAction = params.get('action') ?? ''
  useEffect(() => {
    if (addressAction !== action) setParam('action', action)
  }, [action, addressAction, setParam])

  const logs = useQuery({
    queryKey: ['audit-logs', addressAction, entityType, page],
    queryFn: () =>
      listAuditLogs({ action: addressAction || undefined, entityType: entityType || undefined, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    // Keep the old page on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
  const items = logs.data?.items ?? []
  const total = logs.data?.total ?? 0
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1

  // A page past the end (an old link) moves to the last page there is.
  const settled = logs.data !== undefined && !logs.isPlaceholderData
  useEffect(() => {
    if (settled && page > pageCount) setParam('page', pageCount > 1 ? String(pageCount) : '')
  }, [settled, page, pageCount, setParam])

  const scroller = useRef<HTMLDivElement>(null)
  const goToPage = (target: number) => {
    setParam('page', target > 1 ? String(target) : '')
    scroller.current?.scrollTo({ top: 0 })
  }

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <SectionHead title={t('Audit log')}>
          <SearchInput className="w-64" placeholder={t('Action prefix, e.g. account.')} value={text} onChange={setText} />
          <select
            className={controlClass('pill')}
            aria-label={t('Filter by entity')}
            value={entityType}
            onChange={(event) => setParam('entity', event.target.value)}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type || t('All entities')}
              </option>
            ))}
          </select>
        </SectionHead>
        <div className={cx('transition-opacity duration-200', logs.isPlaceholderData && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <Th>{t('When')}</Th>
                <Th>{t('Who')}</Th>
                <Th>{t('Action')}</Th>
                <Th>{t('Entity')}</Th>
                <Th>{t('Change')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <Tr key={entry.id}>
                  <Td tone="faint" className="whitespace-nowrap tabular-nums">
                    {formatIsoDateTime(entry.occurredAt)}
                  </Td>
                  <Td>
                    {entry.actorUsername ?? t('system')}
                    {entry.actorRole ? <span className="ml-1 text-xs text-muted">{entry.actorRole}</span> : null}
                  </Td>
                  <Td tone="strong">{entry.action}</Td>
                  <Td>
                    {entry.entityType}
                    {entry.entityId ? <span className="ml-1 font-mono text-xs text-muted">{entry.entityId.slice(0, 8)}</span> : null}
                  </Td>
                  <Td className="max-w-[520px] text-xs">
                    <span className="block truncate" title={changes(entry)}>
                      {entry.reason ? `“${entry.reason}” ` : ''}
                      {changes(entry)}
                    </span>
                  </Td>
                </Tr>
              ))}
              {logs.data && items.length === 0 ? <EmptyRow colSpan={5}>{t('Nothing recorded for this filter.')}</EmptyRow> : null}
              {logs.isLoading ? <EmptyRow colSpan={5}>{t('Loading…')}</EmptyRow> : null}
              {logs.isError ? <EmptyRow colSpan={5}>{t('Could not load the audit log.')}</EmptyRow> : null}
            </tbody>
          </Table>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {items.length > 0
              ? `${t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + items.length - 1, total })}. `
              : ''}
            {t('Passwords and tokens are never recorded.')}
          </p>
          <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
        </div>
      </div>
    </div>
  )
}
