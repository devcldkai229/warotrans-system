import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SectionHead } from '@/features/management/SectionHead'
import type { JobStatus } from '@/shared/api/contracts'
import { listRobots } from '@/shared/api/fleet'
import { listJobs, type JobSummaryDto } from '@/shared/api/jobs'
import { listTransportRequests } from '@/shared/api/transportRequests'
import { cx } from '@/shared/lib/cx'
import { formatIsoDateTime, formatRelativeTime, humanize } from '@/shared/lib/format'
import { pageCountOf } from '@/shared/lib/pagination'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import { useNotificationsHub } from '@/shared/realtime/useNotificationsHub'
import { controlClass } from '@/shared/ui/controlClass'
import { SearchInput } from '@/shared/ui/Field'
import { Meter } from '@/shared/ui/Meter'
import { Pagination } from '@/shared/ui/Pagination'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { JOB_STATUS_TONE } from '@/shared/ui/statusTones'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'

import { t } from '@/shared/i18n'
import { explainJobProblem, type ProblemTone } from './failureCatalog'
const PAGE_SIZE = 50
/** The Jobs endpoint turns at most 100 request ids into codes at a time; smaller chunks also stay cached page by page. */
const CODE_CHUNK = 50
const JOB_STATUSES = Object.keys(JOB_STATUS_TONE) as JobStatus[]

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

/** request id → request code, merged from every chunk that has loaded. */
function toCodeMap(results: { data?: { items: { id: string; requestCode: string }[] } }[]) {
  const codes = new Map<string, string>()
  for (const result of results) for (const item of result.data?.items ?? []) codes.set(item.id, item.requestCode)
  return codes
}

/**
 * WEB-FLEET-07: every Job in one place. Find one by its number or id, by status or by the robot that ran it, open it,
 * and watch the list change as Jobs move (the hub's jobUpdated). The filters live in the address, so a filtered view
 * can be shared and survives a reload.
 */
export function JobsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const status = (JOB_STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as JobStatus) : undefined
  const robotId = params.get('robot') ?? undefined
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)

  // A new search or filter starts again from page 1.
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

  // The box keeps what is typed; the address only follows once typing pauses. Reading the box back from the address
  // would drop keystrokes typed faster than the router updates it.
  const [text, setText] = useState(() => params.get('q') ?? '')
  const search = useDebouncedValue(text.trim(), 300) || undefined
  const addressSearch = params.get('q') ?? ''
  useEffect(() => {
    if (addressSearch !== (search ?? '')) setParam('q', search ?? '')
  }, [search, addressSearch, setParam])

  const jobs = useQuery({
    queryKey: ['jobs', 'list', search ?? '', status ?? '', robotId ?? '', page],
    queryFn: () => listJobs({ search, status, robotId, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    // Keep the old page on screen while the next one loads, instead of flashing "Loading".
    placeholderData: keepPreviousData,
    // The hub says "a Job moved"; the poll is the fallback while the connection is down.
    refetchInterval: 30_000,
  })

  const items = useMemo(() => jobs.data?.items ?? [], [jobs.data])
  const total = jobs.data?.total ?? 0
  const pageCount = pageCountOf(total, PAGE_SIZE)
  const firstShown = (page - 1) * PAGE_SIZE + 1

  // A page past the end (an old link, or Jobs gone since) moves to the last page there is.
  const settled = jobs.data !== undefined && !jobs.isPlaceholderData
  useEffect(() => {
    if (settled && page > pageCount) setParam('page', pageCount > 1 ? String(pageCount) : '')
  }, [settled, page, pageCount, setParam])

  const scroller = useRef<HTMLDivElement>(null)
  const goToPage = (target: number) => {
    setParam('page', target > 1 ? String(target) : '')
    scroller.current?.scrollTo({ top: 0 })
  }

  const robots = useQuery({ queryKey: ['fleet-robots', 'jobs-page'], queryFn: () => listRobots({ take: 100 }), staleTime: 30_000 })
  const robotCodes = useMemo(() => new Map((robots.data?.items ?? []).map((robot) => [robot.id, robot.code])), [robots.data])

  const requestIds = useMemo(() => [...new Set(items.flatMap((job) => job.transportRequestIds))], [items])
  const requestCodes = useQueries({
    queries: chunked(requestIds, CODE_CHUNK).map((ids) => ({
      queryKey: ['job-request-codes', ids.join(',')],
      queryFn: () => listTransportRequests({ ids, take: 200 }),
      staleTime: 5 * 60_000,
    })),
    combine: toCodeMap,
  })

  // Realtime: wait for the burst of events a Job's steps produce to settle, then refetch once.
  const refreshTimer = useRef<number | undefined>(undefined)
  const refresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['jobs', 'list'] }), 1000)
  }, [queryClient])
  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])
  const hubConnected = useNotificationsHub({ jobUpdated: refresh })
  // After a reconnect everything is refetched, so events missed while offline cannot leave the list stale.
  useEffect(() => {
    if (hubConnected) refresh()
  }, [hubConnected, refresh])

  const filtered = Boolean(search || status || robotId)

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <div className="mx-auto max-w-[1300px] px-10 pt-8 pb-16">
        <SectionHead title={t('Jobs')}>
          <div className="w-72">
            <SearchInput placeholder={t('Job number or id')} value={text} onChange={setText} />
          </div>
          <select
            className={controlClass('pill')}
            aria-label={t('Filter by status')}
            value={status ?? ''}
            onChange={(event) => setParam('status', event.target.value)}
          >
            <option value="">{t('All statuses')}</option>
            {JOB_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
          <select
            className={controlClass('pill')}
            aria-label={t('Filter by robot')}
            value={robotId ?? ''}
            onChange={(event) => setParam('robot', event.target.value)}
          >
            <option value="">{t('All robots')}</option>
            {(robots.data?.items ?? []).map((robot) => (
              <option key={robot.id} value={robot.id}>
                {robot.code}
              </option>
            ))}
          </select>
        </SectionHead>

        <div className={cx('transition-opacity duration-200', jobs.isPlaceholderData && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <Th>{t('Job')}</Th>
                <Th>{t('Status')}</Th>
                <Th>{t('Robot')}</Th>
                <Th>{t('Request')}</Th>
                <Th align="right">{t('Containers')}</Th>
                <Th>{t('Progress')}</Th>
                <Th>{t('Problem')}</Th>
                <Th>{t('Created')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  robotCode={job.assignedRobotId ? robotCodes.get(job.assignedRobotId) : undefined}
                  requestCodes={requestCodes}
                  onOpen={() => navigate(`/monitor/jobs/${job.id}`)}
                />
              ))}
              {jobs.isLoading ? <EmptyRow colSpan={8}>{t('Loading jobs…')}</EmptyRow> : null}
              {jobs.isError ? <EmptyRow colSpan={8}>{(jobs.error as Error).message || t('Could not load jobs.')}</EmptyRow> : null}
              {!jobs.isLoading && !jobs.isError && items.length === 0 ? (
                <EmptyRow colSpan={8}>{filtered ? t('No jobs match these filters.') : t('There are no jobs yet.')}</EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </div>

        {items.length > 0 ? (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              {t('Showing {from}–{to} of {total}', { from: firstShown, to: firstShown + items.length - 1, total })}
            </p>
            <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={goToPage} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// A cancelled Job carries its reason too, but somebody decided that: it is not a problem to chase.
const PROBLEM_TEXT: Record<ProblemTone, string> = { red: 'text-red-ink', amber: 'text-amber-ink', grey: 'text-ink-2' }

interface JobRowProps {
  job: JobSummaryDto
  robotCode: string | undefined
  requestCodes: Map<string, string>
  onOpen: () => void
}

function JobRow({ job, robotCode, requestCodes, onOpen }: JobRowProps) {
  const problem = explainJobProblem(job)
  const progress = job.totalSteps > 0 ? Math.round((job.completedSteps / job.totalSteps) * 100) : 0
  const shownRequests = job.transportRequestIds.slice(0, 2)
  const hidden = job.transportRequestIds.length - shownRequests.length

  return (
    <Tr onClick={onOpen}>
      <Td tone="strong">
        <Link to={`/monitor/jobs/${job.id}`} className="underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
          {job.jobNo}
        </Link>
      </Td>
      <Td>
        <StatusBadge tone={JOB_STATUS_TONE[job.status]} withDot>
          {job.status}
        </StatusBadge>
      </Td>
      <Td>
        {job.assignedRobotId ? (
          robotCode ? (
            <Link to={`/monitor/fleet/${robotCode}`} className="underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
              {robotCode}
            </Link>
          ) : (
            <span className="text-muted">{job.assignedRobotId.slice(0, 8)}</span>
          )
        ) : (
          <span className="text-muted">{t('Unassigned')}</span>
        )}
      </Td>
      <Td>
        {shownRequests.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="flex flex-wrap gap-x-2">
            {shownRequests.map((id) => (
              <Link key={id} to={`/monitor/requests?requestId=${id}`} className="underline-offset-2 hover:underline" onClick={(event) => event.stopPropagation()}>
                {requestCodes.get(id) ?? id.slice(0, 8)}
              </Link>
            ))}
            {hidden > 0 ? <span className="text-muted">+{hidden}</span> : null}
          </span>
        )}
      </Td>
      <Td align="right">{job.containerCount}</Td>
      <Td>
        <span className="flex items-center gap-2">
          <Meter percent={progress} tone={job.status === 'FAILED' ? 'red' : job.status === 'COMPLETED' ? 'green' : 'blue'} className="w-16" />
          <span className="text-xs text-muted tabular-nums">
            {job.completedSteps}/{job.totalSteps}
          </span>
        </span>
      </Td>
      <Td className="max-w-[220px]">
        {problem ? (
          // The meaning and the next step are in the tooltip; the Job's page has the whole explanation.
          <span title={`${problem.meaning} ${problem.next}`} className={PROBLEM_TEXT[problem.tone]}>
            {problem.title}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Td>
      <Td tone="faint" className="whitespace-nowrap tabular-nums">
        <span title={formatIsoDateTime(job.createdAt)}>{formatRelativeTime(job.createdAt)}</span>
      </Td>
    </Tr>
  )
}
