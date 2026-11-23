import { useCallback, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { usePaths } from '@/shared/routing/usePaths'
import { useAuth } from '@/features/auth/authContext'
import { SectionHead } from '@/features/management/SectionHead'
import { ApiError } from '@/shared/api/client'
import {
  assignIssue,
  getIssue,
  listIssues,
  transitionIssue,
  type Issue,
  type ContainerOutcome,
  type IssueSeverity,
  type IssueStatus,
  type IssueType,
} from '@/shared/api/operations'
import { CONTAINER_PROBLEMS, holdText, outcomeOptions, outcomeResult, problemLabel } from './containerProblems'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { cx } from '@/shared/lib/cx'
import { rangeWindow, presetRange } from '@/shared/lib/dateRange'
import { appToday, formatIsoDateTime } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { DateRangePicker } from '@/shared/ui/DateRangePicker'
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  clearIssueFilters,
  hasIssueFilters,
  readIssueFilters,
  writeReportedRange,
} from './issueFilters'
import { Button, IconButton } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'
import { Pagination } from '@/shared/ui/Pagination'
import { FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import type { Tone } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { t } from '@/shared/i18n'
const STATUS_TONE: Record<IssueStatus, Tone> = {

  OPEN: 'red',
  ACKNOWLEDGED: 'amber',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  CLOSED: 'grey',
}

const SEVERITY_TONE: Record<IssueSeverity, Tone> = { LOW: 'grey', MEDIUM: 'blue', HIGH: 'amber', CRITICAL: 'red' }
const TYPE_LABEL: Record<IssueType, string> = {
  CONTAINER: t('Container'),
  ROBOT: t('Robot'),
  JOB: t('Job'),
  TRANSPORT: t('Transport'),
  STORAGE: t('Storage'),
  OTHER: t('Other'),
}
const SEVERITY_LABEL: Record<IssueSeverity, string> = { LOW: t('Low'), MEDIUM: t('Medium'), HIGH: t('High'), CRITICAL: t('Critical') }
const PAGE_SIZE = 50

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'issue_version_conflict') return t('Someone else changed this issue. It has been reloaded; try again.')
    return error.message
  }
  return t('The issue could not be updated.')
}

/** OPS-01: issues reported from the floor and by workflow steps, with their lifecycle. */
export function IssuesPage() {
  const paths = usePaths()
  const { issueId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = appToday()
  const filters = readIssueFilters(params, today)
  const { type, severity, status, problem, reported } = filters
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
  // Opening or closing an issue keeps the page and the filter.
  const open = (id?: string) => navigate({ pathname: paths.issues(id), search: params.toString() })

  const list = useQuery({
    queryKey: ['issues', type, severity, status, problem, reported?.range.from ?? '', reported?.range.to ?? '', page],
    // The window is built when the request is sent, so a range that reaches today counts up to "now" on every refresh.
    queryFn: () => {
      const window = reported ? rangeWindow(reported.range) : null
      return listIssues({
        issueType: type,
        severity,
        status,
        problemCode: problem || undefined,
        reportedFrom: window?.from,
        reportedTo: window?.to,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      })
    },
    // Keep the old page on screen while the next one loads.
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const counts = list.data?.countsByType
  const allCount = counts ? ISSUE_TYPES.reduce((sum, key) => sum + (counts[key] ?? 0), 0) : null
  const chooseRange = (next: URLSearchParams) => setParams(next, { replace: true })
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1

  // A page past the end (an old link, or issues gone since) moves to the last page there is.
  const settled = list.data !== undefined && !list.isPlaceholderData
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
      {/* The detail column only exists while an issue is open; below xl it sits above the list instead of beside it. */}
      <div
        className={cx(
          'mx-auto px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-8',
          issueId ? 'grid max-w-[1500px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-8' : 'max-w-[1300px]',
        )}
      >
        <section className="min-w-0">
          <SectionHead title={t('Issues')}>
            <DateRangePicker
              preset={reported?.preset ?? null}
              range={reported?.range ?? presetRange('7d', today)}
              today={today}
              onChange={(choice) => chooseRange(writeReportedRange(params, choice))}
              anyTime={{
                label: t('Reported: any time'),
                selected: reported === null,
                onSelect: () => chooseRange(writeReportedRange(params, null)),
              }}
            />
          </SectionHead>

          {/* Type tabs: each count is under the other filters, so a tab says what it would show. */}
          <div className="-mx-1 mb-4 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 border-b border-outline-variant px-1" role="tablist" aria-label={t('Issue type')}>
              {([['', t('All'), allCount], ...ISSUE_TYPES.map((key) => [key, TYPE_LABEL[key], counts?.[key] ?? null])] as [
                IssueType | '',
                string,
                number | null,
              ][]).map(([key, label, count]) => (
                <button
                  key={key || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={type === key}
                  onClick={() => setParam('type', key)}
                  className={cx(
                    '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors duration-200',
                    type === key ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
                  )}
                >
                  {label}
                  {count !== null ? (
                    <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', count > 0 ? 'bg-container-high' : 'text-muted')}>
                      {count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              className={controlClass('pill')}
              aria-label={t('Filter by severity')}
              value={severity}
              onChange={(event) => setParam('severity', event.target.value)}
            >
              <option value="">{t('All severities')}</option>
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              className={controlClass('pill')}
              aria-label={t('Filter by status')}
              value={status}
              onChange={(event) => setParam('status', event.target.value)}
            >
              <option value="">{t('All statuses')}</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className={controlClass('pill')}
              aria-label={t('Filter by container problem')}
              value={problem}
              onChange={(event) => setParam('problem', event.target.value)}
            >
              <option value="">{t('All container problems')}</option>
              {CONTAINER_PROBLEMS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            {hasIssueFilters(filters) ? (
              <Button size="sm" variant="ghost" onClick={() => chooseRange(clearIssueFilters(params))}>
                {t('Clear filters')}
              </Button>
            ) : null}
          </div>
          <div className={cx('overflow-x-auto transition-opacity duration-200', list.isPlaceholderData && 'opacity-60')}>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>{t('Code')}</Th>
                  <Th>{t('Type')}</Th>
                  <Th>{t('Severity')}</Th>
                  <Th>{t('Description')}</Th>
                  <Th>{t('Reported')}</Th>
                  <Th>{t('Status')}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((issue) => (
                  <Tr
                    key={issue.id}
                    className={issue.id === issueId ? 'bg-container-high' : undefined}
                    onClick={() => open(issue.id)}
                  >
                    <Td tone="strong">
                      <button type="button" className="underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); open(issue.id) }}>
                        {issue.code}
                      </button>
                    </Td>
                    <Td>
                      {TYPE_LABEL[issue.issueType] ?? issue.issueType}
                      {issue.problemCode ? <span className="block text-xs text-muted">{problemLabel(issue.problemCode)}</span> : null}
                    </Td>
                    <Td>
                      <StatusBadge tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity] ?? issue.severity}</StatusBadge>
                    </Td>
                    <Td className="max-w-[360px] truncate">{issue.description}</Td>
                    <Td tone="faint" className="tabular-nums">
                      {formatIsoDateTime(issue.reportedAt)}
                    </Td>
                    <Td>
                      <StatusBadge tone={STATUS_TONE[issue.status]} withDot>
                        {issue.status}
                      </StatusBadge>
                    </Td>
                  </Tr>
                ))}
                {list.data && items.length === 0 ? (
                  <EmptyRow colSpan={6}>{hasIssueFilters(filters) || type ? t('No issues match these filters.') : t('No issues.')}</EmptyRow>
                ) : null}
                {list.isLoading ? <EmptyRow colSpan={6}>{t('Loading issues…')}</EmptyRow> : null}
                {list.isError ? <EmptyRow colSpan={6}>{t('Could not load issues.')}</EmptyRow> : null}
              </tbody>
            </Table>
          </div>
          {items.length > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-muted">
                {t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + items.length - 1, total })}
              </p>
              <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
            </div>
          ) : null}
        </section>
        {issueId ? (
          <aside className="order-first self-start xl:sticky xl:top-4 xl:order-none xl:max-h-[calc(100svh-7rem)] xl:overflow-y-auto xl:rounded-md">

            <IssueDetail id={issueId} onClose={() => open()} />
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function IssueDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const paths = usePaths()
  const queryClient = useQueryClient()
  const { account, can } = useAuth()
  const [resolution, setResolution] = useState('')
  const [outcome, setOutcome] = useState<ContainerOutcome | ''>('')
  const [quantity, setQuantity] = useState('')
  const [scanned, setScanned] = useState('')
  const [error, setError] = useState<string | null>(null)
  const issue = useQuery({ queryKey: ['issue', id], queryFn: () => getIssue(id) })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['issues'] })
    void queryClient.invalidateQueries({ queryKey: ['issue', id] })
  }
  const change = useMutation({
    mutationFn: (action: (current: Issue) => Promise<Issue>) => action(issue.data!),
    onSuccess: () => {
      setError(null)
      setResolution('')
      setOutcome('')
      setQuantity('')
      setScanned('')
      refresh()
    },
    onError: (failure) => {
      setError(describe(failure))
      refresh()
    },
  })

  if (issue.isLoading) return <p className="text-sm text-muted">{t('Loading…')}</p>
  if (!issue.data) return <p className="text-sm text-muted">{t('This issue is not available to you.')}</p>
  const current = issue.data
  const mayManage = can(PERMISSIONS.issueManage)
  const hold = current.containerHold ?? null
  // This issue holds the container: resolving it says what becomes of it.
  const holdsContainer = hold !== null && hold.holdIssueId === current.id
  const quantityValue = Number.parseFloat(quantity)
  const options = outcomeOptions(current.problemCode, current.containerOutcomes ?? [])
  // Partly damaged goods: what is left is less than the box held.
  const partly = current.problemCode === 'CONTENTS_DAMAGED'
  const quantityBad =
    outcome === 'ADJUST_QUANTITY' &&
    (!(quantityValue > 0) || (partly && hold?.contentsQuantity != null && quantityValue >= hold.contentsQuantity))
  const outcomeMissing = holdsContainer && (outcome === '' || quantityBad)
  // A wrong / missing container issue is resolved by scanning the expected container.
  const scanNeeded = Boolean(current.blocksHandover) && !holdsContainer

  return (
    <div className="rounded-md bg-surface p-5 shadow-float">
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-xl font-book">{current.code}</h2>
        <StatusBadge tone={STATUS_TONE[current.status]} withDot>
          {current.status}
        </StatusBadge>
        <IconButton size="sm" aria-label={t('Close')} onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap">{current.description}</p>
      <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted">{t('Type')}</dt>
        <dd>{current.issueType}</dd>
        <dt className="text-muted">{t('Severity')}</dt>
        <dd>{current.severity}</dd>
        {current.problemCode ? (
          <>
            <dt className="text-muted">{t('Problem')}</dt>
            <dd>
              {(current.defects?.length ? current.defects : [current.problemCode]).map(problemLabel).join(', ')}
              {current.blocksHandover ? <span className="ml-1.5 text-xs text-red-ink">{t('blocks confirm')}</span> : null}
              {current.removedFromJob ? <span className="block text-xs text-muted">{t('Taken off its Job')}</span> : null}
            </dd>
          </>
        ) : null}
        {hold ? (
          <>
            <dt className="text-muted">{t('Container')}</dt>
            <dd>
              <span className="font-mono">{hold.barcode}</span> · {holdText(hold.status, hold.holdReasonCode, current.containerOutcome)}
              <span className="block text-xs text-muted">
                {hold.storageLocationId
                  ? t('on its shelf (level {level})', { level: hold.levelNo ?? 1 })
                  : hold.holdEndpointId
                    ? t('at the point it was set down')
                    : t('on no shelf')}
                {hold.contentsQuantity !== null ? ` · ${hold.contentsQuantity} ${hold.contentsUnit ?? ''}` : ''}
                {holdsContainer ? ` · ${t('held by this issue')}` : ''}
              </span>
            </dd>
          </>
        ) : null}
        <dt className="text-muted">{t('Reported')}</dt>
        <dd>{formatIsoDateTime(current.reportedAt)}</dd>
        <dt className="text-muted">{t('Assignee')}</dt>
        <dd>{current.assigneeId ? (current.assigneeId === account?.id ? t('You') : current.assigneeId.slice(0, 8)) : t('Nobody')}</dd>
        {current.jobId ? (
          <>
            <dt className="text-muted">{t('Job')}</dt>
            <dd>
              <Link className="underline" to={paths.job(current.jobId)}>{t('open job')}</Link>
            </dd>
          </>
        ) : null}
        {current.containerOutcome ? (
          <>
            <dt className="text-muted">{t('Package')}</dt>
            <dd>{outcomeResult(current.containerOutcome, current.problemCode)}</dd>
          </>
        ) : null}
        {current.resolution ? (
          <>
            <dt className="text-muted">{t('Resolution')}</dt>
            <dd>{current.resolution}</dd>
          </>
        ) : null}
      </dl>

      {current.evidence.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {current.evidence.map((e, index) => (
            <li key={index} className="rounded-sm bg-container px-3 py-2">
              <span className="text-xs text-muted">{e.kind}</span>{' '}
              {e.uri ? (
                <a className="underline" href={e.uri} target="_blank" rel="noreferrer">
                  {e.note ?? e.uri}
                </a>
              ) : (
                e.note
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {mayManage && current.allowedTransitions.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2">
          {current.assigneeId !== account?.id && current.status !== 'CLOSED' ? (
            <Button size="sm" variant="surface" disabled={change.isPending} onClick={() => change.mutate((i) => assignIssue(i, account?.id ?? null))}>{t('Assign to me')}</Button>
          ) : null}
          {current.allowedTransitions.includes('RESOLVED') && holdsContainer ? (
            <fieldset className="rounded-sm border border-outline-soft p-3">
              <legend className="px-1 text-xs font-medium">{t('Deal with package {code}', { code: hold!.barcode })}</legend>
              <div className="flex flex-col gap-1.5">
                {options.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="container-outcome"
                      className="mt-1"
                      checked={outcome === o.value}
                      onChange={() => setOutcome(o.value)}
                    />
                    <span>
                      {o.label}
                      <span className="block text-xs text-muted">{o.hint}</span>
                    </span>
                  </label>
                ))}
                {outcome === 'ADJUST_QUANTITY' ? (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={controlClass('sm')}
                    placeholder={
                      partly && hold!.contentsQuantity != null
                        ? t('Goods still good ({unit}), less than {count}', { unit: hold!.contentsUnit ?? '', count: hold!.contentsQuantity })
                        : t('Counted quantity ({unit})', { unit: hold!.contentsUnit ?? '' })
                    }
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                ) : null}
                {outcome === 'ADJUST_QUANTITY' && quantity !== '' && quantityBad ? (
                  <p className="text-xs text-red-ink">
                    {partly
                      ? t('Enter fewer goods than the {count} the box holds.', { count: hold!.contentsQuantity ?? 0 })
                      : t('Enter a quantity above 0.')}
                  </p>
                ) : null}
              </div>
            </fieldset>
          ) : null}
          {current.allowedTransitions.includes('RESOLVED') && scanNeeded ? (
            <input
              className={controlClass('md')}
              placeholder={t('Scan the expected container (barcode)')}
              value={scanned}
              onChange={(event) => setScanned(event.target.value)}
            />
          ) : null}
          {current.allowedTransitions.includes('RESOLVED') ? (
            <textarea
              className={controlClass('md')}
              rows={2}
              placeholder={t('Resolution (required to resolve)')}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {current.allowedTransitions.map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === 'RESOLVED' ? 'primary' : 'surface'}
                disabled={
                  change.isPending ||
                  (next === 'RESOLVED' && (resolution.trim() === '' || outcomeMissing || (scanNeeded && scanned.trim() === ''))) ||
                  (next === 'CLOSED' && holdsContainer)
                }
                title={next === 'CLOSED' && holdsContainer ? t('Resolve it first and say what becomes of the container.') : undefined}
                onClick={() =>
                  change.mutate((i) =>
                    transitionIssue(
                      i,
                      next,
                      next === 'RESOLVED' ? resolution.trim() : undefined,
                      next === 'RESOLVED'
                        ? {
                            containerOutcome: holdsContainer && outcome ? outcome : undefined,
                            contentsQuantity: holdsContainer && outcome === 'ADJUST_QUANTITY' ? quantityValue : null,
                            scannedBarcode: scanNeeded ? scanned.trim() : undefined,
                          }
                        : undefined,
                    ),
                  )
                }
              >
                {next === 'IN_PROGRESS' && current.status === 'RESOLVED' ? t('Reopen') : next.replace('_', ' ').toLowerCase()}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </div>
  )
}
